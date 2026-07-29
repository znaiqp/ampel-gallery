/* main.js — bootstrap + wiring. Defines TJ.rerender / TJ.applyAccent used app-wide. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  TJ.applyAccent = function () {
    document.documentElement.style.setProperty("--accent", TJ.Store.get().accent || "#111111");
  };

  TJ.rerender = function () {
    TJ.grid.renderAll();
    TJ.inspector.render();
    const u = TJ.$("#btnUndo"), r = TJ.$("#btnRedo");
    if (u) u.disabled = !TJ.Store.canUndo();
    if (r) r.disabled = !TJ.Store.canRedo();
  };

  const Main = {
    async addFiles(files) {
      const added = await TJ.importFiles(files);
      if (!added.length) { TJ.toast("불러올 이미지가 없습니다."); return; }
      // adopt accent from first import if project still default
      const s = TJ.Store.get();
      if (s.accent === "#111111" && added[0]) { TJ.Store.update((st) => { st.accent = added[0].accent; }, "accent-auto"); TJ.applyAccent(); }
      TJ.index.render();
      TJ.toast(`${added.length}장 불러옴 — 인덱스에서 캔버스로 끌어오세요.`);
      TJ.persist.autosave();
    },

    addMetaText(key) {
      const s = TJ.Store.get();
      const val = s.meta[key];
      if (!val) { TJ.toast("먼저 " + ({ title: "제목", place: "장소", date: "날짜", note: "메모" }[key] || key) + "을(를) 입력하세요."); return; }
      const role = ({ title: "title", place: "place", date: "date", note: "note" }[key]) || "custom";
      const it = TJ.typography.create(role, val);
      TJ.Store.commit((st) => TJ.Store.addItem(it), "add-text");
      TJ.editor.select(it.id);
      TJ.rerender();
    },

    addText() {
      const it = TJ.typography.create("custom", "");
      TJ.Store.commit((st) => TJ.Store.addItem(it), "add-text");
      TJ.editor.select(it.id);
      TJ.rerender();
      const node = TJ.$(`#items [data-id="${it.id}"]`);
      if (node) TJ.editor.editText(node);
    },

    reextractAccent() {
      const s = TJ.Store.get();
      const usedPhoto = s.items.find((i) => i.type === "photo");
      const p = usedPhoto ? TJ.photos.get(usedPhoto.photoId) : TJ.photos.all().sort((a, b) => a.order - b.order)[0];
      if (!p) { TJ.toast("사진이 없습니다."); return; }
      TJ.Store.commit((st) => { st.accent = p.accent; }, "accent");
      TJ.applyAccent(); TJ.rerender();
      TJ.toast("강조색을 다시 추출했습니다.");
    },

    syncTopbar() {
      const s = TJ.Store.get();
      TJ.$$("[data-seg='columns'] button").forEach((b) => b.classList.toggle("is-active", +b.dataset.val === s.canvas.columns));
      TJ.$$("[data-seg='ratio'] button").forEach((b) => b.classList.toggle("is-active", b.dataset.val === s.canvas.ratio));
      TJ.$("#toggleGrid").classList.toggle("is-active", s.canvas.showGrid);
    },

    bind() {
      TJ.$("#fileInput").addEventListener("change", (e) => { this.addFiles(e.target.files); e.target.value = ""; });

      // segmented controls
      TJ.$$("[data-seg='columns'] button").forEach((b) => b.addEventListener("click", () => {
        TJ.Store.commit((s) => { s.canvas.columns = +b.dataset.val; }, "columns");
        this.syncTopbar(); TJ.editor.selectedId = null; TJ.rerender();
      }));
      TJ.$$("[data-seg='ratio'] button").forEach((b) => b.addEventListener("click", () => {
        TJ.Store.commit((s) => { s.canvas.ratio = b.dataset.val; }, "ratio");
        this.syncTopbar(); TJ.rerender();
      }));
      TJ.$("#toggleGrid").addEventListener("click", () => {
        TJ.Store.commit((s) => { s.canvas.showGrid = !s.canvas.showGrid; }, "grid");
        this.syncTopbar(); TJ.grid.renderGridLines();
      });

      TJ.$("#btnUndo").addEventListener("click", () => TJ.Store.undo());
      TJ.$("#btnRedo").addEventListener("click", () => TJ.Store.redo());
      TJ.$("#btnMemory").addEventListener("click", () => TJ.memory.build());
      TJ.$("#btnText").addEventListener("click", () => this.addText());

      TJ.$("#btnSave").addEventListener("click", () => TJ.persist.save());
      TJ.$("#btnExportJson").addEventListener("click", () => TJ.json.export());
      TJ.$("#jsonInput").addEventListener("change", (e) => { if (e.target.files[0]) TJ.json.import(e.target.files[0]); e.target.value = ""; });
      TJ.$("#btnExportPng").addEventListener("click", () => TJ.exportPNG(3));
      TJ.$("#btnExportPdf").addEventListener("click", () => TJ.exportPDF(3));

      TJ.$("#btnGesture").addEventListener("click", () => TJ.gesture.toggle());
      TJ.$("#gestureStop").addEventListener("click", () => TJ.gesture.stop());

      // command bar
      const runCmd = () => {
        const input = TJ.$("#cmdInput");
        const text = input.value;
        if (!text.trim()) return;
        const res = TJ.commands.run(text);
        TJ.toast(res.message, res.handled ? 1800 : 3200);
        if (res.handled) input.value = "";
      };
      TJ.$("#cmdRun").addEventListener("click", runCmd);
      TJ.$("#cmdInput").addEventListener("keydown", (e) => { if (e.key === "Enter") runCmd(); });

      // autosave + button state on every change
      TJ.Store.subscribe((s, reason) => {
        const u = TJ.$("#btnUndo"), r = TJ.$("#btnRedo");
        if (u) u.disabled = !TJ.Store.canUndo();
        if (r) r.disabled = !TJ.Store.canRedo();
        if (reason === "undo" || reason === "redo" || reason === "replace") {
          this.syncTopbar(); TJ.applyAccent(); TJ.grid.renderAll(); TJ.inspector.render(); TJ.index.render();
        }
        TJ.persist.autosave();
      });
    },

    async boot() {
      TJ.editor.init();
      this.bind();
      TJ.applyAccent();
      this.syncTopbar();

      let restored = false;
      if (TJ.persist.has()) {
        restored = await TJ.persist.restore();
        if (restored) TJ.toast("이전 작업을 불러왔습니다.");
      }
      this.syncTopbar();
      TJ.rerender();
      if (!restored) TJ.$("#cmdInput").setAttribute("placeholder",
        "명령 입력 —  “촬영 시간순으로 정리”, “밤 사진을 오른쪽에”, “제목을 왼쪽 위에 크게”");
    },
  };

  TJ.main = Main;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => Main.boot());
  else Main.boot();
})(window.TJ);
