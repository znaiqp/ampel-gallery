/* typography.js — text item rendering + defaults.
   Large typography → display (Apple Garamond) face; secondary → Helvetica sans.
   Only two families across the whole project, per brief. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  // which face a text item uses: explicit item.font wins, else by role
  function faceOf(item) {
    if (item.font === "display" || item.font === "sans") return item.font;
    return item.role === "title" ? "display" : "sans";
  }

  const Typo = {
    faceOf,

    renderText(item, m) {
      const node = TJ.el("div", {
        class: "item item--text font-" + faceOf(item) +
          (item.marker ? " is-marker" : "") + (item.accentMarker ? " accent-marker" : ""),
        "data-id": item.id,
      });
      const txt = TJ.el("div", {
        class: "txt",
        contenteditable: "false",
        spellcheck: "false",
        text: item.text || "",
      });
      txt.style.fontSize = (item.size || 28) + "px";
      txt.style.fontWeight = item.weight || 700;
      txt.style.textAlign = item.align || "left";
      txt.style.lineHeight = item.leading || 1.15;
      txt.style.letterSpacing = (item.tracking || 0) + "em";
      if (item.accentColor) txt.style.color = "var(--accent)";
      node.appendChild(txt);
      node.appendChild(TJ.el("div", { class: "handle handle--br", "data-handle": "br" }));
      return node;
    },

    // create a text item snapped near top-left with sensible defaults per role
    create(role, text) {
      const presets = {
        title: { size: 64, weight: 700, gw: 6, gh: 2, font: "display" },
        place: { size: 22, weight: 700, gw: 4, gh: 1, font: "sans" },
        date:  { size: 15, weight: 500, gw: 4, gh: 1, font: "sans", tracking: 0.04 },
        note:  { size: 13, weight: 400, gw: 4, gh: 2, font: "sans", leading: 1.5 },
        caption:{ size: 11, weight: 400, gw: 3, gh: 1, font: "sans", tracking: 0.04 },
        custom:{ size: 28, weight: 700, gw: 4, gh: 1, font: "sans" },
      };
      const p = presets[role] || presets.custom;
      const it = TJ.makeTextItem(text || "", 1, 1, p.gw, p.gh, {
        size: p.size, weight: p.weight, role, font: p.font,
        tracking: p.tracking || 0, leading: p.leading || 1.15,
      });
      return it;
    },
  };

  TJ.typography = Typo;
})(window.TJ);
