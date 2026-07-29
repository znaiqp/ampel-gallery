/* editor.js — pointer-driven editing: select, move, grid-resize, crop/pan/zoom,
   drag from index to canvas, delete, layer order, keyboard. Mouse + touch via
   Pointer Events (touch-action:none on items). */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const Editor = {
    selectedId: null,
    cropId: null,          // item currently in crop mode
    mode: "idle",
    drag: null,

    init() {
      this.canvas = TJ.$("#canvas");
      this.items = TJ.$("#items");
      this.bindCanvas();
      this.bindIndexDrag();
      this.bindKeyboard();
      this.bindFileDrop();
    },

    /* ---------- coordinate helpers ---------- */
    canvasPoint(e) {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    },

    select(id) {
      this.selectedId = id;
      if (this.cropId && this.cropId !== id) this.exitCrop();
      TJ.grid.renderItems();
      TJ.inspector.render();
    },
    deselect() {
      this.selectedId = null;
      this.exitCrop(true);
      TJ.grid.renderItems();
      TJ.inspector.render();
    },

    /* ---------- selection + move + resize on canvas ---------- */
    bindCanvas() {
      this.items.addEventListener("pointerdown", (e) => {
        const handle = e.target.closest(".handle");
        const node = e.target.closest(".item");
        if (!node) return;
        const id = node.getAttribute("data-id");
        const item = TJ.Store.itemById(id);
        if (!item) return;

        // if editing text, let the caret work
        if (node.classList.contains("item--text") && e.target.isContentEditable) return;

        if (handle) { this.startResize(e, node, item, handle.getAttribute("data-handle")); return; }

        this.select(id);

        if (this.cropId === id) { this.startCrop(e, node, item); return; }
        this.startMove(e, node, item);
      });

      // click empty canvas => deselect
      this.canvas.addEventListener("pointerdown", (e) => {
        if (e.target === this.canvas || e.target.closest(".grid-lines")) this.deselect();
      });

      // double-click text => edit inline
      this.items.addEventListener("dblclick", (e) => {
        const node = e.target.closest(".item--text");
        if (!node) return;
        this.editText(node);
      });

      // wheel to zoom image when cropping
      this.canvas.addEventListener("wheel", (e) => {
        if (!this.cropId) return;
        const item = TJ.Store.itemById(this.cropId);
        if (!item) return;
        e.preventDefault();
        const nz = TJ.clamp((item.zoom || 1) * (e.deltaY < 0 ? 1.06 : 0.94), 1, 6);
        TJ.Store.update((s) => { TJ.Store.itemById(this.cropId).zoom = nz; }, "zoom");
        TJ.grid.renderItems();
        TJ.inspector.render();
      }, { passive: false });
    },

    startMove(e, node, item) {
      const m = TJ.grid.metrics();
      const p = this.canvasPoint(e);
      const r = TJ.grid.pxRect(item, m);
      this.mode = "move";
      this.drag = { id: item.id, node, m, dx: p.x - r.left, dy: p.y - r.top, w: r.width, h: r.height, moved: false };
      node.classList.add("is-floating");
      node.setPointerCapture(e.pointerId);
      const move = (ev) => this.onMove(ev);
      const up = (ev) => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        this.finishMove(ev);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    },
    onMove(e) {
      if (this.mode !== "move") return;
      const d = this.drag, p = this.canvasPoint(e);
      let left = TJ.clamp(p.x - d.dx, 0, d.m.w - d.w);
      let top = TJ.clamp(p.y - d.dy, 0, d.m.h - d.h);
      d.node.style.left = left + "px";
      d.node.style.top = top + "px";
      d.left = left; d.top = top; d.moved = true;
    },
    finishMove(e) {
      const d = this.drag; this.mode = "idle";
      d.node.classList.remove("is-floating");
      if (!d.moved) { this.drag = null; return; }
      const snap = TJ.grid.snapFromPixels(d.left, d.top, d.w, d.h, d.m);
      TJ.Store.commit((s) => {
        const it = TJ.Store.itemById(d.id);
        it.gx = snap.gx; it.gy = snap.gy;
      }, "move");
      this.drag = null;
      TJ.grid.renderItems(); TJ.inspector.render();
    },

    startResize(e, node, item, handle) {
      const m = TJ.grid.metrics();
      const r = TJ.grid.pxRect(item, m);
      this.mode = "resize";
      this.drag = { id: item.id, node, m, handle, start: this.canvasPoint(e), r: { ...r }, changed: false };
      node.setPointerCapture(e.pointerId);
      const move = (ev) => this.onResize(ev);
      const up = (ev) => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        this.finishResize(ev);
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    },
    onResize(e) {
      if (this.mode !== "resize") return;
      const d = this.drag, p = this.canvasPoint(e);
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      let { left, top, width, height } = d.r;
      const h = d.handle;
      if (h.includes("r")) width = d.r.width + dx;
      if (h.includes("l")) { width = d.r.width - dx; left = d.r.left + dx; }
      if (h.includes("b")) height = d.r.height + dy;
      if (h.includes("t")) { height = d.r.height - dy; top = d.r.top + dy; }
      width = Math.max(d.m.cellW * 0.5, width);
      height = Math.max(d.m.cellH * 0.5, height);
      Object.assign(d.node.style, { left: left + "px", top: top + "px", width: width + "px", height: height + "px" });
      d.live = { left, top, width, height }; d.changed = true;
    },
    finishResize(e) {
      const d = this.drag; this.mode = "idle";
      if (!d.changed) { this.drag = null; return; }
      const L = d.live;
      const snap = TJ.grid.snapFromPixels(L.left, L.top, L.width, L.height, d.m);
      TJ.Store.commit((s) => {
        const it = TJ.Store.itemById(d.id);
        it.gx = snap.gx; it.gy = snap.gy; it.gw = snap.gw; it.gh = snap.gh;
      }, "resize");
      this.drag = null;
      TJ.grid.renderItems(); TJ.inspector.render();
    },

    /* ---------- crop / pan / zoom inside frame ---------- */
    toggleCrop(id) {
      if (this.cropId === id) { this.exitCrop(); return; }
      this.cropId = id;
      TJ.grid.renderItems();
      const node = this.items.querySelector(`[data-id="${id}"]`);
      if (node) node.classList.add("is-cropping");
      TJ.inspector.render();
      TJ.toast("크롭 모드 — 드래그로 이동, 휠로 확대/축소");
    },
    exitCrop(silent) {
      if (!this.cropId) return;
      const node = this.items.querySelector(`[data-id="${this.cropId}"]`);
      if (node) node.classList.remove("is-cropping");
      this.cropId = null;
      if (!silent) { TJ.grid.renderItems(); TJ.inspector.render(); }
    },
    startCrop(e, node, item) {
      const p = item.type === "photo" ? item : null;
      if (!p) return;
      this.mode = "crop";
      const m = TJ.grid.metrics();
      const r = TJ.grid.pxRect(item, m);
      this.drag = { id: item.id, node, start: this.canvasPoint(e),
        offx0: item.offx || 0, offy0: item.offy || 0, fw: r.width, fh: r.height, changed: false };
      node.setPointerCapture(e.pointerId);
      const img = node.querySelector("img");
      const move = (ev) => {
        const q = this.canvasPoint(ev);
        const nx = TJ.clamp(this.drag.offx0 + (q.x - this.drag.start.x) / this.drag.fw, -1, 1);
        const ny = TJ.clamp(this.drag.offy0 + (q.y - this.drag.start.y) / this.drag.fh, -1, 1);
        this.drag.nx = nx; this.drag.ny = ny; this.drag.changed = true;
        if (img) img.style.transform = `translate(${nx * 100}%, ${ny * 100}%) scale(${item.zoom || 1})`;
      };
      const up = () => {
        node.removeEventListener("pointermove", move);
        node.removeEventListener("pointerup", up);
        this.mode = "idle";
        if (this.drag.changed) {
          TJ.Store.commit((s) => {
            const it = TJ.Store.itemById(this.drag.id);
            it.offx = this.drag.nx; it.offy = this.drag.ny;
          }, "crop-pan");
        }
        this.drag = null;
      };
      node.addEventListener("pointermove", move);
      node.addEventListener("pointerup", up);
    },

    /* ---------- inline text editing ---------- */
    editText(node) {
      const id = node.getAttribute("data-id");
      const txt = node.querySelector(".txt");
      txt.setAttribute("contenteditable", "true");
      txt.focus();
      // place caret at end
      const range = document.createRange(); range.selectNodeContents(txt); range.collapse(false);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      const commit = () => {
        txt.setAttribute("contenteditable", "false");
        txt.removeEventListener("blur", commit);
        const val = txt.innerText.replace(/\n$/, "");
        TJ.Store.commit((s) => { const it = TJ.Store.itemById(id); if (it) it.text = val; }, "text-edit");
        TJ.inspector.render();
      };
      txt.addEventListener("blur", commit);
    },

    /* ---------- drag a photo from the index onto the canvas ---------- */
    bindIndexDrag() {
      const list = TJ.$("#indexList");
      list.addEventListener("pointerdown", (e) => {
        const idx = e.target.closest(".idx");
        if (!idx) return;
        const photoId = idx.getAttribute("data-photo");
        e.preventDefault();
        const ghost = TJ.el("img", { src: TJ.photos.get(photoId).url,
          style: "position:fixed;z-index:999;width:120px;pointer-events:none;opacity:.85;box-shadow:0 12px 30px -12px rgba(0,0,0,.6);transform:translate(-50%,-50%)" });
        document.body.appendChild(ghost);
        const move = (ev) => { ghost.style.left = ev.clientX + "px"; ghost.style.top = ev.clientY + "px"; };
        move(e);
        const up = (ev) => {
          document.removeEventListener("pointermove", move);
          document.removeEventListener("pointerup", up);
          ghost.remove();
          const cr = this.canvas.getBoundingClientRect();
          if (ev.clientX >= cr.left && ev.clientX <= cr.right && ev.clientY >= cr.top && ev.clientY <= cr.bottom) {
            this.dropPhoto(photoId, ev.clientX - cr.left, ev.clientY - cr.top);
          }
        };
        document.addEventListener("pointermove", move);
        document.addEventListener("pointerup", up);
      });
    },

    dropPhoto(photoId, px, py) {
      const p = TJ.photos.get(photoId);
      const m = TJ.grid.metrics();
      const gw = Math.min(4, m.cols);
      const aspect = p ? p.h / p.w : 1;
      let gh = Math.max(1, Math.round(gw * aspect * (m.cellW / m.cellH)));
      gh = Math.min(gh, m.rows);
      const gx = TJ.clamp(Math.round(px / m.cellW - gw / 2), 0, m.cols - gw);
      const gy = TJ.clamp(Math.round(py / m.cellH - gh / 2), 0, m.rows - gh);
      const item = TJ.makePhotoItem(photoId, gx, gy, gw, gh);
      TJ.Store.commit((s) => { TJ.Store.addItem(item); if (s.accent === "#111111" && p) s.accent = p.accent; }, "add-photo");
      TJ.applyAccent();
      this.select(item.id);
      TJ.index.render();
    },

    /* ---------- file drop onto index / canvas ---------- */
    bindFileDrop() {
      const drop = TJ.$("#indexDrop");
      const zones = [drop, this.canvas];
      zones.forEach((z) => {
        z.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("is-over"); });
        z.addEventListener("dragleave", () => drop.classList.remove("is-over"));
        z.addEventListener("drop", async (e) => {
          e.preventDefault(); drop.classList.remove("is-over");
          if (!e.dataTransfer.files.length) return;
          await TJ.main.addFiles(e.dataTransfer.files);
        });
      });
    },

    /* ---------- keyboard ---------- */
    bindKeyboard() {
      document.addEventListener("keydown", (e) => {
        const editing = document.activeElement &&
          (document.activeElement.isContentEditable ||
           /INPUT|TEXTAREA/.test(document.activeElement.tagName));
        const mod = e.ctrlKey || e.metaKey;
        if (mod && e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) TJ.Store.redo(); else TJ.Store.undo();
          return;
        }
        if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); TJ.Store.redo(); return; }
        if (editing) return;
        if (!this.selectedId) return;
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); this.deleteSelected(); return; }
        if (e.key === "[") { TJ.Store.commit((s) => TJ.Store.lower(this.selectedId), "lower"); TJ.grid.renderItems(); return; }
        if (e.key === "]") { TJ.Store.commit((s) => TJ.Store.raise(this.selectedId), "raise"); TJ.grid.renderItems(); return; }
        // arrow nudge (grid units)
        const nudge = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
        if (nudge) {
          e.preventDefault();
          const m = TJ.grid.metrics();
          TJ.Store.commit((s) => {
            const it = TJ.Store.itemById(this.selectedId);
            it.gx = TJ.clamp(it.gx + nudge[0], 0, m.cols - it.gw);
            it.gy = TJ.clamp(it.gy + nudge[1], 0, m.rows - it.gh);
          }, "nudge");
          TJ.grid.renderItems(); TJ.inspector.render();
        }
      });
    },

    deleteSelected() {
      const id = this.selectedId;
      if (!id) return;
      this.exitCrop(true);
      TJ.Store.commit((s) => TJ.Store.removeItem(id), "delete");
      this.selectedId = null;
      TJ.grid.renderItems(); TJ.inspector.render(); TJ.index.render();
    },

    replaceSelectedWith(photoId) {
      const id = this.selectedId;
      const it = TJ.Store.itemById(id);
      if (!it || it.type !== "photo") return;
      TJ.Store.commit((s) => {
        const t = TJ.Store.itemById(id);
        t.photoId = photoId; t.zoom = 1; t.offx = 0; t.offy = 0;
      }, "replace");
      TJ.grid.renderItems(); TJ.inspector.render(); TJ.index.render();
    },
  };

  TJ.editor = Editor;
})(window.TJ);
