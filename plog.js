/* Formintel results-log storage (plog.js) — shared by index, checker, tracker.
 *
 * WHY: iOS Safari gives each web address ~5MB of localStorage, and that 5MB is
 * shared by EVERY app on paulhessle-cyber.github.io. The results log was stored
 * as one plain-JSON key (rq_pred_log_v1) and at ~3,000 races it filled the lot.
 * Here the log is stored compressed, one key per month (rq_plogz_YYYY-MM), so it
 * takes ~5-8x less space and a save only re-compresses the month that changed.
 *
 * Old-format data (rq_pred_log_v1) is merged in and migrated automatically —
 * including anything an old, still-open tab writes there after the upgrade.
 */
/* LZ-string 1.5.0 — Copyright (c) 2013 pieroxy — MIT License — https://github.com/pieroxy/lz-string */
var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={compressToBase64:function(r){if(null==r)return"";var n=i._compress(r,6,function(r){return o.charAt(r)});switch(n.length%4){default:case 0:return n;case 1:return n+"===";case 2:return n+"==";case 3:return n+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(n){return t(o,r.charAt(n))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(r){return null==r?"":""==r?null:i._decompress(r.length,16384,function(o){return r.charCodeAt(o)-32})},compressToUint8Array:function(r){for(var o=i.compress(r),n=new Uint8Array(2*o.length),e=0,t=o.length;e<t;e++){var s=o.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null==o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;e<t;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(r){return null==r?"":i._compress(r,6,function(r){return n.charAt(r)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(o){return t(n,r.charAt(o))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(r,o,n){if(null==r)return"";var e,t,i,s={},u={},a="",p="",c="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<r.length;i+=1)if(a=r.charAt(i),Object.prototype.hasOwnProperty.call(s,a)||(s[a]=f++,u[a]=!0),p=c+a,Object.prototype.hasOwnProperty.call(s,p))c=p;else{if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++),s[p]=f++,c=String(a)}if(""!==c){if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==o-1){d.push(n(m));break}v++}return d.join("")},decompress:function(r){return null==r?"":""==r?null:i._decompress(r.length,32768,function(o){return r.charCodeAt(o)})},_decompress:function(o,n,e){var t,i,s,u,a,p,c,l=[],f=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)l[t]=t;for(s=0,a=Math.pow(2,2),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 2:return""}for(l[3]=c,i=c,v.push(c);;){if(g.index>o)return"";for(s=0,a=Math.pow(2,d),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(c=s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 2:return v.join("")}if(0==f&&(f=Math.pow(2,d),d++),l[c])m=l[c];else{if(c!==h)return null;m=i+i.charAt(0)}v.push(m),l[h++]=i+m.charAt(0),i=m,0==--f&&(f=Math.pow(2,d),d++)}}};return i}();"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module?module.exports=LZString:"undefined"!=typeof angular&&null!=angular&&angular.module("LZString",[]).factory("LZString",function(){return LZString});

var FIPlog = (function(){
  var V1_KEY = 'rq_pred_log_v1';
  var PREFIX = 'rq_plogz_';
  // Models load fresh from GitHub on every visit; these old on-device copies
  // are never read any more but were still sitting in storage.
  var DEAD_KEYS = ['rq_model_v1','rq_model_meta_v1',
    'rq_model_turf_v1','rq_model_aw_v1','rq_model_jumps_v1',
    'rq_model_turf_meta_v1','rq_model_aw_meta_v1','rq_model_jumps_meta_v1'];

  var cache = {};   // key -> { raw: compressed string, json: plain JSON }
  var bad = {};     // chunks that failed to decode — never overwritten or deleted
  var lastErr = null;

  function isQuota(e) { return !!e && /quota|exceed/i.test((e.name||'') + ' ' + (e.message||'')); }
  function monthOf(e) { var m = e && typeof e.date === 'string' && e.date.match(/^(\d{4}-\d{2})/); return m ? m[1] : 'undated'; }
  function ident(e) {
    if (!e) return '';
    if (e.course && e.date && e.time) return e.course + '|' + e.date + '|' + e.time;
    return (e.raceKey || '') + '|' + (e.date || '');
  }
  function chunkKeys() {
    var out = [];
    try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf(PREFIX) === 0) out.push(k); } } catch(e){}
    return out.sort();
  }

  function readChunks() {
    var log = [];
    chunkKeys().forEach(function(k){
      if (bad[k]) return;
      var raw; try { raw = localStorage.getItem(k); } catch(e) { return; }
      if (raw == null) return;
      var c = cache[k], json;
      if (c && c.raw === raw) json = c.json;
      else {
        try { json = LZString.decompressFromUTF16(raw); } catch(e) { json = null; }
        if (!json) { bad[k] = true; console.warn('plog: unreadable chunk kept as-is:', k); return; }
        cache[k] = { raw: raw, json: json };
      }
      try { var arr = JSON.parse(json); if (Array.isArray(arr)) log = log.concat(arr); }
      catch(e) { bad[k] = true; delete cache[k]; }
    });
    return log;
  }

  // Write the whole log (same contract as the old savePredLog). Returns true/false.
  function writeChunks(log) {
    lastErr = null;
    var groups = {}, order = [];
    (log || []).forEach(function(e){
      var m = monthOf(e);
      if (!groups[m]) { groups[m] = []; order.push(m); }
      groups[m].push(e);
    });
    var ok = true, keep = {};
    order.forEach(function(m){
      var key = PREFIX + m;
      if (bad[key]) key = key + '~' + Date.now();   // never overwrite an unreadable chunk
      keep[key] = true;
      var json = JSON.stringify(groups[m]);
      var c = cache[key];
      try { if (c && c.json === json && localStorage.getItem(key) === c.raw) return; } catch(e){}
      var z = LZString.compressToUTF16(json);
      try { localStorage.setItem(key, z); cache[key] = { raw: z, json: json }; }
      catch(e) { ok = false; lastErr = e; }
    });
    if (ok) {
      // Months no longer in the log (only after a fully successful write)
      chunkKeys().forEach(function(k){
        if (!keep[k] && !bad[k]) { try { localStorage.removeItem(k); } catch(e){} delete cache[k]; }
      });
    }
    return ok;
  }

  // Merge any old-format log into the compressed store, then remove it.
  // Data is never dropped: if the new store can't be written, the old key is put back.
  var migrating = false;
  function migrate() {
    if (migrating) return;
    var raw; try { raw = localStorage.getItem(V1_KEY); } catch(e) { return; }
    if (raw == null) return;
    var old; try { old = JSON.parse(raw); } catch(e) { return; }   // unreadable: leave it alone
    if (!Array.isArray(old)) return;
    migrating = true;
    try {
      purgeDead();
      var current = readChunks(), seen = {};
      current.forEach(function(e){ seen[ident(e)] = true; });
      var merged = old.filter(function(e){ return e && !seen[ident(e)]; }).concat(current);
      var before = {}; chunkKeys().forEach(function(k){ before[k] = true; });
      try { localStorage.removeItem(V1_KEY); } catch(e){}
      if (!writeChunks(merged)) {
        // Roll back: drop chunks this attempt created, restore the original key.
        chunkKeys().forEach(function(k){ if (!before[k]) { try { localStorage.removeItem(k); } catch(e){} delete cache[k]; } });
        try { localStorage.setItem(V1_KEY, raw); } catch(e) { console.error('plog: could not restore old log', e); }
      }
    } finally { migrating = false; }
  }

  function purgeDead() {
    var freed = 0, removed = 0;
    DEAD_KEYS.forEach(function(k){
      try { var v = localStorage.getItem(k); if (v != null) { freed += byteSize(k, v); localStorage.removeItem(k); removed++; } } catch(e){}
    });
    return { removed: removed, freed: freed };
  }

  // Safari counts 1 byte per char for Latin-1 strings, 2 for anything else.
  function byteSize(k, v) {
    v = v || '';
    var wide = /[^\x00-\xff]/.test(v) || /[^\x00-\xff]/.test(k);
    return (k.length + v.length) * (wide ? 2 : 1);
  }

  // Everything on this web address, grouped — including other apps' data.
  function report() {
    var groups = { log: 0, oldLog: 0, deadModels: 0, dayCache: 0, formintel: 0, other: 0 };
    var otherKeys = [], total = 0;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!k) continue;
        var v = localStorage.getItem(k) || '', b = byteSize(k, v);
        total += b;
        if (k.indexOf(PREFIX) === 0) groups.log += b;
        else if (k === V1_KEY) groups.oldLog += b;
        else if (DEAD_KEYS.indexOf(k) > -1) groups.deadModels += b;
        else if (/^rp_(card|odds|plock|nap|napday|af)_/.test(k)) groups.dayCache += b;
        else if (/^(rq_|fi_|rp_|formintel)/.test(k)) groups.formintel += b;
        else { groups.other += b; otherKeys.push({ key: k, bytes: b }); }
      }
    } catch(e){}
    otherKeys.sort(function(a,b){ return b.bytes - a.bytes; });
    return { total: total, groups: groups, otherKeys: otherKeys };
  }

  return {
    read: function(){
      migrate();
      var log = readChunks();
      // If migration couldn't complete, the old key is still there — include it.
      try {
        var raw = localStorage.getItem(V1_KEY);
        if (raw != null) {
          var old = JSON.parse(raw), seen = {};
          if (Array.isArray(old)) {
            log.forEach(function(e){ seen[ident(e)] = true; });
            log = old.filter(function(e){ return e && !seen[ident(e)]; }).concat(log);
          }
        }
      } catch(e){}
      return log;
    },
    write: function(log){ return writeChunks(log); },
    lastError: function(){ return lastErr; },
    isQuota: isQuota,
    purgeDead: purgeDead,
    report: report,
    V1_KEY: V1_KEY, PREFIX: PREFIX
  };
})();
