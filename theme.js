// Formintel light / dark mode. Loaded in <head> so the page never flashes the
// wrong theme. '' = follow the phone, 'light' or 'dark' = chosen. Shared by
// the predictor and the results app (same address, same setting).
(function () {
  var KEY = 'fi_theme';
  function get() { try { return localStorage.getItem(KEY) || ''; } catch (e) { return ''; } }
  function systemDark() { return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches); }
  function effective() { var t = get(); return t || (systemDark() ? 'dark' : 'light'); }
  function apply() {
    var t = get(), el = document.documentElement;
    if (t) el.setAttribute('data-theme', t); else el.removeAttribute('data-theme');
    var dark = effective() === 'dark';
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', dark ? '#0b100e' : '#f2f5f3');
    var icons = document.querySelectorAll('[data-theme-icon]');
    for (var i = 0; i < icons.length; i++) { icons[i].textContent = dark ? '☀️' : '🌙'; icons[i].title = dark ? 'Switch to light mode' : 'Switch to dark mode'; }
    var segs = document.querySelectorAll('[data-theme-opt]');
    for (var j = 0; j < segs.length; j++) segs[j].classList.toggle('on', segs[j].getAttribute('data-theme-opt') === t);
  }
  window.fiTheme = {
    get: get, effective: effective, apply: apply,
    set: function (t) { try { if (t) localStorage.setItem(KEY, t); else localStorage.removeItem(KEY); } catch (e) {} apply(); },
    toggle: function () { window.fiTheme.set(effective() === 'dark' ? 'light' : 'dark'); }
  };
  // Charts are drawn as SVG strings with theme colours in their attributes
  // (stroke="var(--g)"). Not every browser reads var() in an SVG attribute,
  // so move those into style, where it always works.
  var SVG_SEL = 'svg [stroke*="var("], svg [fill*="var("], svg [stop-color*="var("]';
  function fixSvgVars(root) {
    if (!root || root.nodeType !== 1 || !root.querySelectorAll) return;
    var els = root.querySelectorAll(SVG_SEL);
    for (var i = 0; i < els.length; i++) {
      ['stroke', 'fill', 'stop-color'].forEach(function (a) {
        var v = els[i].getAttribute(a);
        if (v && v.indexOf('var(') > -1) { els[i].style.setProperty(a, v); els[i].removeAttribute(a); }
      });
    }
  }
  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) fixSvgVars(added[j]);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  }
  window.fiFixSvgVars = fixSvgVars;

  apply();
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply);
  }
  document.addEventListener('DOMContentLoaded', apply);
})();
