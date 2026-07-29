/* util.js — tiny helpers, global namespace TJ */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  TJ.$ = (sel, root) => (root || document).querySelector(sel);
  TJ.$$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  TJ.el = function (tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") node.className = attrs[k];
      else if (k === "style") node.style.cssText = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k.startsWith("on") && typeof attrs[k] === "function")
        node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach((c) => {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  };

  TJ.uid = (() => { let n = 0; return (p) => (p || "id") + "-" + (++n).toString(36) + "-" + Math.floor(performance.now()).toString(36); })();

  TJ.clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  TJ.round = (v, d = 0) => { const f = Math.pow(10, d); return Math.round(v * f) / f; };
  TJ.pad2 = (n) => String(n).padStart(2, "0");

  TJ.debounce = function (fn, ms) {
    let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); };
  };

  // format a Date -> "2024.05.03  14:22"
  TJ.fmtDateTime = function (d) {
    if (!d) return "";
    return `${d.getFullYear()}.${TJ.pad2(d.getMonth() + 1)}.${TJ.pad2(d.getDate())}  ${TJ.pad2(d.getHours())}:${TJ.pad2(d.getMinutes())}`;
  };
  TJ.fmtDate = function (d) {
    if (!d) return "";
    return `${d.getFullYear()}.${TJ.pad2(d.getMonth() + 1)}.${TJ.pad2(d.getDate())}`;
  };

  // is a time in the "night" band (before 6h or after/at 19h)
  TJ.isNight = function (d) { if (!d) return false; const h = d.getHours(); return h < 6 || h >= 19; };

  let toastT;
  TJ.toast = function (msg, ms = 1800) {
    const t = TJ.$("#toast");
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastT);
    toastT = setTimeout(() => (t.hidden = true), ms);
  };

  // approximate great-circle distance in km between two lat/lon
  TJ.geoDistance = function (a, b) {
    if (!a || !b) return Infinity;
    const R = 6371, toRad = (x) => (x * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon);
    const s = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(s));
  };

  TJ.download = function (blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = TJ.el("a", { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
  };
})(window.TJ);
