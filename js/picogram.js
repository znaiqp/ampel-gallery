/* picogram.js — dot-matrix signal maker. A grid of grey dots you paint by
   dragging (mouse/touch) or with your hand (pinch-drag in gesture mode). Lit
   dots default to green, like an LED pedestrian signal. Export as PNG. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const COLS = 24, ROWS = 24, DOT = 18;      // square dot matrix, on-screen cell size
  const OFF = "#2b2b2b";
  const COLORS = { green: "#22c55e", red: "#ef4444", amber: "#f5a623" };
  const CODE = { green: 1, red: 2, amber: 3, erase: 0 };
  const CODE_COLOR = { 1: COLORS.green, 2: COLORS.red, 3: COLORS.amber };

  const Pico = {
    open: false,
    grid: new Uint8Array(COLS * ROWS),
    color: "green",
    undoStack: [],
    opener: "editor",
    lastCell: null,
    handCell: null,

    isActive() { return this.open; },

    init() {
      this.canvas = TJ.$("#picoCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.setupCanvas();
      this.bind();
      this.redraw();
    },

    setupCanvas() {
      const dpr = window.devicePixelRatio || 1;
      const w = COLS * DOT, h = ROWS * DOT;
      this.canvas.style.width = w + "px";
      this.canvas.style.height = h + "px";
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    },

    show(from) {
      this.opener = from || "editor";
      TJ.$("#pico").hidden = false;
      this.open = true;
      this.redraw();
    },
    hide() {
      this.open = false;
      TJ.$("#pico").hidden = true;
      TJ.$("#handCursor").hidden = true;
      if (this.opener === "landing" && TJ.landing && TJ.landing.shown === false) {
        TJ.$("#landing").hidden = false; TJ.landing.shown = true; TJ.landing.spin();
      }
    },

    bind() {
      const cv = this.canvas;
      let drawing = false;
      const paintEvt = (e) => this.paintAtClient(e.clientX, e.clientY);
      cv.addEventListener("pointerdown", (e) => {
        drawing = true; this.pushUndo(); this.lastCell = null;
        cv.setPointerCapture(e.pointerId); paintEvt(e);
      });
      cv.addEventListener("pointermove", (e) => { if (drawing) paintEvt(e); });
      const end = () => { drawing = false; this.lastCell = null; };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);

      TJ.$$("#picoSwatches .pico-sw").forEach((b) => b.addEventListener("click", () => {
        TJ.$$("#picoSwatches .pico-sw").forEach((x) => x.classList.remove("is-active"));
        b.classList.add("is-active");
        this.color = b.getAttribute("data-color");
      }));
      TJ.$("#picoUndo").addEventListener("click", () => this.undo());
      TJ.$("#picoClear").addEventListener("click", () => { this.pushUndo(); this.grid.fill(0); this.redraw(); });
      TJ.$("#picoSave").addEventListener("click", () => this.exportPNG());
      TJ.$("#picoClose").addEventListener("click", () => this.hide());
      TJ.$("#picoGesture").addEventListener("click", () => TJ.gesture.toggle());
    },

    pushUndo() {
      this.undoStack.push(this.grid.slice());
      if (this.undoStack.length > 50) this.undoStack.shift();
    },
    undo() {
      if (!this.undoStack.length) return;
      this.grid = this.undoStack.pop();
      this.redraw();
    },

    cellFromClient(x, y) {
      const r = this.canvas.getBoundingClientRect();
      const c = Math.floor((x - r.left) / (r.width / COLS));
      const rw = Math.floor((y - r.top) / (r.height / ROWS));
      if (c < 0 || c >= COLS || rw < 0 || rw >= ROWS) return null;
      return { c, r: rw };
    },

    setCell(c, r) {
      this.grid[r * COLS + c] = CODE[this.color];
    },

    // paint with interpolation from the previous cell so fast strokes stay solid
    paintCell(cell) {
      if (!cell) return;
      if (this.lastCell) {
        const dc = cell.c - this.lastCell.c, dr = cell.r - this.lastCell.r;
        const steps = Math.max(Math.abs(dc), Math.abs(dr));
        for (let i = 1; i <= steps; i++) {
          this.setCell(Math.round(this.lastCell.c + dc * i / steps), Math.round(this.lastCell.r + dr * i / steps));
        }
      } else {
        this.setCell(cell.c, cell.r);
      }
      this.lastCell = cell;
      this.redraw();
    },
    paintAtClient(x, y) { this.paintCell(this.cellFromClient(x, y)); },

    redraw() {
      const ctx = this.ctx, rad = DOT * 0.4;
      ctx.clearRect(0, 0, COLS * DOT, ROWS * DOT);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const v = this.grid[r * COLS + c];
        ctx.beginPath();
        ctx.arc(c * DOT + DOT / 2, r * DOT + DOT / 2, rad, 0, 7);
        ctx.fillStyle = v ? CODE_COLOR[v] : OFF;
        ctx.fill();
      }
    },

    exportPNG() {
      const S = 4, pad = 3;
      const w = (COLS + pad * 2) * DOT * S, h = (ROWS + pad * 2) * DOT * S;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#141414"; ctx.fillRect(0, 0, w, h);
      const rad = DOT * S * 0.4, off = pad * DOT * S;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const v = this.grid[r * COLS + c];
        ctx.beginPath();
        ctx.arc(off + c * DOT * S + DOT * S / 2, off + r * DOT * S + DOT * S / 2, rad, 0, 7);
        ctx.fillStyle = v ? CODE_COLOR[v] : "#242424";
        ctx.fill();
      }
      cv.toBlob((b) => TJ.download(b, "signal-pictogram-" + Date.now() + ".png"), "image/png");
      TJ.toast("픽토그램 PNG 저장됨");
    },

    /* ---- hand drawing (called from gesture.js when pico is active) ----
       The index fingertip lights dots as it passes over them; make a fist
       (index folded) to lift the pen and just move the cursor. */
    onHand(hands) {
      const cur = TJ.$("#handCursor");
      const lm = hands && hands[0];
      if (!lm) { cur.hidden = true; this.handDrawing = false; this.lastCell = null; return; }
      const r = this.canvas.getBoundingClientRect();
      const sx = r.left + (1 - lm[8].x) * r.width;   // fingertip (index tip), mirror x
      const sy = r.top + lm[8].y * r.height;
      cur.hidden = false; cur.style.left = sx + "px"; cur.style.top = sy + "px";
      cur.style.borderColor = this.color === "erase" ? "#c9c9c9" : COLORS[this.color];
      // pen is "down" when the index finger is extended (tip above its lower joint)
      const penDown = lm[8].y < lm[6].y - 0.02;
      if (penDown) {
        if (!this.handDrawing) { this.pushUndo(); this.handDrawing = true; this.lastCell = null; }
        this.paintCell(this.cellFromClient(sx, sy));
        TJ.gesture.setHud("그리는 중 — 손가락이 지나가는 점이 켜집니다");
      } else {
        this.handDrawing = false; this.lastCell = null;
        TJ.gesture.setHud("검지를 펴서 점 위를 지나가면 그려집니다 · 주먹은 펜 올리기");
      }
    },
  };

  TJ.pico = Pico;
})(window.TJ);
