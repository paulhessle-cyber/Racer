'use strict';
/**
 * Adds the Formintel late-money recorder to the odds proxy. Run it once from
 * the proxy's folder (the one with server.js), after downloading late.js and
 * this file into it:
 *
 *     cd /root/formintel-proxy
 *     curl -fsSLO https://raw.githubusercontent.com/paulhessle-cyber/Racer/main/server/late.js
 *     curl -fsSLO https://raw.githubusercontent.com/paulhessle-cyber/Racer/main/server/install-late.js
 *     node install-late.js
 *
 * It backs up server.js first, checks the edited file before saving it, and
 * does nothing if the recorder is already in. Then restart the proxy.
 */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const dir = __dirname;
const serverFile = path.join(dir, 'server.js');
const lateFile = path.join(dir, 'late.js');

function say(s) { console.log(s); }
function stop(s) { console.error('✗ ' + s); process.exit(1); }

if (!fs.existsSync(serverFile)) stop('No server.js here (' + dir + '). Put late.js and this file in the proxy folder and run it from there.');
if (!fs.existsSync(lateFile)) stop('late.js is missing — download it into ' + dir + ' first.');

// The proxy's .env (FI_LATE_DIR, PORT), as server.js reads it
try {
  fs.readFileSync(path.join(dir, '.env'), 'utf8').split('\n').forEach((line) => {
    const t = line.trim(), eq = t.indexOf('=');
    if (!t || t[0] === '#' || eq === -1) return;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    if (!(k in process.env)) process.env[k] = v;
  });
} catch (e) {}

// 1. Where the prices will be saved
try {
  const d = require(lateFile).diagnose();
  if (!d.writable) stop('Can\'t write to ' + d.dir + '. Add FI_LATE_DIR=/a/folder/it/can/write to .env, or fix that folder\'s permissions, then run this again.');
  say('✓ Prices will be saved in ' + d.dir + (d.days ? ' (' + d.days + ' day' + (d.days === 1 ? '' : 's') + ' there already, from ' + d.firstDay + ')' : ''));
} catch (e) { stop('late.js failed to load: ' + e.message); }

// 2. Patch server.js
let s = fs.readFileSync(serverFile, 'utf8');
const hasReq = /require\(['"]\.\/late(\.js)?['"]\)/.test(s);
const hasRoute = /path === ['"]\/late['"]/.test(s);
const hasStart = /fiLate\.start\(/.test(s);

if (hasReq && hasRoute && hasStart) {
  say('✓ server.js already has the late-money recorder — nothing to change.');
} else {
  if (!/function\s+betfairRpc\s*\(/.test(s)) {
    stop('Couldn\'t find betfairRpc() in server.js — the recorder uses it to share the proxy\'s Betfair login. Nothing was changed.');
  }
  if (!/const\s+path\s*=\s*parsed\.pathname/.test(s) || !/const\s+q\s*=\s*parsed\.query/.test(s)) {
    say('⚠ server.js doesn\'t name the request path "path" and the query "q" as expected — checking anyway.');
  }

  if (!hasReq) {
    // after the last of the first block of require lines
    const lines = s.split('\n');
    let at = -1;
    for (let i = 0; i < Math.min(lines.length, 120); i++) if (/^\s*const\s+\w+\s*=\s*require\(/.test(lines[i])) at = i;
    if (at === -1) stop('Couldn\'t find the require lines at the top of server.js. Nothing was changed.');
    lines.splice(at + 1, 0, "const fiLate = require('./late');   // Formintel late-money recorder (/late)");
    s = lines.join('\n');
  }

  if (!hasRoute) {
    const route =
      "    // GET /late?days=60 — Betfair prices in each race's last minutes, BSP and result\n" +
      "    if (path === '/late') {\n" +
      "      const out = await fiLate.handle(q, req.headers);\n" +
      "      Object.keys(out.headers).forEach((h) => res.setHeader(h, out.headers[h]));\n" +
      "      res.writeHead(out.status);\n" +
      "      res.end(out.body);\n" +
      "      return;\n" +
      "    }\n\n";
    const anchors = [/^([ \t]*)if \(path === ['"]\/meetings['"]\)/m, /^([ \t]*)if \(path === ['"]\/odds['"]\)/m, /^([ \t]*)if \(path === ['"]\/health['"]\)/m];
    let done = false;
    for (let i = 0; i < anchors.length && !done; i++) {
      const m = s.match(anchors[i]);
      if (m) { s = s.slice(0, m.index) + route + s.slice(m.index); done = true; }
    }
    if (!done) stop('Couldn\'t find where the routes are in server.js (looked for /meetings, /odds, /health). Nothing was changed.');
  }

  if (!hasStart) {
    const startLines =
      "// Formintel late-money recorder: Betfair prices in each race's last minutes, BSP and result\n" +
      "fiLate.start({ rpc: betfairRpc });\n\n";
    const m = s.match(/^server\.listen\(/m);
    if (m) s = s.slice(0, m.index) + startLines + s.slice(m.index);
    else s = s.replace(/\s*$/, '\n\n') + startLines;
  }

  // check before saving
  const backup = serverFile + '.before-late';
  const tmp = path.join(dir, '.server.late-check.js');
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
say('Then check it (give it a minute):   curl -s "http://localhost:' + (process.env.PORT || '3001') + '/late?status=1"');
say('It records every British and Irish race from now on; the checker\'s Late Money tab shows the results.');
