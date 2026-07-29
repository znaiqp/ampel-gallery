/* inspector.js — contextual controls for the selected item + project meta. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const el = TJ.el;

  function section(title, rows) {
    return el("div", { class: "insp-sec" },
      [el("div", { class: "insp-sec__title", text: title })].concat(rows));
  }
  function field(label, control) {
    return el("div", { class: "field" }, [label ? el("label", { text: label }) : null, control].filter(Boolean));
  }
  // range with one undo entry per drag
  function range(min, max, step, value, oninput) {
    let started = false;
    const r = el("input", { type: "range", min, max, step, value });
    r.addEventListener("pointerdown", () => { if (!started) { TJ.Store.markpoint(); started = true; } });
    r.addEventListener("input", () => oninput(parseFloat(r.value)));
    r.addEventListener("change", () => { started = false; });
    return r;
  }
  function stepper(value, min, max, onset) {
    const wrap = el("div", { class: "btn-row" });
    const minus = el("button", { class: "btn", text: "−", onclick: () => onset(TJ.clamp(value - 1, min, max)) });
    const val = el("span", { class: "val", text: String(value), style: "flex:0 0 auto" });
    const plus = el("button", { class: "btn", text: "＋", onclick: () => onset(TJ.clamp(value + 1, min, max)) });
    wrap.append(minus, val, plus);
    return wrap;
  }

  const Inspector = {
    render() {
      const body = TJ.$("#inspectorBody");
      const empty = TJ.$("#inspectorEmpty");
      const it = TJ.editor.selectedId ? TJ.Store.itemById(TJ.editor.selectedId) : null;
      body.innerHTML = "";
      body.hidden = false; empty.hidden = true;

      body.appendChild(this.projectSection());
      if (!it) {
        // no selection: show only project + accent
        body.appendChild(this.accentSection());
        return;
      }
      if (it.type === "photo") body.appendChild(this.photoSection(it));
      else body.appendChild(this.textSection(it));
      body.appendChild(this.layerSection(it));
      body.appendChild(this.accentSection());
    },

    projectSection() {
      const s = TJ.Store.get();
      const mk = (key, label, ph, ta) => {
        const c = ta
          ? el("textarea", { placeholder: ph })
          : el("input", { type: "text", placeholder: ph });
        c.value = s.meta[key] || "";
        c.addEventListener("change", () => TJ.Store.commit((st) => { st.meta[key] = c.value; }, "meta"));
        const add = el("button", { class: "btn", text: "Add to grid", style: "margin-top:6px;width:100%",
          onclick: () => TJ.main.addMetaText(key) });
        return el("div", {}, [field(label, c), add]);
      };
      return section("PROJECT", [
        mk("title", "Title", "Trip title"),
        mk("place", "Place", "City · Country"),
        mk("date", "Date", "2024.05 — 05"),
        mk("note", "Note", "Short note", true),
      ]);
    },

    photoSection(it) {
      const m = TJ.grid.metrics();
      const p = TJ.photos.get(it.photoId);
      const rows = [];
      rows.push(field("Cols (w)", stepper(it.gw, 1, m.cols, (v) =>
        TJ.Store.commit((s) => { const t = TJ.Store.itemById(it.id); t.gw = v; if (t.gx + v > m.cols) t.gx = m.cols - v; }, "size") || TJ.rerender())));
      rows.push(field("Rows (h)", stepper(it.gh, 1, m.rows, (v) =>
        TJ.Store.commit((s) => { const t = TJ.Store.itemById(it.id); t.gh = v; if (t.gy + v > m.rows) t.gy = m.rows - v; }, "size") || TJ.rerender())));

      const zVal = el("span", { class: "val", text: (it.zoom || 1).toFixed(2) + "×" });
      rows.push(field("Zoom", el("div", { style: "display:flex;gap:8px;align-items:center;flex:1" }, [
        range(1, 6, 0.01, it.zoom || 1, (v) => { TJ.Store.update((s) => { TJ.Store.itemById(it.id).zoom = v; }, "zoom"); zVal.textContent = v.toFixed(2) + "×"; TJ.grid.renderItems(); }),
        zVal,
      ])));

      const cropBtn = el("button", { class: "btn" + (TJ.editor.cropId === it.id ? " btn--solid" : ""),
        text: TJ.editor.cropId === it.id ? "Exit crop" : "Crop / reposition", onclick: () => TJ.editor.toggleCrop(it.id) });
      const resetBtn = el("button", { class: "btn", text: "Reset position",
        onclick: () => { TJ.Store.commit((s) => { const t = TJ.Store.itemById(it.id); t.offx = 0; t.offy = 0; t.zoom = 1; }, "reset-img"); TJ.rerender(); } });
      rows.push(field(null, el("div", { class: "btn-row" }, [cropBtn, resetBtn])));

      const cap = el("button", { class: "btn" + (it.showCaption ? " btn--solid" : ""),
        text: "캡션 " + (it.showCaption ? "켜짐" : "꺼짐"),
        onclick: () => { TJ.Store.commit((s) => { const t = TJ.Store.itemById(it.id); t.showCaption = !t.showCaption; }, "caption"); TJ.rerender(); } });
      rows.push(field(null, cap));

      // replace with another photo
      const sel = el("select", {});
      sel.appendChild(el("option", { value: "", text: "다른 사진으로 교체…" }));
      TJ.photos.all().sort((a, b) => a.order - b.order).forEach((ph, i) => {
        if (ph.id === it.photoId) return;
        sel.appendChild(el("option", { value: ph.id, text: "(" + TJ.pad2(i + 1) + ") " + ph.name }));
      });
      sel.addEventListener("change", () => { if (sel.value) TJ.editor.replaceSelectedWith(sel.value); });
      rows.push(field(null, sel));

      if (p && p.time) rows.push(field(null, el("div", { class: "muted", style: "font-size:11px", text: "촬영 " + TJ.fmtDateTime(p.time) })));
      return section("PHOTO", rows);
    },

    textSection(it) {
      const rows = [];
      const ta = el("textarea", { placeholder: "텍스트" });
      ta.value = it.text || "";
      ta.addEventListener("input", () => { TJ.Store.update((s) => { TJ.Store.itemById(it.id).text = ta.value; }, "text"); TJ.grid.renderItems(); });
      ta.addEventListener("focus", () => TJ.Store.markpoint());
      rows.push(field(null, ta));

      const fontSel = el("select", {});
      [["display", "Apple Garamond (대형)"], ["sans", "Helvetica (본문)"]].forEach(([v, t]) =>
        fontSel.appendChild(el("option", { value: v, text: t, selected: TJ.typography.faceOf(it) === v ? "" : null })));
      fontSel.value = TJ.typography.faceOf(it);
      fontSel.addEventListener("change", () => { TJ.Store.commit((s) => { TJ.Store.itemById(it.id).font = fontSel.value; }, "font"); TJ.rerender(); });
      rows.push(field("글꼴", fontSel));

      const sVal = el("span", { class: "val", text: (it.size || 28) + "px" });
      rows.push(field("크기", el("div", { style: "display:flex;gap:8px;align-items:center;flex:1" }, [
        range(8, 160, 1, it.size || 28, (v) => { TJ.Store.update((s) => { TJ.Store.itemById(it.id).size = v; }, "size"); sVal.textContent = v + "px"; TJ.grid.renderItems(); }),
        sVal,
      ])));

      const wSel = el("select", {});
      [["300", "Light"], ["400", "Regular"], ["500", "Medium"], ["700", "Bold"], ["800", "Black"]].forEach(([v, t]) =>
        wSel.appendChild(el("option", { value: v, text: t })));
      wSel.value = String(it.weight || 700);
      wSel.addEventListener("change", () => { TJ.Store.commit((s) => { TJ.Store.itemById(it.id).weight = parseInt(wSel.value); }, "weight"); TJ.rerender(); });
      rows.push(field("굵기", wSel));

      const alignWrap = el("div", { class: "btn-row" });
      [["left", "좌"], ["center", "중"], ["right", "우"]].forEach(([v, t]) => {
        alignWrap.appendChild(el("button", { class: "btn" + (it.align === v ? " btn--solid" : ""), text: t,
          onclick: () => { TJ.Store.commit((s) => { TJ.Store.itemById(it.id).align = v; }, "align"); TJ.rerender(); } }));
      });
      rows.push(field("정렬", alignWrap));

      const lVal = el("span", { class: "val", text: (it.leading || 1.15).toFixed(2) });
      rows.push(field("행간", el("div", { style: "display:flex;gap:8px;align-items:center;flex:1" }, [
        range(0.9, 2, 0.01, it.leading || 1.15, (v) => { TJ.Store.update((s) => { TJ.Store.itemById(it.id).leading = v; }, "leading"); lVal.textContent = v.toFixed(2); TJ.grid.renderItems(); }),
        lVal,
      ])));
      const tVal = el("span", { class: "val", text: (it.tracking || 0).toFixed(2) });
      rows.push(field("자간", el("div", { style: "display:flex;gap:8px;align-items:center;flex:1" }, [
        range(-0.1, 0.5, 0.01, it.tracking || 0, (v) => { TJ.Store.update((s) => { TJ.Store.itemById(it.id).tracking = v; }, "tracking"); tVal.textContent = v.toFixed(2); TJ.grid.renderItems(); }),
        tVal,
      ])));

      const marker = el("button", { class: "btn" + (it.marker ? " btn--solid" : ""), text: "마커 하이라이트",
        onclick: () => { TJ.Store.commit((s) => { TJ.Store.itemById(it.id).marker = !TJ.Store.itemById(it.id).marker; }, "marker"); TJ.rerender(); } });
      const accentTxt = el("button", { class: "btn" + (it.accentColor ? " btn--solid" : ""), text: "강조색 글자",
        onclick: () => { TJ.Store.commit((s) => { TJ.Store.itemById(it.id).accentColor = !TJ.Store.itemById(it.id).accentColor; }, "accent-text"); TJ.rerender(); } });
      rows.push(field(null, el("div", { class: "btn-row" }, [marker, accentTxt])));
      return section("TEXT", rows);
    },

    layerSection(it) {
      const mk = (t, fn) => el("button", { class: "btn", text: t, onclick: () => { TJ.Store.commit(fn, "layer"); TJ.grid.renderItems(); } });
      return section("LAYER", [
        field(null, el("div", { class: "btn-row" }, [
          mk("맨 앞", (s) => TJ.Store.toFront(it.id)),
          mk("앞으로", (s) => TJ.Store.raise(it.id)),
          mk("뒤로", (s) => TJ.Store.lower(it.id)),
          mk("맨 뒤", (s) => TJ.Store.toBack(it.id)),
        ])),
        field(null, el("button", { class: "btn", style: "width:100%", text: "삭제", onclick: () => TJ.editor.deleteSelected() })),
      ]);
    },

    accentSection() {
      const s = TJ.Store.get();
      const sw = el("span", { class: "swatch", style: "background:" + s.accent });
      const picker = el("input", { type: "color", value: s.accent, style: "width:100%;height:30px;border:1px solid var(--line);background:var(--paper)" });
      picker.addEventListener("change", () => { TJ.Store.commit((st) => { st.accent = picker.value; }, "accent"); TJ.applyAccent(); TJ.rerender(); });
      const auto = el("button", { class: "btn", style: "width:100%;margin-top:6px", text: "사진에서 강조색 다시 추출",
        onclick: () => TJ.main.reextractAccent() });
      return section("ACCENT", [field("강조색", el("div", { style: "flex:1;display:flex;gap:8px;align-items:center" }, [sw, picker])), auto]);
    },
  };

  TJ.inspector = Inspector;
})(window.TJ);
