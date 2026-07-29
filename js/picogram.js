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

  // reference walking-pedestrian silhouette (source 7x11), scaled into the grid
  const WALK = ["0000000","0011000","0011000","0000000","0111100","1011010",
                "0011000","0011000","0101000","0100100","1100110"];
  function buildFigure() {
    const fw = 14, fh = 22, offX = Math.floor((COLS - fw) / 2), offY = Math.floor((ROWS - fh) / 2);
    const set = [];
    for (let r = 0; r < fh; r++) for (let c = 0; c < fw; c++) {
      const sr = Math.floor(r * 11 / fh), sc = Math.floor(c * 7 / fw);
      if (WALK[sr] && WALK[sr][sc] === "1") set.push((offY + r) * COLS + (offX + c));
    }
    return set;
  }

  // synthesized pedestrian-signal patterns (Web Audio; no copyrighted samples).
  // Each is a stylised nod to that country's real crossing sound.
  function signalPattern(country) {
    const tick = (f, n, gap) => Array.from({ length: n }, () => ({ f, d: 0.05, gap: gap != null ? gap : 0.09, type: "square" }));
    const accel = (f, n) => Array.from({ length: n }, (_, i) => ({ f, d: 0.05, gap: 0.18 - i * (0.11 / n), type: "square" }));
    const P = {
      "Japan":          [{ f: 988, d: 0.16 }, { f: 784, d: 0.32, gap: 0.12 }, { f: 988, d: 0.16 }, { f: 784, d: 0.32 }], // "kakkō" cuckoo
      "South Korea":    [{ f: 1318, d: 0.09, gap: 0.05 }, { f: 1318, d: 0.09, gap: 0.05 }, { f: 1568, d: 0.22 }],        // chirp + rise
      "USA":            tick(1200, 8),                                                                                   // rapid chirp
      "Canada":         tick(1100, 7),
      "United Kingdom": [{ f: 1046, d: 0.1, gap: 0.05 }, { f: 1046, d: 0.1, gap: 0.05 }, { f: 1046, d: 0.1, gap: 0.05 }, { f: 1046, d: 0.1 }],
      "Ireland":        tick(1400, 10, 0.04),                                                                            // fast Dublin-style buzz
      "Germany":        [{ f: 880, d: 0.7, type: "square" }],                                                            // steady tone
      "Austria":        [{ f: 830, d: 0.18, type: "square", gap: 0.06 }, { f: 830, d: 0.5, type: "square" }],
      "Australia":      accel(900, 8),                                                                                   // slow ticks -> fast burst
      "Taiwan":         accel(1500, 10),                                                                                 // countdown accelerando
      "Singapore":      tick(1600, 9, 0.06),
      "Netherlands":    tick(1000, 6, 0.11),
      "France":         [{ f: 740, d: 0.14, gap: 0.05 }, { f: 988, d: 0.14, gap: 0.05 }, { f: 740, d: 0.14, gap: 0.05 }, { f: 988, d: 0.2 }],
      "Denmark":        tick(1245, 8, 0.07),
      "Switzerland":    [{ f: 1046, d: 0.5, type: "square" }],
      "Sweden":         tick(1175, 7, 0.1),
      "Norway":         tick(1175, 7, 0.1),
    };
    return P[country] || [{ f: 784, d: 0.14, gap: 0.06 }, { f: 988, d: 0.14, gap: 0.06 }, { f: 1176, d: 0.24 }];
  }

  const Pico = {
    open: false,
    grid: new Uint8Array(COLS * ROWS),
    color: "green",
    undoStack: [],
    opener: "editor",
    lastCell: null,
    handCell: null,
    country: "",
    figure: null,
    activated: false,
    audio: null,

    isActive() { return this.open; },

    init() {
      this.canvas = TJ.$("#picoCanvas");
      this.ctx = this.canvas.getContext("2d");
      this.figure = buildFigure();
      this.figureSet = new Set(this.figure);
      this.showHints = true;
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

    show(from, meta) {
      this.opener = from || "editor";
      this.country = (meta && meta.country) || this.country || "";
      this.refUrl = (meta && meta.refUrl) || "";
      const ref = TJ.$("#picoRef"), bg = TJ.$("#picoBg");
      if (this.refUrl) {
        ref.style.backgroundImage = `url("${this.refUrl}")`; ref.classList.add("is-on");
        bg.style.backgroundImage = `url("${this.refUrl}")`; bg.classList.add("is-on");
      } else {
        ref.style.backgroundImage = ""; ref.classList.remove("is-on");
        bg.style.backgroundImage = ""; bg.classList.remove("is-on");
      }
      this.archivedThisDrawing = false;
      TJ.$("#pico").hidden = false;
      this.open = true;
      this.deactivate();
      this.redraw();
    },
    hide() {
      this.open = false;
      this.deactivate();
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
      TJ.$("#picoClear").addEventListener("click", () => { this.pushUndo(); this.grid.fill(0); this.archivedThisDrawing = false; this.redraw(); });
      TJ.$("#picoSave").addEventListener("click", () => this.exportPNG());
      TJ.$("#picoClose").addEventListener("click", () => this.hide());
      TJ.$("#picoX").addEventListener("click", () => this.hide());
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
        const idx = r * COLS + c;
        const v = this.grid[idx];
        const cx = c * DOT + DOT / 2, cy = r * DOT + DOT / 2;
        if (v) {
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7);
          ctx.fillStyle = CODE_COLOR[v]; ctx.fill();
        } else if (this.showHints && !this.activated && this.figureSet.has(idx)) {
          // faint guide dot: trace these to complete the walking figure
          ctx.beginPath(); ctx.arc(cx, cy, rad * 0.62, 0, 7);
          ctx.fillStyle = "rgba(34,197,94,0.24)"; ctx.fill();
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7);
          ctx.strokeStyle = "rgba(34,197,94,0.18)"; ctx.lineWidth = 1; ctx.stroke();
        } else {
          // translucent OFF dots when a reference photo is showing through
          ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7);
          ctx.fillStyle = this.refUrl ? "rgba(150,150,150,0.30)" : OFF; ctx.fill();
        }
      }
      this.checkFigure();
    },

    // when the drawing fills the pedestrian silhouette >=80%, "activate" the
    // signal: background goes black and the country's signal sound plays.
    checkFigure() {
      if (!this.figure) return;
      let hit = 0;
      for (const idx of this.figure) if (this.grid[idx]) hit++;
      const cov = hit / this.figure.length;
      if (cov >= 0.8 && !this.activated) this.activate();
      else if (cov < 0.6 && this.activated) this.deactivate();
    },

    activate() {
      this.activated = true;
      TJ.$("#pico").classList.add("is-lit");
      const label = this.country ? `${this.country} walk signal — ON` : "Walk signal — ON";
      const p = TJ.$(".pico-head p"); if (p) { p.dataset.orig = p.dataset.orig || p.textContent; p.textContent = "● " + label + " · sound playing"; }
      // play the country's real signal sound from YouTube; synth is the fallback
      if (!(TJ.ytSound && TJ.ytSound.play(this.country))) this.playSignal();
      if (!this.archivedThisDrawing && TJ.archive) {
        this.archivedThisDrawing = true;
        TJ.archive.add({ country: this.country, dataUrl: this.renderCanvas(3, 3).toDataURL("image/png") });
      }
    },
    deactivate() {
      if (TJ.ytSound) TJ.ytSound.stop();
      if (!this.activated && !TJ.$("#pico").classList.contains("is-lit")) return;
      this.activated = false;
      TJ.$("#pico").classList.remove("is-lit");
      const p = TJ.$(".pico-head p"); if (p && p.dataset.orig) p.textContent = p.dataset.orig;
    },

    ensureAudio() {
      if (!this.audio) { try { this.audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
      if (this.audio.state === "suspended") this.audio.resume();
      return this.audio;
    },
    playSignal() {
      const ac = this.ensureAudio(); if (!ac) return;
      const seq = signalPattern(this.country);
      let t = ac.currentTime + 0.03;
      seq.forEach((s) => {
        if (s.f > 0) {
          const o = ac.createOscillator(), g = ac.createGain();
          o.type = s.type || "sine"; o.frequency.value = s.f;
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(0.22, t + 0.012);
          g.gain.exponentialRampToValueAtTime(0.0001, t + s.d);
          o.connect(g).connect(ac.destination); o.start(t); o.stop(t + s.d + 0.03);
        }
        t += s.d + (s.gap != null ? s.gap : 0.02);
      });
      TJ.toast(this.country ? `${this.country} signal sound` : "Signal sound");
    },

    // render the grid onto a fresh canvas (used by PNG export and the archive)
    renderCanvas(S, pad) {
      S = S || 4; pad = pad != null ? pad : 3;
      const w = (COLS + pad * 2) * DOT * S, h = (ROWS + pad * 2) * DOT * S;
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = "#0a0a0a"; ctx.fillRect(0, 0, w, h);
      const rad = DOT * S * 0.4, off = pad * DOT * S;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const v = this.grid[r * COLS + c];
        ctx.beginPath();
        ctx.arc(off + c * DOT * S + DOT * S / 2, off + r * DOT * S + DOT * S / 2, rad, 0, 7);
        ctx.fillStyle = v ? CODE_COLOR[v] : "#1e1e1e";
        ctx.fill();
      }
      return cv;
    },
    exportPNG() {
      this.renderCanvas(4, 3).toBlob((b) => TJ.download(b, "signal-pictogram-" + Date.now() + ".png"), "image/png");
      TJ.toast("Pictogram saved as PNG");
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
        TJ.gesture.setHud("Drawing — dots light up as your finger passes");
      } else {
        this.handDrawing = false; this.lastCell = null;
        TJ.gesture.setHud("Extend your index finger over the dots to draw · fist = pen up");
      }
    },
  };

  TJ.pico = Pico;
})(window.TJ);
