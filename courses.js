// ════════════════════════════════════════════════════════════════════════════
// FORMINTEL — racecourse locations and weather (Open-Meteo, free, no key)
// Shared by the predictor (index.html), the results app (checker.html) and the
// trainer (horse_racing_trainer.html).
//
// Locations are to about a kilometre, which is plenty: the weather models
// work on 2-10km grids.
// ════════════════════════════════════════════════════════════════════════════
var FI_COURSE_GEO = {
  // Great Britain
  aintree:[53.477,-2.943], ascot:[51.414,-0.675], ayr:[55.457,-4.611], bangor:[52.995,-2.913],
  bath:[51.420,-2.392], beverley:[53.851,-0.463], brighton:[50.836,-0.110], carlisle:[54.870,-2.915],
  cartmel:[54.199,-2.955], catterick:[54.377,-1.632], chelmsford:[51.832,0.493], cheltenham:[51.921,-2.068],
  chepstow:[51.655,-2.685], chester:[53.188,-2.897], doncaster:[53.519,-1.103], epsom:[51.313,-0.255],
  exeter:[50.651,-3.587], fakenham:[52.827,0.854], ffoslas:[51.736,-4.251], fontwell:[50.856,-0.652],
  goodwood:[50.896,-0.754], hamilton:[55.784,-4.045], haydock:[53.481,-2.629], hereford:[52.067,-2.730],
  hexham:[54.954,-2.118], huntingdon:[52.323,-0.232], kelso:[55.610,-2.430], kempton:[51.417,-0.404],
  leicester:[52.601,-1.088], lingfield:[51.174,-0.011], ludlow:[52.394,-2.760], marketrasen:[53.387,-0.328],
  musselburgh:[55.947,-3.053], newbury:[51.397,-1.305], newcastle:[55.032,-1.637], newmarket:[52.240,0.370],
  newtonabbot:[50.537,-3.596], nottingham:[52.948,-1.104], perth:[56.421,-3.444], plumpton:[50.929,-0.061],
  pontefract:[53.693,-1.333], redcar:[54.615,-1.072], ripon:[54.126,-1.505], salisbury:[51.056,-1.855],
  sandown:[51.374,-0.357], sedgefield:[54.651,-1.459], southwell:[53.070,-0.870], stratford:[52.181,-1.728],
  taunton:[50.997,-3.085], thirsk:[54.231,-1.348], towcester:[52.130,-0.990], uttoxeter:[52.897,-1.851],
  warwick:[52.283,-1.594], wetherby:[53.929,-1.367], wincanton:[51.063,-2.409], windsor:[51.487,-0.628],
  wolverhampton:[52.604,-2.137], worcester:[52.198,-2.228], yarmouth:[52.623,1.733], york:[53.943,-1.092],
  // Northern Ireland
  downroyal:[54.485,-6.115], downpatrick:[54.322,-5.728],
  // Ireland
  ballinrobe:[53.638,-9.237], bellewstown:[53.670,-6.322], clonmel:[52.366,-7.673], cork:[52.136,-8.662],
  curragh:[53.163,-6.845], dundalk:[54.023,-6.411], fairyhouse:[53.513,-6.479], galway:[53.299,-8.995],
  gowranpark:[52.628,-7.077], kilbeggan:[53.364,-7.498], killarney:[52.048,-9.492], laytown:[53.680,-6.235],
  leopardstown:[53.267,-6.196], limerick:[52.591,-8.711], listowel:[52.443,-9.488], naas:[53.214,-6.657],
  navan:[53.669,-6.675], punchestown:[53.195,-6.625], roscommon:[53.629,-8.198], sligo:[54.266,-8.450],
  thurles:[52.679,-7.827], tipperary:[52.481,-8.202], tralee:[52.276,-9.684], tramore:[52.159,-7.132],
  wexford:[52.341,-6.489]
};
var FI_COURSE_ALIAS = {
  bangorondee:'bangor', chelmsfordcity:'chelmsford', epsomdowns:'epsom', greatyarmouth:'yarmouth',
  stratfordonavon:'stratford', stratforduponavon:'stratford', thecurragh:'curragh', gowran:'gowranpark',
  newtonabbotracecourse:'newtonabbot', limerickjunction:'tipperary', mallow:'cork', royalascot:'ascot',
  gloriousgoodwood:'goodwood', cheltenhamfestival:'cheltenham'
};
// "Kempton (AW)" / "Gowran Park (IRE)" / "Bangor-on-Dee" -> "kempton" / "gowranpark" / "bangorondee"
function fiCourseKey(name) {
  return String(name || '').toLowerCase().replace(/\([^)]*\)/g, '').replace(/[^a-z]/g, '');
}
function fiCourseGeo(name) {
  var k = fiCourseKey(name);
  if (!k) return null;
  k = FI_COURSE_ALIAS[k] || k;
  if (FI_COURSE_GEO[k]) return FI_COURSE_GEO[k];
  for (var c in FI_COURSE_GEO) {
    if (k.indexOf(c) === 0 || (c.length >= 5 && c.indexOf(k) === 0 && k.length >= 4)) return FI_COURSE_GEO[c];
  }
  return null;
}

// WMO weather codes (what Open-Meteo returns) -> icon + words
function fiWxCode(code) {
  var c = +code;
  if (c === 0) return { icon:'☀️', label:'Sunny' };
  if (c === 1) return { icon:'🌤️', label:'Mostly sunny' };
  if (c === 2) return { icon:'⛅', label:'Partly cloudy' };
  if (c === 3) return { icon:'☁️', label:'Cloudy' };
  if (c === 45 || c === 48) return { icon:'🌫️', label:'Fog' };
  if (c >= 51 && c <= 57) return { icon:'🌦️', label:'Drizzle' };
  if (c === 61) return { icon:'🌧️', label:'Light rain' };
  if (c === 63) return { icon:'🌧️', label:'Rain' };
  if (c === 65) return { icon:'🌧️', label:'Heavy rain' };
  if (c === 66 || c === 67) return { icon:'🌧️', label:'Freezing rain' };
  if (c >= 71 && c <= 77) return { icon:'🌨️', label:'Snow' };
  if (c === 80) return { icon:'🌦️', label:'Light showers' };
  if (c === 81) return { icon:'🌧️', label:'Showers' };
  if (c === 82) return { icon:'🌧️', label:'Heavy showers' };
  if (c === 85 || c === 86) return { icon:'🌨️', label:'Snow showers' };
  if (c >= 95) return { icon:'⛈️', label:'Thunderstorms' };
  return { icon:'🌡️', label:'—' };
}
function fiCompass(deg) {
  if (deg == null || isNaN(deg)) return '';
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(((+deg % 360) + 360) % 360 / 22.5) % 16];
}
function fiRound1(x) { return Math.round((+x || 0) * 10) / 10; }

// ── Fetching ─────────────────────────────────────────────────────────────────
var FI_WX_VARS = 'temperature_2m,precipitation,precipitation_probability,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m';
var FI_WX_HIST_VARS = 'temperature_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m';
function fiFetchJSON(url, ms) {
  var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
  var timer = ctl ? setTimeout(function(){ try { ctl.abort(); } catch(e){} }, ms || 15000) : null;
  return fetch(url, ctl ? { signal: ctl.signal } : {})
    .then(function(r){ if (!r.ok) throw new Error('weather service returned ' + r.status); return r.json(); })
    .then(function(j){ if (timer) clearTimeout(timer); if (j && j.error) throw new Error(j.reason || 'weather error'); return j; },
          function(e){ if (timer) clearTimeout(timer); throw e; });
}
// Compact the hourly block: { time:[...], tp, p, pp, c, w, g, d }
function fiPackHourly(h) {
  if (!h || !h.time) return null;
  return { time: h.time, tp: h.temperature_2m || [], p: h.precipitation || [], pp: h.precipitation_probability || [],
           c: h.weather_code || [], w: h.wind_speed_10m || [], g: h.wind_gusts_10m || [], d: h.wind_direction_10m || [] };
}

// Today's forecast for a course (yesterday + today + tomorrow, hourly, mph).
// Cached for 30 minutes in memory and in a per-day localStorage key.
var _fiWxMem = {}, _fiWxPending = {};
function fiWxDay() { return new Date().toISOString().slice(0, 10); }
function fiWxForecast(course) {
  var geo = fiCourseGeo(course);
  if (!geo) return Promise.resolve(null);
  var key = fiCourseKey(course), now = Date.now(), lsKey = 'rp_wx_' + fiWxDay() + '_' + key;
  var mem = _fiWxMem[key];
  if (mem && now - mem.t < 30 * 60000) return Promise.resolve(mem.h);
  if (!mem) {
    try { var st = JSON.parse(localStorage.getItem(lsKey) || 'null'); if (st && st.h && now - st.t < 30 * 60000) { _fiWxMem[key] = st; return Promise.resolve(st.h); } } catch(e) {}
  }
  if (_fiWxPending[key]) return _fiWxPending[key];
  var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + geo[0] + '&longitude=' + geo[1]
    + '&hourly=' + FI_WX_VARS + '&past_days=1&forecast_days=2&timezone=Europe%2FLondon&wind_speed_unit=mph';
  _fiWxPending[key] = fiFetchJSON(url, 12000).then(function(j){
    var h = fiPackHourly(j && j.hourly);
    delete _fiWxPending[key];
    if (!h) return mem ? mem.h : null;
    var rec = { t: Date.now(), h: h };
    _fiWxMem[key] = rec;
    try { localStorage.setItem(lsKey, JSON.stringify(rec)); } catch(e) {}
    return h;
  }, function(){ delete _fiWxPending[key]; return mem ? mem.h : null; });
  return _fiWxPending[key];
}

// Past weather for a course over a date range: the archive (ERA5) for days
// more than 6 days back, the forecast service's recent past for the rest.
function fiAddDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// Merge two hourly blocks by time. The archive can hold blanks for its last
// few days, so a blank is filled from the other block when it has a value.
function fiMergeHourly(a, b) {
  if (!a) return b; if (!b) return a;
  var KEYS = ['tp','p','pp','c','w','g','d'];
  var at = {}, out = { time: [], tp: [], p: [], pp: [], c: [], w: [], g: [], d: [] };
  [a, b].forEach(function(h){
    h.time.forEach(function(t, i){
      var j = at[t];
      if (j === undefined) {
        at[t] = out.time.length; out.time.push(t);
        KEYS.forEach(function(k){ out[k].push(h[k] && h[k][i] != null ? h[k][i] : null); });
      } else {
        KEYS.forEach(function(k){ if (out[k][j] == null && h[k] && h[k][i] != null) out[k][j] = h[k][i]; });
      }
    });
  });
  // keep it in time order (the archive and forecast ranges overlap)
  var order = out.time.map(function(t, i){ return i; }).sort(function(x, y){ return out.time[x] < out.time[y] ? -1 : out.time[x] > out.time[y] ? 1 : 0; });
  var sorted = {}; ['time'].concat(KEYS).forEach(function(k){ sorted[k] = order.map(function(i){ return out[k][i]; }); });
  return sorted;
}
function fiWxHistory(course, fromISO, toISO) {
  var geo = fiCourseGeo(course);
  if (!geo) return Promise.resolve(null);
  var today = fiWxDay(), split = fiAddDays(today, -6);
  var calls = [];
  if (fromISO <= split) {
    var archEnd = toISO < split ? toISO : split;
    calls.push(fiFetchJSON('https://archive-api.open-meteo.com/v1/archive?latitude=' + geo[0] + '&longitude=' + geo[1]
      + '&start_date=' + fromISO + '&end_date=' + archEnd + '&hourly=' + FI_WX_HIST_VARS
      + '&timezone=Europe%2FLondon&wind_speed_unit=mph', 30000).then(function(j){ return fiPackHourly(j && j.hourly); }));
  }
  if (toISO > split) {
    calls.push(fiFetchJSON('https://api.open-meteo.com/v1/forecast?latitude=' + geo[0] + '&longitude=' + geo[1]
      + '&hourly=' + FI_WX_VARS + '&past_days=8&forecast_days=1&timezone=Europe%2FLondon&wind_speed_unit=mph', 20000)
      .then(function(j){ return fiPackHourly(j && j.hourly); }));
  }
  return Promise.all(calls.map(function(p){ return p.catch(function(){ return null; }); }))
    .then(function(parts){ var h = null; parts.forEach(function(x){ h = fiMergeHourly(h, x); }); return h; });
}

// ── Reading the hourly block for a race ─────────────────────────────────────
// Open-Meteo's hourly precipitation is the total for the hour BEFORE the
// stamp, so the 15:00 value covers 14:00-15:00.
function fiHourIndex(h, dateISO, hh) {
  var t = dateISO + 'T' + (hh < 10 ? '0' : '') + hh + ':00';
  return h.time.indexOf(t);
}
// Weather for a race: at the off, in the hour of the off, and the rain that
// fell from 7am to the off (after the morning going declaration) and in the
// 24 hours before that.
function fiWxAt(h, dateISO, hhmm) {
  if (!h || !h.time || !dateISO || !hhmm) return null;
  var m = String(hhmm).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  var hr = +m[1], mn = +m[2];
  var near = fiHourIndex(h, dateISO, mn >= 30 ? Math.min(hr + 1, 23) : hr);
  var hourEnd = fiHourIndex(h, dateISO, Math.min(hr + 1, 23));
  var i7 = fiHourIndex(h, dateISO, 7);
  if (near < 0 || i7 < 0) return null;
  var floorIdx = fiHourIndex(h, dateISO, hr);
  var since7 = 0, prev24 = 0, i;
  for (i = i7 + 1; i <= floorIdx && i < h.time.length; i++) since7 += +h.p[i] || 0;
  for (i = Math.max(0, i7 - 23); i <= i7; i++) prev24 += +h.p[i] || 0;
  var info = fiWxCode(h.c[near]);
  return {
    code: h.c[near], icon: info.icon, label: info.label,
    temp: h.tp[near] != null ? Math.round(h.tp[near]) : null,
    rainHour: hourEnd > -1 ? fiRound1(h.p[hourEnd]) : 0,
    rainProb: (h.pp && hourEnd > -1 && h.pp[hourEnd] != null) ? Math.round(h.pp[hourEnd]) : null,
    wind: h.w[near] != null ? Math.round(h.w[near]) : null,
    gust: h.g[near] != null ? Math.round(h.g[near]) : null,
    dir: fiCompass(h.d[near]),
    rainSince7: fiRound1(since7),
    rainPrev24: fiRound1(prev24),
    future: hourEnd > -1 && h.time[hourEnd].slice(0, 13) > fiUkHourStamp()
  };
}
// "2026-10-19T14" in UK time ('sv-SE' formats as "2026-10-19 14:05:00")
function fiUkHourStamp() {
  try { return new Date().toLocaleString('sv-SE', { timeZone: 'Europe/London' }).replace(' ', 'T').slice(0, 13); }
  catch(e) { return new Date().toISOString().slice(0, 13); }
}
// Bands used by the results Weather tab and the trainer report
function fiRainBand(mm) { return mm >= 5 ? 'wet' : mm >= 0.5 ? 'some' : 'dry'; }
function fiWindBand(gust) { return gust == null ? '' : gust >= 35 ? 'windy' : gust >= 22 ? 'breezy' : 'calm'; }
