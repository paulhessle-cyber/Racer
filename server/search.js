'use strict';
/**
 * Formintel — /search for the odds proxy
 * ---------------------------------------
 * GET /search?by=horse|jockey|trainer&q=Harry%20Skelton&n=10
 *   → { ok, by, q, name, runs: [...newest first], others: [{ name, runs }],
 *       from, to, days, history }
 *
 * Reads the result files the nightly rpscrape job already saves on this
 * droplet (rpscrape-community/data/region/<gb|ire>/all/YYYY_MM_DD.csv), newest
 * first, and stops as soon as it has enough. For runs before the nightly
 * files began, it also reads an optional history file exported from the
 * trainer (~/formintel-history/history.csv.gz, newest first).
 *
 * Race comments are not sent: each run carries the running style read from
 * the comment instead (4 led, 3 prominent, 2 midfield, 1 held up, 0 unknown).
 *
 * Install with:  node install-search.js   (adds the route to server.js)
 * Override the folders with RP_DATA_DIR / FI_HISTORY_DIR in .env if needed.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const readline = require('readline');

// Read when used, not when loaded: server.js loads its .env after its requires
const HOME = os.homedir();
function uniq(a) { return a.filter((x, i) => x && a.indexOf(x) === i); }
function dailyRoots() {
  return uniq([process.env.RP_DATA_DIR, path.join(HOME, 'rpscrape-community', 'data', 'region'),
               '/root/rpscrape-community/data/region', path.join(HOME, 'rpscrape', 'data', 'region')]);
}
function historyDirs() {
  return uniq([process.env.FI_HISTORY_DIR, path.join(HOME, 'formintel-history'), '/root/formintel-history']);
}

const MAX_N = 30;
const MAX_DAILY_FILES = 500;     // about eight months of GB + IRE days
const MIN_DAYS_FOR_PARTIAL = 14; // a partial name keeps looking this long for other matches
const CACHE_MS = 10 * 60 * 1000;

// ── Running style from the race comment (same rules as the trainer) ─────────
const STYLE_PATTERNS = [
  [4, /\b(made all|made virtually all|made most|made nearly all|mde all|mde most|led|set (the )?pace|set pce|disputed (the )?lead|disp(uted)? ld|with leaders? early|w ldrs?|pressed leaders?|pressed ldrs?|joint lead|soon in front|took them along)\b/],
  [3, /\b(prominent|prom|tracked (the )?leaders?|trc?kd ldrs?|chased (the )?leaders?|chased leader|chsd ldrs?|close up|cl up|handy|in touch with leaders?|in tch w(ith)? ldrs?|raced (just )?behind leaders?|(just )?behind (the )?leaders?|bhd ldrs?|up with (the )?pace|with the pace|chased winner|chsd wnr|pressed)\b/],
  [2, /\b(mid-?division|mid-?div|midfield|in middle|in touch|in tch|raced in middle|towards middle)\b/],
  [1, /\b(held up|hld up|towards rear|towards rr|in rear|in rr|rear|rr|behind|bhd|dwelt|dwlt|slowly away|slowly into stride|started slowly|missed (the )?break|last|detached|outpaced early|never travelling|nvr travelling)\b/]
];
function runStyle(comment) {
  const parts = String(comment || '').toLowerCase().split(/\s+-\s+|;\s*|,\s*/);
  for (let i = 0; i < parts.length && i < 3; i++) {
    for (let k = 0; k < STYLE_PATTERNS.length; k++) if (STYLE_PATTERNS[k][1].test(parts[i])) return STYLE_PATTERNS[k][0];
  }
  return 0;
}

// ── Names ───────────────────────────────────────────────────────────────────
// "Sea The Moon (GER)" → "sea the moon"; "O'Brien" → "obrien"; claims "(3)" go
function norm(s) {
  return String(s || '').toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/['’`.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}
// rpscrape's "1:30" is 13:30; morning races are 10:xx / 11:xx
function off24(t) {
  const m = String(t || '').match(/(\d{1,2})[:.](\d{2})/);
  if (!m) return '';
  let h = parseInt(m[1], 10);
  if (h < 10) h += 12;
  return (h < 10 ? '0' : '') + h + ':' + m[2];
}

// ── CSV ─────────────────────────────────────────────────────────────────────
function parseCSV(text) {
  const rows = [];
  let row = [], field = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field.replace(/\r$/, '')); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field.replace(/\r$/, '')); rows.push(row); }
  return rows;
}
function parseLine(line) { return parseCSV(line)[0] || []; }
function headerIndex(header) {
  const ix = {};
  header.forEach((h, i) => { ix[String(h).trim().toLowerCase()] = i; });
  return ix;
}

// "2026-10-26", "2026/10/26" or "26/10/2026" → "2026-10-26"
function isoDate(d) {
  const s = String(d || '').trim();
  let m = s.match(/^(\d{4})[-/_](\d{1,2})[-/_](\d{1,2})/);
  if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (m) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
  return '';
}

// One results row → the run the app shows
function toRun(cells, ix) {
  const g = (k) => (ix[k] === undefined ? '' : String(cells[ix[k]] || '').trim());
  const style = ix.style !== undefined ? (parseInt(g('style'), 10) || 0) : runStyle(g('comment'));
  return {
    date: isoDate(g('date')), course: g('course'), off: off24(g('off')),
    race: g('race_name'), type: g('type'), cls: g('class'), dist: g('dist'), going: g('going'),
    ran: parseInt(g('ran'), 10) || 0, pos: g('pos'), draw: g('draw'), btn: g('ovr_btn'),
    horse: g('horse'), age: g('age'), wgt: g('wgt'), jockey: g('jockey'), trainer: g('trainer'),
    sp: g('sp'), or: g('or'), rpr: g('rpr'), ts: g('ts'), style: style
  };
}

// ── Where the results are ───────────────────────────────────────────────────
let _dailyList = null, _dailyAt = 0;
function dailyFiles() {
  if (_dailyList && Date.now() - _dailyAt < 5 * 60 * 1000) return _dailyList;
  const out = [], seen = {};
  dailyRoots().forEach((root) => {
    let regions = [];
    try { regions = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (e) { return; }
    regions.forEach((region) => {
      const rdir = path.join(root, region);
      let subs = [];
      try { subs = fs.readdirSync(rdir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch (e) { return; }
      // 'all' holds every race type; otherwise the type folders (flat, jumps) between them
      const use = subs.indexOf('all') > -1 ? ['all'] : subs;
      use.forEach((sub) => {
        let files = [];
        try { files = fs.readdirSync(path.join(rdir, sub)); } catch (e) { return; }
        files.forEach((f) => {
          const m = f.match(/^(\d{4})_(\d{2})_(\d{2})\.csv$/);
          if (!m) return;
          const full = path.join(rdir, sub, f);
          let real = full;
          try { real = fs.realpathSync(full); } catch (e) {}
          if (seen[real]) return;
          seen[real] = 1;
          out.push({ date: m[1] + '-' + m[2] + '-' + m[3], file: full, region: region });
        });
      });
    });
  });
  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  _dailyList = out; _dailyAt = Date.now();
  return out;
}
function historyFile() {
  let best = null;
  historyDirs().forEach((dir) => {
    let files = [];
    try { files = fs.readdirSync(dir); } catch (e) { return; }
    files.forEach((f) => {
      if (!/\.csv(\.gz)?$/i.test(f)) return;
      const full = path.join(dir, f);
      try { const st = fs.statSync(full); if (!best || st.mtimeMs > best.mtime) best = { file: full, mtime: st.mtimeMs, size: st.size }; } catch (e) {}
    });
  });
  return best;
}

// ── The search ──────────────────────────────────────────────────────────────
function Collector(by, q, n) {
  this.by = by; this.field = by; this.n = n;
  this.qn = norm(q);
  this.words = this.qn.split(' ').filter((w) => w.length >= 2);
  this.names = {};           // normalised name → { name, runs: [] }
  this.keys = {};            // date|course|horse already seen (daily files win over history)
  this.newest = ''; this.oldest = '';
}
Collector.prototype.lineMayMatch = function (lower) {
  for (let i = 0; i < this.words.length; i++) if (lower.indexOf(this.words[i]) === -1) return false;
  return true;
};
Collector.prototype.fieldMatches = function (value) {
  const v = norm(value);
  if (!v) return false;
  for (let i = 0; i < this.words.length; i++) if (v.indexOf(this.words[i]) === -1) return false;
  return true;
};
Collector.prototype.add = function (run) {
  const key = run.date + '|' + norm(run.course) + '|' + norm(run.horse);
  if (this.keys[key]) return;
  this.keys[key] = 1;
  const who = run[this.field], k = norm(who);
  const rec = this.names[k] || (this.names[k] = { name: who, runs: [] });
  rec.runs.push(run);
};
Collector.prototype.leader = function () {
  const exact = this.names[this.qn];
  if (exact) return { rec: exact, exact: true };
  let best = null;
  Object.keys(this.names).forEach((k) => {
    const r = this.names[k];
    if (!best || r.runs.length > best.runs.length) best = r;
  });
  return best ? { rec: best, exact: false } : null;
};
// Enough once the name being shown has n runs (a partial name keeps looking
// for a fortnight so a busier match isn't missed)
Collector.prototype.done = function (scanDate) {
  const L = this.leader();
  if (!L || L.rec.runs.length < this.n) return false;
  if (L.exact) return true;
  if (!this.newest || !scanDate) return false;
  return (Date.parse(this.newest) - Date.parse(scanDate)) / 86400000 >= MIN_DAYS_FOR_PARTIAL;
};

function scanDaily(col) {
  const list = dailyFiles();
  let scanned = 0;
  for (let i = 0; i < list.length && scanned < MAX_DAILY_FILES; i++) {
    const f = list[i];
    scanned++;
    if (!col.newest) col.newest = f.date;
    col.oldest = f.date;
    let text;
    try { text = fs.readFileSync(f.file, 'utf8'); } catch (e) { continue; }
    const lower = text.toLowerCase().replace(/['’`.]/g, '');
    if (col.lineMayMatch(lower)) {
      const rows = parseCSV(text);
      if (rows.length > 1) {
        const ix = headerIndex(rows[0]);
        if (ix[col.field] !== undefined) {
          for (let r = 1; r < rows.length; r++) {
            const cells = rows[r];
            if (cells.length < 3) continue;
            if (!col.fieldMatches(cells[ix[col.field]])) continue;
            const run = toRun(cells, ix);
            if (!run.date) run.date = f.date;
            col.add(run);
          }
        }
      }
    }
    // stop at a day boundary once there's enough
    const next = list[i + 1];
    if ((!next || next.date !== f.date) && col.done(f.date)) return { scanned: scanned, stopped: true };
  }
  return { scanned: scanned, stopped: false };
}

function scanHistory(col, hist) {
  return new Promise((resolve) => {
    let input;
    try {
      input = fs.createReadStream(hist.file);
      if (/\.gz$/i.test(hist.file)) input = input.pipe(zlib.createGunzip());
    } catch (e) { resolve(false); return; }
    const rl = readline.createInterface({ input: input, crlfDelay: Infinity });
    let ix = null, finished = false, lastDate = '';
    const finish = (ok) => { if (finished) return; finished = true; try { rl.close(); } catch (e) {} try { input.destroy(); } catch (e) {} resolve(ok); };
    rl.on('line', (line) => {
      if (finished) return;
      if (!ix) { ix = headerIndex(parseLine(line)); if (ix[col.field] === undefined) finish(false); return; }
      const d = line.slice(0, 10);
      if (d !== lastDate) {
        if (lastDate && col.done(lastDate)) { finish(true); return; }
        lastDate = d;
      }
      const lower = line.toLowerCase().replace(/['’`.]/g, '');
      if (!col.lineMayMatch(lower)) return;
      const cells = parseLine(line);
      if (!col.fieldMatches(cells[ix[col.field]])) return;
      col.add(toRun(cells, ix));
      if (!col.newest || d > col.newest) col.newest = d;
      if (!col.oldest || d < col.oldest) col.oldest = d;
    });
    rl.on('close', () => finish(true));
    input.on('error', () => finish(false));
  });
}

function byDateDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return a.off < b.off ? 1 : a.off > b.off ? -1 : 0;
}

const _cache = new Map();
let _queue = Promise.resolve();

async function doSearch(by, q, n) {
  const col = new Collector(by, q, n);
  const t0 = Date.now();
  const daily = scanDaily(col);
  let usedHistory = false;
  const hist = historyFile();
  if (!daily.stopped && hist) {
    usedHistory = await scanHistory(col, hist);
  }
  Object.keys(col.names).forEach((k) => col.names[k].runs.sort(byDateDesc));
  const L = col.leader();
  const others = Object.keys(col.names)
    .filter((k) => !L || col.names[k] !== L.rec)
    .map((k) => ({ name: col.names[k].name, runs: col.names[k].runs.length }))
    .sort((a, b) => b.runs - a.runs)
    .slice(0, 8);
  const list = dailyFiles();
  return {
    ok: true, by: by, q: q,
    name: L ? L.rec.name : null,
    runs: L ? L.rec.runs.slice(0, n) : [],
    others: others,
    from: col.oldest || (list.length ? list[list.length - 1].date : null),
    to: col.newest || (list.length ? list[0].date : null),
    dailyFrom: list.length ? list[list.length - 1].date : null,
    dailyTo: list.length ? list[0].date : null,
    history: usedHistory,
    ms: Date.now() - t0
  };
}

function handleSearch(query) {
  const by = String((query && query.by) || 'horse').toLowerCase();
  const q = String((query && query.q) || '').trim().slice(0, 60);
  const n = Math.max(1, Math.min(MAX_N, parseInt(query && query.n, 10) || 10));
  if (['horse', 'jockey', 'trainer'].indexOf(by) === -1) return Promise.resolve({ error: 'by must be horse, jockey or trainer' });
  if (norm(q).replace(/ /g, '').length < 3) return Promise.resolve({ error: 'Type at least 3 letters of the name' });
  if (!dailyFiles().length && !historyFile()) {
    return Promise.resolve({ error: 'No result files found on the server. Looked in: ' + dailyRoots().concat(historyDirs()).join(', ') });
  }
  const key = by + '|' + norm(q) + '|' + n;
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.data);
  // one search at a time, so a burst of searches can't pile up memory
  const p = _queue.then(() => doSearch(by, q, n)).then((data) => {
    _cache.set(key, { at: Date.now(), data: data });
    if (_cache.size > 300) _cache.delete(_cache.keys().next().value);
    return data;
  });
  _queue = p.catch(() => {});
  return p;
}

// What the installer prints: where the results are and how far back they go
function diagnose() {
  _dailyList = null;
  const list = dailyFiles(), hist = historyFile();
  const regions = {};
  list.forEach((f) => { regions[f.region] = (regions[f.region] || 0) + 1; });
  return {
    dailyFiles: list.length,
    dailyFrom: list.length ? list[list.length - 1].date : null,
    dailyTo: list.length ? list[0].date : null,
    regions: regions,
    history: hist ? { file: hist.file, sizeMB: Math.round(hist.size / 1048576 * 10) / 10 } : null,
    lookedIn: dailyRoots().concat(historyDirs())
  };
}

module.exports = { handleSearch: handleSearch, diagnose: diagnose, _norm: norm, _off24: off24, _runStyle: runStyle };
