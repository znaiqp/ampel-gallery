/* grid.js — canvas metrics, grid-line rendering, item rendering, snapping.
   The canvas has a fixed on-screen base size per ratio; export re-renders at
   high resolution using the same normalized item rectangles. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  // on-screen base size (long edge). Export scales up from this.
  const BASE = 760;

  function baseDims(ratio) {
    const r = TJ.RATIOS[ratio] || TJ.RATIOS.portrait;
    if (r.w >= r.h) return { w: BASE, h: Math.round(BASE * r.h / r.w) };
    return { w: Math.round(BASE * r.w / r.h), h: BASE };
  }

  const Grid = {
    metrics() {
      const s = TJ.Store.get();
      const cols = s.canvas.columns;
      const dims = baseDims(s.canvas.ratio);
      // rows chosen to keep cells near-square, but cells fill canvas exactly
      const rows = Math.max(1, Math.round(cols * dims.h / dims.w));
      return {
        cols, rows,
        w: dims.w, h: dims.h,
        cellW: dims.w / cols,
        cellH: dims.h / rows,
      };
    },

    // clamp a grid rect into the field
    clampRect(r, m) {
      const gw = TJ.clamp(r.gw, 1, m.cols);
      const gh = TJ.clamp(r.gh, 1, m.rows);
      return {
        gx: TJ.clamp(r.gx, 0, m.cols - gw),
        gy: TJ.clamp(r.gy, 0, m.rows - gh),
        gw, gh,
      };
    },

    // pixel rect (within canvas) -> nearest grid rect
    snapFromPixels(px, py, pw, ph, m) {
      const gx = Math.round(px / m.cellW);
      const gy = Math.round(py / m.cellH);
      const gw = Math.max(1, Math.round(pw / m.cellW));
      const gh = Math.max(1, Math.round(ph / m.cellH));
      return this.clampRect({ gx, gy, gw, gh }, m);
    },

    pxRect(item, m) {
      return {
        left: item.gx * m.cellW,
        top: item.gy * m.cellH,
        width: item.gw * m.cellW,
        height: item.gh * m.cellH,
      };
    },

    /* ---- render whole canvas ---- */
    renderCanvasBox() {
      const m = this.metrics();
      const frame = TJ.$("#canvasFrame");
      const canvas = TJ.$("#canvas");
      frame.style.width = canvas.style.width = m.w + "px";
      frame.style.height = canvas.style.height = m.h + "px";
    },

    renderGridLines() {
      const s = TJ.Store.get();
      const m = this.metrics();
      const box = TJ.$("#gridLines");
      box.classList.toggle("is-hidden", !s.canvas.showGrid);
      box.innerHTML = "";
      box.appendChild(TJ.el("div", { class: "margin" }));
      for (let c = 1; c < m.cols; c++)
        box.appendChild(TJ.el("div", { class: "v", style: `left:${c * m.cellW}px` }));
      for (let r = 1; r < m.rows; r++)
        box.appendChild(TJ.el("div", { class: "h", style: `top:${r * m.cellH}px` }));
    },

    renderItems() {
      const s = TJ.Store.get();
      const m = this.metrics();
      const layer = TJ.$("#items");
      // reconcile: build fresh (simple + robust); editor reattaches handlers via delegation
      layer.innerHTML = "";
      s.items.forEach((item, i) => {
        const node = item.type === "photo" ? this.renderPhoto(item, m) : TJ.typography.renderText(item, m);
        node.style.zIndex = String(10 + i);
        const r = this.pxRect(item, m);
        node.style.left = r.left + "px";
        node.style.top = r.top + "px";
        node.style.width = r.width + "px";
        node.style.height = r.height + "px";
        if (TJ.editor && TJ.editor.selectedId === item.id) node.classList.add("is-selected");
        layer.appendChild(node);
      });
    },

    renderPhoto(item, m) {
      const p = TJ.photos.get(item.photoId);
      const node = TJ.el("div", { class: "item item--photo" + (item.night ? " is-night" : ""), "data-id": item.id });
      const frame = TJ.el("div", { class: "frame" });
      if (p) {
        const img = TJ.el("img", { src: p.url, alt: p.name, draggable: "false" });
        this.applyImgTransform(img, item);
        frame.appendChild(img);
      } else {
        frame.appendChild(TJ.el("div", { class: "muted", style: "padding:8px;font-size:11px", text: "이미지 없음" }));
      }
      node.appendChild(frame);
      // resize handles
      ["tl", "tr", "bl", "br"].forEach((h) =>
        node.appendChild(TJ.el("div", { class: "handle handle--" + h, "data-handle": h })));
      // editorial caption
      if (item.showCaption && p) {
        const bits = [];
        if (p.time) bits.push(TJ.fmtDateTime(p.time));
        if (p.gps) bits.push(`${p.gps.lat.toFixed(4)}, ${p.gps.lon.toFixed(4)}`);
        node.appendChild(TJ.el("div", { class: "item__caption", text: bits.join("   ·   ") || p.name }));
      }
      return node;
    },

    applyImgTransform(img, item) {
      // zoom>=1 covers frame; offx/offy pan as fraction of frame
      const z = item.zoom || 1;
      const tx = (item.offx || 0) * 100;
      const ty = (item.offy || 0) * 100;
      img.style.transform = `translate(${tx}%, ${ty}%) scale(${z})`;
    },

    renderAll() {
      this.renderCanvasBox();
      this.renderGridLines();
      this.renderItems();
    },
  };

  TJ.grid = Grid;
})(window.TJ);
