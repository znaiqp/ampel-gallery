/* memory.js — rule-based automatic layout from capture metadata.
   Rules (no AI): sort by time; break into clusters on large time/geo gaps;
   tighter blocks inside a cluster, wider whitespace between clusters;
   night photos flagged for differentiated treatment; accent from first photo.
   Falls back to file order + colour when metadata is missing. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const TIME_GAP_MS = 3 * 60 * 60 * 1000;  // >3h starts a new cluster
  const GEO_GAP_KM = 25;                    // >25km starts a new cluster

  function ordered() {
    const photos = TJ.photos.all();
    const withTime = photos.filter((p) => p.time).length;
    if (withTime >= Math.max(2, photos.length * 0.5)) {
      return photos.slice().sort((a, b) => {
        if (a.time && b.time) return a.time - b.time;
        if (a.time) return -1; if (b.time) return 1;
        return a.order - b.order;
      });
    }
    return photos.slice().sort((a, b) => a.order - b.order); // fallback: file order
  }

  function clusters(list) {
    const groups = [];
    let cur = [];
    for (let i = 0; i < list.length; i++) {
      const p = list[i], prev = list[i - 1];
      let brk = false, wide = false;
      if (prev) {
        if (p.time && prev.time) {
          const gap = p.time - prev.time;
          if (gap > TIME_GAP_MS) { brk = true; if (gap > TIME_GAP_MS * 4) wide = true; }
        }
        if (p.gps && prev.gps && TJ.geoDistance(p.gps, prev.gps) > GEO_GAP_KM) { brk = true; wide = true; }
      }
      if (brk && cur.length) { groups.push({ photos: cur, wide }); cur = []; }
      cur.push(p);
    }
    if (cur.length) groups.push({ photos: cur, wide: false });
    return groups;
  }

  const Memory = {
    build() {
      const photos = TJ.photos.all();
      if (!photos.length) { TJ.toast("Import photos first."); return; }
      const m = TJ.grid.metrics();
      const list = ordered();
      const groups = clusters(list);

      const perRow = m.cols >= 12 ? 4 : m.cols >= 8 ? 3 : 2;
      const blockW = Math.max(1, Math.floor(m.cols / perRow));
      // estimate rows needed to pick a block height that fits
      const rowsOfPhotos = groups.reduce((acc, g) => acc + Math.ceil(g.photos.length / perRow), 0);
      const gapRows = groups.reduce((a, g, i) => a + (i > 0 ? (g.wide ? 2 : 1) : 0), 0);
      const rowH = Math.max(1, Math.floor((m.rows - gapRows) / Math.max(1, rowsOfPhotos)));

      const items = [];
      let row = 0;
      groups.forEach((g, gi) => {
        if (gi > 0) row += (g.wide ? 2 : 1); // whitespace between clusters
        let col = 0;
        g.photos.forEach((p) => {
          if (col + blockW > m.cols) { col = 0; row += rowH; }
          const gx = col, gy = row;
          if (gy + rowH > m.rows) return; // don't overflow the canvas field
          const it = TJ.makePhotoItem(p.id, gx, gy, blockW, rowH);
          it.night = TJ.isNight(p.time);
          items.push(it);
          col += blockW;
        });
        row += rowH;
      });

      // title text from meta, if present, sits top-left
      const extra = [];
      const meta = TJ.Store.get().meta;
      if (meta.title) {
        const t = TJ.typography.create("title", meta.title);
        t.gx = 0; t.gy = 0; extra.push(t);
      }

      TJ.Store.commit((s) => {
        s.items = extra.concat(items);
        s.accent = photos.sort((a, b) => a.order - b.order)[0].accent || s.accent;
      }, "memory-grid");

      TJ.applyAccent();
      TJ.editor.selectedId = null;
      TJ.rerender(); TJ.index.render();
      TJ.toast(`Memory Grid — ${groups.length} groups · ${items.length} photos placed`);
    },
  };

  TJ.memory = Memory;
})(window.TJ);
