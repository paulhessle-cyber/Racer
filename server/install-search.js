'use strict';
/**
 * Adds the Formintel /search route to the odds proxy. Run it once from the
 * proxy's folder (the one with server.js and search.js):
 *
 *     node install-search.js
 *
 * It backs up server.js first, checks the edited file before saving it, and
 * does nothing if the route is already there. Then restart the proxy.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const dir = __dirname;
const serverFile = path.join(dir, 'server.js');
const searchFile = path.join(dir, 'search.js');

function say(s) { console.log(s); }
function stop(s) { console.error('✗ ' + s); process.exit(1); }

if (!fs.existsSync(serverFile)) stop('No server.js here (' + dir + '). Put search.js and this file in the proxy folder and run it from there.');

// The proxy's .env (RP_DATA_DIR, FI_HISTORY_DIR, PORT), as server.js reads it
try {
  fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n').forEach((line) => {
    const t = line.trim(), eq = t.indexOf('=');
    if (!t || t[0] === '#' || eq === -1) return;
    const k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(k in process.env)) process.env[k] = v;
  });
} catch (e) {}
if (!fs.existsSync(searchFile)) stop('search.js is missing — download it into ' + dir + ' first.');

// 1. Where the results are
try {
  const d = require(searchFile).diagnose();
  if (d.dailyFiles) {
    say('✓ Found ' + d.dailyFiles + ' daily result files, ' + d.dailyFrom + ' to ' + d.dailyTo + ' (' +
        Object.keys(d.regions).map((r) => r + ' ' + d.regions[r]).join(', ') + ')');
  } else {
    say('⚠ No daily result files found. Looked in:\n   ' + d.lookedIn.join('\n   ') +
        '\n  If the nightly scrape saves them elsewhere, add RP_DATA_DIR=/that/folder/data/region to .env');
  }
  say(d.history ? '✓ History file: ' + d.history.file + ' (' + d.history.sizeMB + ' MB)'
                : '· No history file yet (optional — horse searches then go back to the first daily file)');
} catch (e) { stop('search.js failed to load: ' + e.message); }

// 2. Patch server.js
let s = fs.readFileSync(serverFile, 'utf8');
if (/require\(['"]\.\/search(\.js)?['"]\)/.test(s) && /path === ['"]\/search['"]/.test(s)) {
  say('✓ server.js already has the /search route — nothing to change.');
} else {
  if (!/const\s+path\s*=\s*parsed\.pathname/.test(s) || !/const\s+q\s*=\s*parsed\.query/.test(s)) {
    say('⚠ server.js doesn\'t name the request path "path" and the query "q" as expected — checking anyway.');
  }
  const reqLine = "const rpSearch = require('./search');   // Formintel /search (horse, jockey, trainer)\n";
  if (!/require\(['"]\.\/search(\.js)?['"]\)/.test(s)) {
    // after the last of the first block of require lines
    const lines = s.split('\n');
    let at = -1;
    for (let i = 0; i < Math.min(lines.length, 120); i++) if (/^\s*const\s+\w+\s*=\s*require\(/.test(lines[i])) at = i;
    if (at === -1) stop('Couldn\'t find the require lines at the top of server.js.');
    lines.splice(at + 1, 0, reqLine.replace(/\n$/, ''));
    s = lines.join('\n');
  }
  const route =
    "    // GET /search?by=horse|jockey|trainer&q=name&n=10 — last runs from the result files\n" +
    "    if (path === '/search') {\n" +
    "      const data = await rpSearch.handleSearch(q);\n" +
    "      res.writeHead(200);\n" +
    "      res.end(JSON.stringify(data));\n" +
    "      return;\n" +
    "    }\n\n";
  const anchors = [/^([ \t]*)if \(path === ['"]\/meetings['"]\)/m, /^([ \t]*)if \(path === ['"]\/odds['"]\)/m, /^([ \t]*)if \(path === ['"]\/health['"]\)/m];
  let done = false;
  for (let i = 0; i < anchors.length && !done; i++) {
    const m = s.match(anchors[i]);
    if (m) { s = s.slice(0, m.index) + route + s.slice(m.index); done = true; }
  }
  if (!done) stop('Couldn\'t find where the routes are in server.js (looked for /meetings, /odds, /health). Nothing was changed.');

  // check before saving
  const backup = serverFile + '.before-search';
  const tmp = path.join(dir, '.server.search-check.js');
  fs.writeFileSync(tmp, s);
  try { cp.execFileSync(process.execPath, ['--check', tmp], { stdio: 'pipe' }); }
  catch (e) { try { fs.unlinkSync(tmp); } catch (x) {} stop('The edited server.js wouldn\'t run, so it was NOT saved:\n' + String(e.stderr || e.message)); }
  try { fs.unlinkSync(tmp); } catch (x) {}
  fs.copyFileSync(serverFile, backup);
  fs.writeFileSync(serverFile, s);
  say('✓ server.js updated (the old one is saved as ' + path.basename(backup) + ')');
}

// 3. How to restart
let unit = '';
try {
  const out = cp.execSync('systemctl list-units --type=service --all --no-legend --plain 2>/dev/null', { encoding: 'utf8' });
  const hit = out.split('\n').map((l) => l.trim().split(/\s+/)[0]).filter(Boolean)
    .filter((u) => /formintel|proxy|odds/i.test(u));
  if (hit.length) unit = hit[0];
} catch (e) {}
let pm2 = false;
if (!unit) { try { cp.execSync('pm2 jlist', { stdio: 'pipe' }); pm2 = true; } catch (e) {} }
say('\nNow restart the proxy:');
say(unit ? '   systemctl restart ' + unit
         : pm2 ? '   pm2 restart all' : '   (restart it the way you normally do — e.g. systemctl restart <service name>)');
say('Then test it:   curl -s "http://localhost:' + (process.env.PORT || '3001') + '/search?by=jockey&q=harry%20skelton" | head -c 400');
