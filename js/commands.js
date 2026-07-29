/* commands.js — natural-language layout command prototype.
   Deliberately isolated behind TJ.commands.run(text) so the interpreter can be
   swapped for a real AI API later without touching the rest of the app.
   v1: keyword + rule interpretation only (no network). */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const has = (t, ...kw) => kw.some((k) => t.includes(k));

  // photo items with their capture record attached
  function photoItems() {
    return TJ.Store.get().items
      .filter((i) => i.type === "photo")
      .map((i) => ({ it: i, p: TJ.photos.get(i.photoId) }));
  }

  // re-flow a set of photo items into the grid in a given order
  function reflow(order, { perRow } = {}) {
    const m = TJ.grid.metrics();
    perRow = perRow || (m.cols >= 12 ? 4 : m.cols >= 8 ? 3 : 2);
    const blockW = Math.max(1, Math.floor(m.cols / perRow));
    const rows = Math.max(1, Math.ceil(order.length / perRow));
    const rowH = Math.max(1, Math.floor(m.rows / rows));
    let col = 0, row = 0;
    order.forEach((it) => {
      if (col + blockW > m.cols) { col = 0; row += rowH; }
      it.gx = col; it.gy = Math.min(row, m.rows - rowH); it.gw = blockW; it.gh = rowH;
      col += blockW;
    });
  }

  const Handlers = {
    // "촬영 시간순으로 정리"
    sortByTime(t) {
      const items = photoItems();
      if (!items.length) return "배치된 사진이 없습니다.";
      const order = items.slice().sort((a, b) => {
        if (a.p && b.p && a.p.time && b.p.time) return a.p.time - b.p.time;
        return (a.p ? a.p.order : 0) - (b.p ? b.p.order : 0);
      }).map((x) => x.it);
      TJ.Store.commit(() => reflow(order), "cmd-sort-time");
      return "촬영 시간순으로 정리했습니다.";
    },

    // "밤 사진을 오른쪽/왼쪽에 모아"
    gatherNight(t) {
      const side = has(t, "왼쪽", "left") ? "left" : "right";
      const m = TJ.grid.metrics();
      const items = photoItems();
      const night = items.filter((x) => x.it.night || (x.p && TJ.isNight(x.p.time)));
      if (!night.length) return "밤에 촬영된 사진을 찾지 못했습니다.";
      const half = Math.floor(m.cols / 2);
      const blockW = Math.max(1, Math.floor(half / Math.min(2, night.length)) || half);
      TJ.Store.commit(() => {
        let row = 0, col = side === "right" ? m.cols - half : 0;
        const startCol = col;
        night.forEach((x) => {
          if (col + blockW > startCol + half) { col = startCol; row += Math.max(2, Math.floor(m.rows / Math.ceil(night.length / 2))); }
          x.it.gx = TJ.clamp(col, 0, m.cols - blockW);
          x.it.gy = TJ.clamp(row, 0, m.rows - 2);
          x.it.gw = blockW; x.it.gh = Math.min(m.rows - row, Math.max(2, x.it.gh));
          col += blockW;
        });
      }, "cmd-gather-night");
      return `밤 사진 ${night.length}장을 ${side === "right" ? "오른쪽" : "왼쪽"}으로 모았습니다.`;
    },

    // "첫날 사진을 더 촘촘하게"
    tightenFirstDay(t) {
      const items = photoItems().filter((x) => x.p);
      if (!items.length) return "배치된 사진이 없습니다.";
      const dated = items.filter((x) => x.p.time).sort((a, b) => a.p.time - b.p.time);
      let target;
      if (dated.length) {
        const first = dated[0].p.time;
        const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        const firstKey = key(first);
        target = dated.filter((x) => key(x.p.time) === firstKey).map((x) => x.it);
      } else {
        target = items.slice(0, Math.ceil(items.length / 3)).map((x) => x.it);
      }
      if (!target.length) return "첫날 사진을 찾지 못했습니다.";
      const m = TJ.grid.metrics();
      TJ.Store.commit(() => {
        const perRow = Math.min(target.length, m.cols);
        const bw = Math.max(1, Math.floor(m.cols / perRow));
        let col = 0, row = 0;
        target.forEach((it) => {
          if (col + bw > m.cols) { col = 0; row += bw; }
          it.gx = col; it.gy = Math.min(row, m.rows - 1); it.gw = bw; it.gh = Math.min(bw, m.rows - row) || 1;
          col += bw;
        });
      }, "cmd-tighten");
      return `첫날 사진 ${target.length}장을 촘촘하게 배치했습니다.`;
    },

    // "여백을 넓혀" — shrink every photo by one cell where possible
    widenMargins(t) {
      const items = photoItems();
      if (!items.length) return "배치된 사진이 없습니다.";
      TJ.Store.commit(() => {
        items.forEach((x) => {
          x.it.gw = Math.max(1, x.it.gw - (x.it.gw > 2 ? 1 : 0));
          x.it.gh = Math.max(1, x.it.gh - (x.it.gh > 2 ? 1 : 0));
        });
      }, "cmd-widen");
      return "사진 크기를 줄여 여백을 넓혔습니다.";
    },

    // "제목을 왼쪽 위에 크게"
    placeTitle(t) {
      const m = TJ.grid.metrics();
      let title = TJ.Store.get().items.find((i) => i.type === "text" && i.role === "title");
      const meta = TJ.Store.get().meta;
      TJ.Store.commit((s) => {
        if (!title) {
          title = TJ.typography.create("title", meta.title || "여행 제목");
          s.items.push(title);
        }
        const it = s.items.find((i) => i.id === title.id);
        it.gx = 0; it.gy = 0;
        it.gw = Math.min(6, m.cols);
        if (has(t, "크게")) it.size = Math.max(it.size, 72);
        if (has(t, "오른쪽")) it.gx = m.cols - it.gw;
        if (has(t, "가운데", "중앙")) { it.gx = Math.floor((m.cols - it.gw) / 2); it.align = "center"; }
      }, "cmd-title");
      return "제목을 배치했습니다.";
    },

    columns(t) {
      const n = has(t, "12") ? 12 : has(t, "8") ? 8 : has(t, "6") ? 6 : null;
      if (!n) return null;
      TJ.Store.commit((s) => { s.canvas.columns = n; }, "cmd-columns");
      TJ.main.syncTopbar();
      return `${n}칼럼 그리드로 변경했습니다.`;
    },

    toggleGrid(t) {
      const on = has(t, "켜", "표시", "show");
      TJ.Store.commit((s) => { s.canvas.showGrid = on; }, "cmd-grid");
      TJ.main.syncTopbar();
      return `그리드를 ${on ? "표시" : "숨김"}했습니다.`;
    },
  };

  function interpret(text) {
    const t = text.trim().toLowerCase();
    if (!t) return null;
    if (has(t, "시간순", "시간 순", "촬영순", "chronolog")) return Handlers.sortByTime(t);
    if (has(t, "밤", "야간", "night")) return Handlers.gatherNight(t);
    if (has(t, "첫날", "첫 날", "첫째 날") && has(t, "촘촘", "빽빽", "좁게", "밀집")) return Handlers.tightenFirstDay(t);
    if (has(t, "촘촘", "빽빽", "밀집")) return Handlers.tightenFirstDay(t);
    if (has(t, "여백", "margin", "넓게", "넓혀")) return Handlers.widenMargins(t);
    if (has(t, "제목", "타이틀", "title")) return Handlers.placeTitle(t);
    if (has(t, "칼럼", "컬럼", "column")) return Handlers.columns(t);
    if (has(t, "그리드") && has(t, "켜", "꺼", "표시", "숨")) return Handlers.toggleGrid(t);
    return null;
  }

  const Commands = {
    examples: [
      "사진을 촬영 시간순으로 정리해 줘.",
      "첫날 사진을 더 촘촘하게 배치해 줘.",
      "밤 사진을 오른쪽에 모아 줘.",
      "제목을 왼쪽 위에 크게 배치해 줘.",
      "사진의 여백을 넓혀 줘.",
    ],
    // public entry point — returns {handled, message}
    run(text) {
      let msg = null;
      try { msg = interpret(text); }
      catch (e) { console.error(e); return { handled: false, message: "명령 처리 중 오류가 발생했습니다." }; }
      if (msg == null) {
        return { handled: false,
          message: "해석하지 못했습니다. 예: “촬영 시간순으로 정리”, “밤 사진을 오른쪽에”, “제목을 왼쪽 위에 크게”." };
      }
      TJ.applyAccent(); TJ.rerender(); TJ.index.render();
      return { handled: true, message: msg };
    },
  };

  TJ.commands = Commands;
})(window.TJ);
