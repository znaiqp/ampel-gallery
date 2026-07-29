/* state.js — single source of truth + undo/redo + change events.
   Photos' binary data live outside state (TJ.photos store); state holds ids only. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const RATIOS = {
    portrait:  { w: 3, h: 4 },
    square:    { w: 1, h: 1 },
    landscape: { w: 4, h: 3 },
  };
  TJ.RATIOS = RATIOS;

  function freshState() {
    return {
      version: 1,
      meta: { title: "", place: "", date: "", note: "" },
      canvas: { columns: 8, ratio: "portrait", showGrid: true },
      accent: "#111111",
      items: [],          // ordered back->front (array order == z-order)
    };
  }

  const Store = {
    state: freshState(),
    _undo: [],
    _redo: [],
    _limit: 60,
    _listeners: new Set(),

    get() { return this.state; },

    subscribe(fn) { this._listeners.add(fn); return () => this._listeners.delete(fn); },
    emit(reason) { this._listeners.forEach((fn) => fn(this.state, reason)); },

    snapshot() { return JSON.parse(JSON.stringify(this.state)); },

    /* commit(): push current state to undo stack BEFORE a discrete change,
       then run the mutator, then emit. Use for undoable operations. */
    commit(mutator, reason) {
      this._undo.push(this.snapshot());
      if (this._undo.length > this._limit) this._undo.shift();
      this._redo.length = 0;
      mutator(this.state);
      this.emit(reason || "commit");
    },

    /* update(): mutate + emit WITHOUT touching undo stack (live drag frames). */
    update(mutator, reason) {
      mutator(this.state);
      this.emit(reason || "update");
    },

    /* markpoint(): capture an undo checkpoint without mutating (call at gesture start). */
    markpoint() {
      this._undo.push(this.snapshot());
      if (this._undo.length > this._limit) this._undo.shift();
      this._redo.length = 0;
    },
    /* drop the last markpoint if a gesture produced no change */
    dropMarkpoint() { this._undo.pop(); },

    undo() {
      if (!this._undo.length) return false;
      this._redo.push(this.snapshot());
      this.state = this._undo.pop();
      this.emit("undo");
      return true;
    },
    redo() {
      if (!this._redo.length) return false;
      this._undo.push(this.snapshot());
      this.state = this._redo.pop();
      this.emit("redo");
      return true;
    },
    canUndo() { return this._undo.length > 0; },
    canRedo() { return this._redo.length > 0; },

    replaceState(next, { keepHistory = false } = {}) {
      if (!keepHistory) { this._undo.length = 0; this._redo.length = 0; }
      this.state = next;
      this.emit("replace");
    },
    reset() { this.replaceState(freshState()); },

    // ---- item helpers ----
    itemById(id) { return this.state.items.find((it) => it.id === id); },
    indexOf(id) { return this.state.items.findIndex((it) => it.id === id); },

    addItem(item) { this.state.items.push(item); },
    removeItem(id) {
      const i = this.indexOf(id);
      if (i >= 0) this.state.items.splice(i, 1);
    },
    raise(id) {
      const i = this.indexOf(id);
      if (i >= 0 && i < this.state.items.length - 1) {
        const [it] = this.state.items.splice(i, 1);
        this.state.items.splice(i + 1, 0, it);
      }
    },
    lower(id) {
      const i = this.indexOf(id);
      if (i > 0) {
        const [it] = this.state.items.splice(i, 1);
        this.state.items.splice(i - 1, 0, it);
      }
    },
    toFront(id) { const i = this.indexOf(id); if (i >= 0) this.state.items.push(this.state.items.splice(i, 1)[0]); },
    toBack(id) { const i = this.indexOf(id); if (i >= 0) this.state.items.unshift(this.state.items.splice(i, 1)[0]); },
  };

  TJ.freshState = freshState;
  TJ.Store = Store;

  // ---- item factories ----
  TJ.makePhotoItem = function (photoId, gx, gy, gw, gh) {
    return {
      id: TJ.uid("it"),
      type: "photo",
      photoId,
      gx, gy, gw, gh,           // grid cell units
      zoom: 1,                  // image scale inside frame (>=1 covers)
      offx: 0, offy: 0,         // image pan inside frame, fraction of frame [-0.5..0.5]
      showCaption: false,
    };
  };

  TJ.makeTextItem = function (text, gx, gy, gw, gh, opts) {
    return Object.assign({
      id: TJ.uid("tx"),
      type: "text",
      text: text || "",
      gx, gy, gw, gh,
      size: 28,                 // px at 1x canvas scale reference (see grid.js)
      weight: 700,
      align: "left",
      leading: 1.15,
      tracking: 0,              // letter-spacing em
      role: "custom",           // title|place|date|note|caption|custom
    }, opts || {});
  };
})(window.TJ);
