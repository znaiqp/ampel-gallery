/* export.js — persistence + rendering outputs, all dependency-free.
   - localStorage autosave/restore of the project (photos stored as dataURLs)
   - JSON export / import (portable project file, photos embedded)
   - high-resolution PNG rendered directly to a canvas (no UI, no grid guides)
   - minimal single-image PDF built by hand (JPEG/DCTDecode)  */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const LS_KEY = "tj.project.v1";
  const FONT_SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
  const FONT_DISP = '"AppleGaramondLocal","Apple Garamond","Garamond","EB Garamond",Georgia,serif';

  /* ---------- serialize: state + referenced photos as dataURLs ---------- */
  function imgToDataURL(img, type, quality) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    return c.toDataURL(type || "image/jpeg", quality || 0.9);
  }

  function serialize() {
    const s = TJ.Store.get();
    const usedIds = new Set(s.items.filter((i) => i.type === "photo").map((i) => i.photoId));
    const photos = {};
    TJ.photos.all().forEach((p) => {
      if (!usedIds.has(p.id)) return;
      photos[p.id] = {
        id: p.id, name: p.name, w: p.w, h: p.h,
        time: p.time ? p.time.toISOString() : null,
        gps: p.gps || null, accent: p.accent, order: p.order,
        data: imgToDataURL(p.img),
      };
    });
    return { app: "travel-journal", version: 1, state: s, photos };
  }

  function loadImageFromURL(url) {
    return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
  }

  async function deserialize(pkg) {
    if (!pkg || pkg.app !== "travel-journal") throw new Error("Invalid file format.");
    TJ.photos.clear();
    const entries = Object.values(pkg.photos || {});
    let maxOrder = 0;
    for (const p of entries) {
      const img = await loadImageFromURL(p.data);
      TJ.photos.map.set(p.id, {
        id: p.id, name: p.name, url: p.data, img, w: p.w, h: p.h,
        time: p.time ? new Date(p.time) : null, gps: p.gps || null,
        accent: p.accent || "#111111", order: p.order || 0,
      });
      maxOrder = Math.max(maxOrder, p.order || 0);
    }
    TJ.photos.order = maxOrder + 1;
    TJ.Store.replaceState(pkg.state);
    TJ.applyAccent();
    TJ.editor.selectedId = null;
    TJ.rerender(); TJ.index.render();
  }

  /* ---------- localStorage ---------- */
  const Persist = {
    save() {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(serialize()));
        TJ.toast("Saved to your browser.");
      } catch (e) {
        TJ.toast("Save failed — too many photos, perhaps.");
        console.error(e);
      }
    },
    autosave: TJ.debounce(function () {
      try { localStorage.setItem(LS_KEY, JSON.stringify(serialize())); } catch (e) {}
    }, 1500),
    async restore() {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      try { await deserialize(JSON.parse(raw)); return true; }
      catch (e) { console.error(e); return false; }
    },
    has() { return !!localStorage.getItem(LS_KEY); },
  };

  /* ---------- JSON file ---------- */
  const Json = {
    export() {
      const blob = new Blob([JSON.stringify(serialize())], { type: "application/json" });
      TJ.download(blob, "travel-journal-" + Date.now() + ".json");
    },
    async import(file) {
      const text = await file.text();
      try { await deserialize(JSON.parse(text)); TJ.toast("Project loaded."); }
      catch (e) { TJ.toast("Import failed — check the file."); console.error(e); }
    },
  };

  /* ---------- high-res render (shared by PNG + PDF) ---------- */
  function drawImageCover(ctx, img, x, y, w, h, zoom, offx, offy) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    const base = Math.max(w / img.naturalWidth, h / img.naturalHeight);
    const sc = base * (zoom || 1);
    const dw = img.naturalWidth * sc, dh = img.naturalHeight * sc;
    const dx = x + (w - dw) / 2 + (offx || 0) * w;
    const dy = y + (h - dh) / 2 + (offy || 0) * h;
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  }

  function wrapLines(ctx, text, maxW) {
    const out = [];
    (text || "").split("\n").forEach((para) => {
      if (para === "") { out.push(""); return; }
      const words = para.split(/(\s+)/);
      let line = "";
      words.forEach((w) => {
        const test = line + w;
        if (ctx.measureText(test).width > maxW && line.trim() !== "") { out.push(line.replace(/\s+$/, "")); line = w.replace(/^\s+/, ""); }
        else line = test;
      });
      if (line.trim() !== "" || para.trim() === "") out.push(line);
    });
    return out;
  }

  function renderToCanvas(scale) {
    const s = TJ.Store.get();
    const m = TJ.grid.metrics();
    const cv = TJ.$("#exportCanvas");
    cv.width = Math.round(m.w * scale);
    cv.height = Math.round(m.h * scale);
    const ctx = cv.getContext("2d");
    ctx.scale(scale, scale);
    // paper
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, m.w, m.h);

    s.items.forEach((item) => {
      const r = TJ.grid.pxRect(item, m);
      if (item.type === "photo") {
        const p = TJ.photos.get(item.photoId);
        if (item.night) { ctx.fillStyle = "#0c0c0c"; ctx.fillRect(r.left, r.top, r.width, r.height); }
        if (p && p.img) drawImageCover(ctx, p.img, r.left, r.top, r.width, r.height, item.zoom, item.offx, item.offy);
      } else {
        drawText(ctx, item, r, s.accent);
      }
    });
    return cv;
  }

  function drawText(ctx, item, r, accent) {
    const face = TJ.typography.faceOf(item) === "display" ? FONT_DISP : FONT_SANS;
    const size = item.size || 28;
    ctx.font = `${item.weight || 700} ${size}px ${face}`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = item.align || "left";
    if ("letterSpacing" in ctx) ctx.letterSpacing = ((item.tracking || 0) * size) + "px";
    const lineH = size * (item.leading || 1.15);
    const lines = wrapLines(ctx, item.text, r.width);
    const anchorX = item.align === "center" ? r.left + r.width / 2 : item.align === "right" ? r.left + r.width : r.left;
    let y = r.top + size; // first baseline
    lines.forEach((ln) => {
      if (item.marker && ln.trim() !== "") {
        const w = ctx.measureText(ln).width;
        const bx = item.align === "center" ? anchorX - w / 2 : item.align === "right" ? anchorX - w : anchorX;
        ctx.fillStyle = item.accentMarker ? accent : "#111111";
        ctx.fillRect(bx - size * 0.04, y - size * 0.86, w + size * 0.36, size * 1.02);
      }
      ctx.fillStyle = item.marker ? "#ffffff" : (item.accentColor ? accent : "#111111");
      ctx.fillText(ln, anchorX, y);
      y += lineH;
    });
    if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  }

  /* ---------- PNG ---------- */
  function exportPNG(scale) {
    const cv = renderToCanvas(scale || 3);
    cv.toBlob((blob) => TJ.download(blob, "journal-" + Date.now() + ".png"), "image/png");
    TJ.toast(`PNG exported — ${cv.width}×${cv.height}px`);
  }

  /* ---------- minimal PDF (single JPEG image, DCTDecode) ---------- */
  function dataURLToBytes(dataURL) {
    const b64 = dataURL.split(",")[1];
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function buildPDF(jpegBytes, w, h) {
    const enc = (str) => new TextEncoder().encode(str);
    const chunks = [];
    let len = 0;
    const offsets = [];
    const push = (u8) => { chunks.push(u8); len += u8.length; };
    const obj = (n, body) => { offsets[n] = len; push(enc(`${n} 0 obj\n`)); if (typeof body === "string") push(enc(body)); else body(); push(enc("\nendobj\n")); };

    push(enc("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n"));
    obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
    obj(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 4 0 R >>`);
    const stream = `q\n${w} 0 0 ${h} 0 0 cm\n/Im0 Do\nQ\n`;
    obj(4, () => { push(enc(`<< /Length ${stream.length} >>\nstream\n`)); push(enc(stream)); push(enc("endstream")); });
    obj(5, () => {
      push(enc(`<< /Type /XObject /Subtype /Image /Width ${w} /Height ${h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`));
      push(jpegBytes); push(enc("\nendstream"));
    });
    const xrefStart = len;
    let xref = `xref\n0 6\n0000000000 65535 f \n`;
    for (let i = 1; i <= 5; i++) xref += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    push(enc(xref));
    push(enc(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`));

    const out = new Uint8Array(len);
    let o = 0; chunks.forEach((c) => { out.set(c, o); o += c.length; });
    return out;
  }

  function exportPDF(scale) {
    try {
      const cv = renderToCanvas(scale || 3);
      const jpeg = dataURLToBytes(cv.toDataURL("image/jpeg", 0.92));
      const pdf = buildPDF(jpeg, cv.width, cv.height);
      TJ.download(new Blob([pdf], { type: "application/pdf" }), "journal-" + Date.now() + ".pdf");
      TJ.toast("PDF exported");
    } catch (e) { console.error(e); TJ.toast("PDF export failed"); }
  }

  TJ.persist = Persist;
  TJ.json = Json;
  TJ.exportPNG = exportPNG;
  TJ.exportPDF = exportPDF;
})(window.TJ);
