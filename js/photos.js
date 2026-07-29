/* photos.js — in-memory photo store, import, vertical index, accent extraction.
   Binary/image data are kept here (not in undoable state). */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const Photos = {
    map: new Map(),   // photoId -> { id, name, url, img, w, h, time, gps, accent, order }
    order: 0,

    get(id) { return this.map.get(id); },
    all() { return Array.from(this.map.values()); },
    clear() {
      this.map.forEach((p) => p.url && URL.revokeObjectURL(p.url));
      this.map.clear();
    },
  };
  TJ.photos = Photos;

  function loadImage(url) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => res(img);
      img.onerror = rej;
      img.src = url;
    });
  }

  // extract one dominant accent color (skips near-grey/near-white/black; picks colorful)
  function extractAccent(img) {
    try {
      const c = document.createElement("canvas");
      const S = 48;
      c.width = S; c.height = S;
      const ctx = c.getContext("2d");
      ctx.drawImage(img, 0, 0, S, S);
      const data = ctx.getImageData(0, 0, S, S).data;
      const buckets = new Map();
      let best = null, bestScore = -1;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 200) continue;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        const sat = max === 0 ? 0 : (max - min) / max;
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 24 || lum > 236) continue;         // skip near black/white
        const key = (r >> 4) + "," + (g >> 4) + "," + (b >> 4);
        const bkt = buckets.get(key) || { r: 0, g: 0, b: 0, n: 0, sat: 0 };
        bkt.r += r; bkt.g += g; bkt.b += b; bkt.n++; bkt.sat += sat;
        buckets.set(key, bkt);
      }
      buckets.forEach((bkt) => {
        const avgSat = bkt.sat / bkt.n;
        const score = bkt.n * (0.25 + avgSat);       // favor frequent + colorful
        if (score > bestScore) { bestScore = score; best = bkt; }
      });
      if (!best) return "#111111";
      const r = Math.round(best.r / best.n), g = Math.round(best.g / best.n), b = Math.round(best.b / best.n);
      return "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    } catch (e) { return "#111111"; }
  }
  TJ.extractAccent = extractAccent;

  // import a FileList / array of File; returns array of photo records (in file order)
  TJ.importFiles = async function (files) {
    const list = Array.from(files).filter((f) => /^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name));
    const added = [];
    for (const file of list) {
      const url = URL.createObjectURL(file);
      let img;
      try { img = await loadImage(url); }
      catch (e) { URL.revokeObjectURL(url); continue; }
      const exif = await TJ.readExif(file);
      const rec = {
        id: TJ.uid("ph"),
        name: file.name,
        url,
        img,
        w: img.naturalWidth,
        h: img.naturalHeight,
        time: exif.time || null,            // Date | null
        gps: exif.gps || null,              // {lat,lon} | null
        accent: extractAccent(img),
        order: Photos.order++,
      };
      Photos.map.set(rec.id, rec);
      added.push(rec);
    }
    return added;
  };

  /* ---- Vertical image index (left column) ---- */
  const Index = {
    render() {
      const list = TJ.$("#indexList");
      const countEl = TJ.$("#indexCount");
      if (!list) return;
      const photos = Photos.all().sort((a, b) => a.order - b.order);
      countEl.textContent = TJ.pad2(photos.length);
      list.innerHTML = "";
      const usedIds = new Set(TJ.Store.get().items.filter((i) => i.type === "photo").map((i) => i.photoId));
      photos.forEach((p, i) => {
        const metaBits = [];
        if (p.time) metaBits.push(TJ.fmtDate(p.time));
        if (p.gps) metaBits.push("GEO");
        const li = TJ.el("li", {
          class: "idx" + (usedIds.has(p.id) ? " is-used" : ""),
          "data-photo": p.id,
          draggable: "true",
          title: p.name,
        }, [
          TJ.el("img", { src: p.url, alt: p.name }),
          TJ.el("div", { class: "idx__meta" }, [
            TJ.el("span", { class: "idx__no", text: "(" + TJ.pad2(i + 1) + ")" }),
            TJ.el("span", { text: metaBits.join(" · ") }),
          ]),
        ]);
        list.appendChild(li);
      });
    },
  };
  TJ.index = Index;
})(window.TJ);
