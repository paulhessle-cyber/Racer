'use strict';
/**
 * Formintel late-money recorder: an add-on for the odds proxy.
 *
 * For every British and Irish win market it looks at Betfair's prices every
 * 10-20 seconds from about 12 minutes before the advertised start until the
 * race goes in-play. When the race goes off it keeps the looks nearest to 10,
 * 5, 3 and 1 minute(s) before the ACTUAL off (races often start a few minutes
 * late) and the last look before it, with the money matched on the race at
 * each one. After the race it adds the Betfair SP, when Betfair supplies it,
 * and the result.
 *
 *   GET /late?days=60        races from the last 60 days (gzipped if asked)
 *   GET /late?date=2026-11-12
 *   GET /late?status=1       what it's doing and what Betfair is sending
 *
 * One file per day in late-data/ next to server.js (or FI_LATE_DIR in .env).
 *
 * Works with a delayed app key. With one, Betfair sends prices 1-180 seconds
 * late and sends the money matched on each race but not on each horse; the
 * per-horse money is recorded too if the key is ever a live one.
 *
 * install-late.js adds it to server.js: a require line, the /late route and
 *   fiLate.start({ rpc: betfairRpc });
 * so it shares the proxy's own Betfair session rather than logging in again.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const VERSION = 1;
const POINTS = [10, 5, 3, 1];                       // minutes before the off kept for every race, then the last look
const TOL_S = { 10: 150, 5: 100, 3: 70, 1: 45 };     // how far from each point a look may be and still count
const WATCH_FROM_MS = 12.5 * 60000;                 // start looking this long before the advertised start
const CLOSE_MS = 2 * 60000;                         // from 2 minutes before the advertised start, look more often
const LOOK_FAR_MS = 19000, LOOK_CLOSE_MS = 9000;
const TICK_MS = 10000;
const GIVE_UP_MS = 60 * 60000;                      // a race not off an hour after its advertised start isn't waited for
const LAST_LOOK_MAX_MS = 90000;                     // the last look must be this close to the off to count as "at the off"
const CATALOGUE_MS = 10 * 60000;
const SP_TRIES = 6;                                 // Betfair SP: checked from 90 s after the off, every 2 minutes
const RESULT_FOR_MS = 4 * 3600000;                  // keep asking for the result this long after the off
const KEEP_DAYS = 400;
const MAX_DAYS_SERVED = 400;

let rpc = null, dir = '', started = false, timer = null, kick = null, busy = false;
let now = () => Date.now();
let maxPerCall = 8;                                 // EX_BEST_OFFERS weight 5 (+17 with EX_TRADED): 8 x 22 = 176, under Betfair's 200
let lastCatalogue = 0, backoffUntil = 0, failsInRow = 0, lastPrune = 0, lastWarn = 0;
const mk = new Map();                               // marketId -> market being followed
const days = {};                                    // 'YYYY-MM-DD' -> { v, date, races: { marketId: record } } (today and yesterday)
const dirty = new Set();
let saveTimer = null, respCache = null;
const stat = { since: 0, ticks: 0, calls: 0, errors: 0, lastError: '', lastErrorAt: 0,
               delayed: null, lags: [], moneyPerHorse: null, bsp: null, catalogueAt: 0, markets: 0 };

// ── small helpers ────────────────────────────────────────────────────────────
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '' && isFinite(+v)) return +v;
  return null;
}
function r2(x) { return x == null ? null : Math.round(x * 100) / 100; }
function ukDate(ms) { return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); }
function ukTime(ms) { return new Date(ms).toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }); }
function addDays(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
function chunks(a, n) { const out = []; for (let i = 0; i < a.length; i += n) out.push(a.slice(i, i + n)); return out; }
function warn(msg) {
  const t = now();
  if (t - lastWarn < 60000) return;            // at most one line a minute in the proxy's log
  lastWarn = t;
  console.warn('late: ' + msg);
}
function noteError(e) {
  stat.errors++; stat.lastError = String((e && e.message) || e).slice(0, 300); stat.lastErrorAt = now();
  warn(stat.lastError);
}
function dataDir() {
  return dir || process.env.FI_LATE_DIR || path.join(__dirname, 'late-data');
}
function dayFile(date) { return path.join(dataDir(), date + '.json'); }

async function call(method, params) {
  stat.calls++;
  try {
    const res = await rpc(method, params);
    failsInRow = 0;
    return res;
  } catch (e) {
    failsInRow++;
    const msg = String(e && e.message);
    if (/TOO_MUCH_DATA/.test(msg) && maxPerCall > 1) maxPerCall = Math.max(1, Math.floor(maxPerCall / 2));
    // Back off rather than keep knocking: each failed call can mean a fresh
    // login attempt, and repeated failed logins can get an account locked.
    if (/login failed|INVALID_USERNAME|ACCOUNT|BANNED|TOO_MANY/i.test(msg)) backoffUntil = now() + 15 * 60000;
    else if (failsInRow >= 5) backoffUntil = now() + Math.min(30 * 60000, 60000 * Math.pow(2, Math.min(5, failsInRow - 5)));
    throw e;
  }
}

// ── day files ────────────────────────────────────────────────────────────────
function readDayFile(date) {
  try {
    const f = dayFile(date);
    if (!fs.existsSync(f)) return null;
    const j = JSON.parse(fs.readFileSync(f, 'utf8'));
    return j && j.races ? j : null;
  } catch (e) { noteError(new Error('could not read ' + date + '.json: ' + e.message)); return null; }
}
function day(date) {
  if (!days[date]) days[date] = readDayFile(date) || { v: VERSION, date: date, races: {} };
  return days[date];
}
function saveSoon(date) {
  dirty.add(date);
  respCache = null;
  if (saveTimer) return;
  saveTimer = setTimeout(flush, 3000);
  if (saveTimer.unref) saveTimer.unref();
}
function flush() {
  saveTimer = null;
  try { fs.mkdirSync(dataDir(), { recursive: true }); } catch (e) {}
  Array.from(dirty).forEach((date) => {
    dirty.delete(date);
    const d = days[date];
    if (!d) return;
    try {
      const f = dayFile(date), tmp = f + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(d));
      fs.renameSync(tmp, f);
    } catch (e) { noteError(new Error('could not save ' + date + '.json: ' + e.message)); }
  });
}

// ── which races to follow ────────────────────────────────────────────────────
async function refreshCatalogue(t) {
  const list = await call('listMarketCatalogue', {
    filter: {
      eventTypeIds: ['7'], marketCountries: ['GB', 'IE'], marketTypeCodes: ['WIN'],
      marketStartTime: { from: new Date(t - 90 * 60000).toISOString(), to: new Date(t + 20 * 3600000).toISOString() }
    },
    marketProjection: ['EVENT', 'MARKET_START_TIME', 'RUNNER_DESCRIPTION'],
    sort: 'FIRST_TO_START',
    maxResults: 400
  });
  lastCatalogue = t; stat.catalogueAt = t;
  (list || []).forEach((m) => {
    const sch = Date.parse(m.marketStartTime);
    if (!m.marketId || isNaN(sch)) return;
    const date = ukDate(sch);
    if (day(date).races[m.marketId]) return;          // already recorded (or being settled)
    let M = mk.get(m.marketId);
    if (!M) {
      M = { id: m.marketId, date: date, ph: 'wait', buf: [], lastLook: 0, names: {} };
      mk.set(m.marketId, M);
    }
    M.sch = sch; M.date = date;
    M.course = (m.event && m.event.venue) || '';
    M.time = ukTime(sch);
    M.name = m.marketName || '';
    (m.runners || []).forEach((r) => { if (r.selectionId) M.names[r.selectionId] = r.runnerName || ('#' + r.selectionId); });
  });
  stat.markets = mk.size;
}

// ── before the off: a look every 10-20 seconds ───────────────────────────────
async function lookPreOff(t) {
  const due = [];
  mk.forEach((M) => {
    if (M.ph !== 'wait' || !M.sch) return;
    if (t < M.sch - WATCH_FROM_MS) return;
    if (t > M.sch + GIVE_UP_MS) { mk.delete(M.id); return; }        // abandoned, or something odd: let it go
    const gap = t >= M.sch - CLOSE_MS ? LOOK_CLOSE_MS : LOOK_FAR_MS;
    if (!M.lastLook || t - M.lastLook >= gap) due.push(M);
  });
  if (!due.length) return;
  const live = stat.delayed === false;                // per-horse money only comes with a live key
  for (const group of chunks(due, maxPerCall)) {
    const books = await call('listMarketBook', {
      marketIds: group.map((M) => M.id),
      priceProjection: { priceData: live ? ['EX_BEST_OFFERS', 'EX_TRADED'] : ['EX_BEST_OFFERS'],
                         exBestOffersOverrides: { bestPricesDepth: 1 }, virtualise: true }
    });
    const at = now(), byId = {};
    (books || []).forEach((b) => { if (b && b.marketId) byId[b.marketId] = b; });
    group.forEach((M) => { M.lastLook = at; if (byId[M.id]) onPreOffBook(M, byId[M.id], at); });
  }
}

function runnerMoney(r) {
  const tm = num(r.totalMatched);
  if (tm) return tm;
  let s = 0;
  ((r.ex && r.ex.tradedVolume) || []).forEach((v) => { s += num(v.size) || 0; });
  return s;
}

function onPreOffBook(M, b, at) {
  if (typeof b.isMarketDataDelayed === 'boolean') stat.delayed = b.isMarketDataDelayed;
  if (b.inplay || b.status === 'CLOSED') {
    // Off. It went in-play somewhere between the last look and this one.
    const lastAt = M.buf.length ? M.buf[M.buf.length - 1].at : 0;
    M.off = lastAt && at - lastAt <= 3 * LOOK_FAR_MS ? Math.round((lastAt + at) / 2) : at;
    buildRecord(M, at);
    return;
  }
  if (b.status !== 'OPEN') return;                    // suspended (a withdrawal at the start, say): no usable prices
  const lm = Date.parse(b.lastMatchTime || '');
  const look = { at: at, mt: num(b.totalMatched) || 0, lag: isNaN(lm) ? null : Math.max(0, Math.round((at - lm) / 1000)), r: {} };
  let horseMoney = 0;
  (b.runners || []).forEach((r) => {
    const top = r.ex && r.ex.availableToBack && r.ex.availableToBack[0];
    const back = top ? num(top.price) : null;
    const price = r.status === 'ACTIVE' ? r2(back || num(r.lastPriceTraded) || null) : null;
    const money = runnerMoney(r);
    horseMoney += money;
    look.r[r.selectionId] = [price, Math.round(money), r.status === 'ACTIVE' ? 1 : r.status === 'REMOVED' ? -1 : 0];
  });
  if (horseMoney > 0) stat.moneyPerHorse = true;
  else if (look.mt > 1000 && stat.moneyPerHorse !== true) stat.moneyPerHorse = false;
  M.buf.push(look);
  if (M.buf.length > 150) M.buf.shift();
}

// The looks nearest to 10, 5, 3 and 1 minute(s) before the off, and the last one.
function pickLooks(buf, off) {
  const looks = POINTS.map((m) => {
    const target = off - m * 60000;
    let best = null, bd = Infinity;
    buf.forEach((l) => { const d = Math.abs(l.at - target); if (l.at < off && d < bd) { bd = d; best = l; } });
    return best && bd <= TOL_S[m] * 1000 ? best : null;
  });
  const last = buf.length ? buf[buf.length - 1] : null;
  looks.push(last && off - last.at >= 0 && off - last.at <= LAST_LOOK_MAX_MS ? last : null);
  return looks;
}

function buildRecord(M, at) {
  const looks = pickLooks(M.buf, M.off);
  const lagNear = M.buf.filter((l) => l.lag != null && M.off - l.at <= 3 * 60000).map((l) => l.lag);
  if (lagNear.length) { stat.lags.push(median(lagNear)); if (stat.lags.length > 200) stat.lags.shift(); }
  M.ph = 'off';
  M.buf = [];
  if (!looks.some(Boolean)) { mk.delete(M.id); return; }   // the proxy wasn't watching this one (started after the off)
  const ids = {};
  Object.keys(M.names).forEach((s) => { ids[s] = 1; });
  looks.forEach((l) => { if (l) Object.keys(l.r).forEach((s) => { ids[s] = 1; }); });
  const lastSeen = (s) => { for (let i = looks.length - 1; i >= 0; i--) if (looks[i] && looks[i].r[s]) return looks[i].r[s]; return null; };
  const runners = Object.keys(ids).map((s) => {
    const p = looks.map((l) => (l && l.r[s] && l.r[s][0]) || null);
    const v = looks.map((l) => (l && l.r[s] ? l.r[s][1] : null));
    const run = { s: +s, h: M.names[s] || ('#' + s), p: p };
    if (v.some((x) => x > 0)) run.v = v;
    const ls = lastSeen(s);
    if (ls && ls[2] === -1) run.w = -1;              // withdrawn before the off
    return run;
  });
  const lastPrice = (run) => { for (let i = run.p.length - 1; i >= 0; i--) if (run.p[i]) return run.p[i]; return 9999; };
  runners.sort((a, b) => lastPrice(a) - lastPrice(b));
  const rec = {
    id: M.id, d: M.date, t: M.time, c: M.course, n: M.name, sch: M.sch, off: M.off, ph: 'off',
    at: looks.map((l) => (l ? Math.round((M.off - l.at) / 1000) : null)),
    mt: looks.map((l) => (l ? Math.round(l.mt) : null)),
    lag: lagNear.length ? median(lagNear) : null,
    r: runners, spTries: 0, chk: at + 90000
  };
  day(M.date).races[M.id] = rec;
  M.rec = rec;
  saveSoon(M.date);
}

// ── after the off: Betfair SP and the result ─────────────────────────────────
async function checkAfterOff(t) {
  const due = [];
  mk.forEach((M) => { if (M.ph === 'off' && M.rec && t >= (M.rec.chk || 0)) due.push(M); });
  if (!due.length) return;
  for (const group of chunks(due, maxPerCall)) {
    const books = await call('listMarketBook', {
      marketIds: group.map((M) => M.id),
      priceProjection: { priceData: ['SP_AVAILABLE', 'SP_TRADED'] }
    });
    const at = now(), byId = {};
    (books || []).forEach((b) => { if (b && b.marketId) byId[b.marketId] = b; });
    group.forEach((M) => onAfterOffBook(M, byId[M.id], at));
  }
}

function onAfterOffBook(M, b, at) {
  const rec = M.rec;
  if (b) {
    const bySel = {};
    rec.r.forEach((run) => { bySel[run.s] = run; });
    if (!rec.spDone) {
      let got = 0;
      (b.runners || []).forEach((r) => {
        const run = bySel[r.selectionId], sp = num(r.sp && r.sp.actualSP);
        if (run && sp && sp > 1) { run.sp = r2(sp); got++; }
      });
      rec.spTries = (rec.spTries || 0) + 1;
      if (got) { rec.spDone = 1; stat.bsp = true; }
      else if (rec.spTries >= SP_TRIES) { rec.spDone = 1; if (stat.bsp !== true) stat.bsp = false; }
    }
    if (b.status === 'CLOSED' && !rec.res) {
      let winners = 0;
      (b.runners || []).forEach((r) => {
        const run = bySel[r.selectionId];
        if (!run) return;
        if (r.status === 'WINNER') { run.w = 1; winners++; }
        else if (r.status === 'LOSER' || r.status === 'PLACED') run.w = 0;
        else if (r.status === 'REMOVED' || r.status === 'REMOVED_VACANT') run.w = -1;
      });
      rec.res = 1;
      rec.ph = winners ? 'done' : 'void';            // closed with no winner: abandoned or void
    }
  }
  const finished = (rec.res && rec.spDone) || at - (rec.off || at) > RESULT_FOR_MS;
  if (finished) {
    if (!rec.res) rec.ph = 'void';
    delete rec.chk; delete rec.spTries;
    M.ph = 'done';
    mk.delete(M.id);
  } else {
    rec.chk = at + (rec.spDone ? 3 * 60000 : 2 * 60000);
  }
  saveSoon(rec.d);
}

// ── housekeeping ─────────────────────────────────────────────────────────────
function housekeeping(t) {
  const today = ukDate(t), keep = { [today]: 1, [addDays(today, -1)]: 1, [addDays(today, 1)]: 1 };
  Object.keys(days).forEach((d) => { if (!keep[d] && !dirty.has(d)) delete days[d]; });
  if (t - lastPrune < 6 * 3600000) return;
  lastPrune = t;
  try {
    const cutoff = addDays(today, -KEEP_DAYS);
    fs.readdirSync(dataDir()).forEach((f) => {
      const m = /^(\d{4}-\d{2}-\d{2})\.json$/.exec(f);
      if (m && m[1] < cutoff) fs.unlinkSync(path.join(dataDir(), f));
    });
  } catch (e) {}
}

async function tick() {
  if (busy || !rpc || !started) return;
  busy = true;
  stat.ticks++;
  try {
    const t = now();
    if (t < backoffUntil) return;
    if (!lastCatalogue || t - lastCatalogue >= CATALOGUE_MS) {
      try { await refreshCatalogue(t); } catch (e) { noteError(e); }
    }
    try { await lookPreOff(now()); } catch (e) { noteError(e); }
    try { await checkAfterOff(now()); } catch (e) { noteError(e); }
    housekeeping(now());
  } catch (e) { noteError(e); }
  finally { busy = false; }
}

// Pick up races that went off before a restart and still need their SP or result.
function resume() {
  const today = ukDate(now());
  [addDays(today, -1), today].forEach((date) => {
    const d = day(date);
    Object.keys(d.races).forEach((id) => {
      const rec = d.races[id];
      if (rec.ph === 'off' && !mk.has(id)) mk.set(id, { id: id, date: date, ph: 'off', rec: rec, buf: [], names: {}, sch: rec.sch, off: rec.off });
    });
  });
}

// ── public ───────────────────────────────────────────────────────────────────
function start(opts) {
  opts = opts || {};
  if (typeof opts.rpc !== 'function') { console.warn('late: start() needs the proxy\'s betfairRpc — not recording.'); return; }
  rpc = opts.rpc;
  if (opts.dir) dir = opts.dir;
  if (typeof opts.now === 'function') now = opts.now;
  if (started) return;
  started = true;
  stat.since = now();
  try { fs.mkdirSync(dataDir(), { recursive: true }); } catch (e) { noteError(e); }
  resume();
  if (opts.timers === false) return;                  // tests drive tick() themselves
  kick = setTimeout(tick, 15000);                     // let the proxy finish starting first
  timer = setInterval(tick, TICK_MS);
  console.log('Late-money recorder on: saving to ' + dataDir());
}

function stop() {
  if (timer) clearInterval(timer);
  if (kick) clearTimeout(kick);
  timer = null; kick = null; started = false;
  if (saveTimer) { clearTimeout(saveTimer); flush(); }
}

function fileDates() {
  try { return fs.readdirSync(dataDir()).map((f) => (/^(\d{4}-\d{2}-\d{2})\.json$/.exec(f) || [])[1]).filter(Boolean).sort(); }
  catch (e) { return []; }
}

function status() {
  const t = now(), today = ukDate(t), d = day(today), recs = Object.keys(d.races).map((k) => d.races[k]);
  let watching = 0;
  mk.forEach((M) => { if (M.ph === 'wait' && M.sch && t >= M.sch - WATCH_FROM_MS) watching++; });
  const files = fileDates();
  return {
    ok: !!started, version: VERSION, since: stat.since ? new Date(stat.since).toISOString() : null,
    firstDay: files[0] || null, days: files.length,
    today: {
      date: today,
      racesToCome: Array.from(mk.values()).filter((M) => M.ph === 'wait' && M.date === today).length,
      watchingNow: watching,
      recorded: recs.length,
      withResult: recs.filter((r) => r.ph === 'done').length,
      withBsp: recs.filter((r) => r.r.some((x) => x.sp)).length,
      void: recs.filter((r) => r.ph === 'void').length
    },
    delayedData: stat.delayed, delaySeconds: median(stat.lags), moneyPerHorse: stat.moneyPerHorse, bsp: stat.bsp,
    betfairCalls: stat.calls, errors: stat.errors,
    lastError: stat.lastError || null, lastErrorAt: stat.lastErrorAt ? new Date(stat.lastErrorAt).toISOString() : null
  };
}

function publicRace(rec) {
  return {
    d: rec.d, t: rec.t, c: rec.c, n: rec.n, off: rec.off, sch: rec.sch, ph: rec.ph, at: rec.at, mt: rec.mt, lag: rec.lag,
    r: rec.r.map((x) => { const o = { h: x.h, p: x.p }; if (x.sp) o.sp = x.sp; if (x.w != null) o.w = x.w; if (x.v) o.v = x.v; return o; })
  };
}

function send(body, headers, status) {
  const out = { status: status || 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, body: body };
  const ae = String((headers && headers['accept-encoding']) || '');
  if (body.length > 1024 && /\bgzip\b/.test(ae)) {
    out.body = zlib.gzipSync(body);
    out.headers['Content-Encoding'] = 'gzip';
    out.headers['Vary'] = 'Accept-Encoding';
  }
  return out;
}

// For the route in server.js: always resolves, never throws.
async function handle(q, headers) {
  try {
    q = q || {};
    const one = (v) => (Array.isArray(v) ? v[0] : v);
    if (one(q.status)) return send(JSON.stringify(status()), headers);
    const today = ukDate(now());
    let dates;
    const date = String(one(q.date) || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) dates = [date];
    else {
      const n = Math.max(1, Math.min(MAX_DAYS_SERVED, parseInt(one(q.days), 10) || 30));
      const first = addDays(today, -(n - 1));
      dates = fileDates().filter((d) => d >= first && d <= today);
      if (dates.indexOf(today) === -1) dates.push(today);
    }
    const key = dates.join(',') + '|' + /\bgzip\b/.test(String((headers && headers['accept-encoding']) || ''));
    if (respCache && respCache.key === key && now() - respCache.at < 60000) return respCache.out;
    const races = [];
    dates.forEach((d) => {
      const f = days[d] || readDayFile(d);
      if (!f) return;
      Object.keys(f.races).forEach((id) => { const rec = f.races[id]; if (rec && rec.r && rec.ph !== 'void') races.push(publicRace(rec)); });
    });
    races.sort((a, b) => (a.off || 0) - (b.off || 0));
    const s = status();
    const body = JSON.stringify({
      v: VERSION, from: dates[0], to: dates[dates.length - 1],
      status: { firstDay: s.firstDay, delayedData: s.delayedData, delaySeconds: s.delaySeconds, moneyPerHorse: s.moneyPerHorse,
                bsp: s.bsp, lastError: s.lastError, lastErrorAt: s.lastErrorAt, today: s.today },
      races: races
    });
    const out = send(body, headers);
    respCache = { key: key, at: now(), out: out };
    return out;
  } catch (e) {
    noteError(e);
    return send(JSON.stringify({ error: 'late: ' + e.message }), headers, 500);
  }
}

// For the installer: where the files go and whether that folder can be written.
function diagnose() {
  const d = dataDir();
  let writable = false;
  try { fs.mkdirSync(d, { recursive: true }); const f = path.join(d, '.write-test'); fs.writeFileSync(f, 'ok'); fs.unlinkSync(f); writable = true; } catch (e) {}
  const files = fileDates();
  return { dir: d, writable: writable, days: files.length, firstDay: files[0] || null, lastDay: files[files.length - 1] || null };
}

module.exports = { start, stop, handle, status, diagnose, _tick: tick, _flush: flush, _state: () => ({ mk, days, stat }) };
