/* landing.js — floating photo sphere (main screen) -> arc arrangement.
   Photos come from assets/family/manifest.json when present (kept local by
   default via .gitignore). If the manifest/photos are absent, the landing is
   skipped and the editor loads straight away with the file picker.

   Interaction: drag or open-palm to spin the sphere; click a photo to fan the
   set into an arc and focus it; "그리드 편집 →" hands everything to the editor. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const R = 290;                 // sphere radius (px)
  const MAX = 80;                // cap tiles for smoothness
  const GA = Math.PI * (3 - Math.sqrt(5));

  const Landing = {
    shown: false,
    mode: "sphere",             // 'sphere' | 'arc'
    records: [],
    tiles: [],                  // { node, lon, lat, rec }
    ry: 0, rx: -8, vry: 0.06, vrx: 0,
    dragging: false, moved: false, raf: 0,
    focusIndex: -1,
    palmLastX: null,

    isActive() { return this.shown; },

    async init(restored) {
      if (restored) return false;               // don't hijack a restored project
      const list = await this.loadManifest();
      if (!list || !list.length) return false;  // no bundled photos -> skip landing
      const el = TJ.$("#landing");
      el.hidden = false; this.shown = true;
      this.records = await this.loadPhotos(list.slice(0, MAX));
      if (!this.records.length) { this.hide(); return false; }
      // adopt accent from first photo
      const first = this.records[0];
      TJ.Store.update((s) => { if (s.accent === "#111111") s.accent = first.accent || s.accent; }, "accent");
      TJ.applyAccent();
      this.buildSphere();
      this.bind();
      this.spin();
      return true;
    },

    async loadManifest() {
      // prefer real Unsplash photos, fall back to the bundled SVG signal set
      for (const path of ["assets/unsplash.json", "assets/lights/manifest.json"]) {
        try {
          const res = await fetch(path, { cache: "no-store" });
          if (!res.ok) continue;
          const arr = await res.json();
          if (Array.isArray(arr) && arr.length) return arr;
        } catch (e) { /* try next */ }
      }
      return null;
    },

    loadPhotos(names) {
      return Promise.all(names.map((entry, i) => new Promise((resolve) => {
        const isStr = typeof entry === "string";
        const name = isStr ? entry : (entry.file || entry.url);
        const abs = /^https?:/i.test(name);
        const url = abs ? name : "assets/lights/" + encodeURIComponent(name);
        const img = new Image();
        if (abs) img.crossOrigin = "anonymous";   // Unsplash CDN sends ACAO:* -> canvas-safe
        const rec = {
          id: TJ.uid("ph"), name, url, img, w: 0, h: 0, time: null, gps: null,
          accent: "#111111", order: i,
          city: isStr ? "" : (entry.city || ""),
          country: isStr ? "" : (entry.country || ""),
          code: isStr ? "" : (entry.code || ""),
          lat: isStr ? null : (entry.lat != null ? entry.lat : null),
          lon: isStr ? null : (entry.lon != null ? entry.lon : null),
        };
        img.onload = () => {
          rec.w = img.naturalWidth; rec.h = img.naturalHeight;
          try { rec.accent = TJ.extractAccent(img); } catch (e) {}
          resolve(rec);
        };
        img.onerror = () => resolve(rec);   // keep going even if one fails
        img.src = url;
      }))).then((recs) => {
        const ok = recs.filter((r) => r.w > 0);
        ok.forEach((r) => TJ.photos.map.set(r.id, r));
        TJ.photos.order = ok.length;
        return ok;
      });
    },

    buildSphere() {
      const sphere = TJ.$("#sphere");
      sphere.innerHTML = "";
      this.tiles = [];
      const n = this.records.length;
      this.records.forEach((rec, i) => {
        const y = n > 1 ? 1 - (i / (n - 1)) * 2 : 0;
        const theta = i * GA;
        const lat = Math.asin(Math.max(-1, Math.min(1, y))) * 180 / Math.PI;
        const lon = (theta * 180 / Math.PI) % 360;
        const node = TJ.el("div", { class: "sphere-item", "data-i": i },
          [TJ.el("img", { src: rec.url, alt: rec.name, draggable: "false" })]);
        node.style.transform = `rotateY(${lon}deg) rotateX(${-lat}deg) translateZ(${R}px)`;
        sphere.appendChild(node);
        this.tiles.push({ node, lon, lat, rec });
      });
      TJ.$("#landingHint").textContent =
        `세계의 신호등 ${n}점 · 손바닥으로 굴리거나 드래그해서 밀어보세요 · 클릭하면 배치가 시작됩니다`;
    },

    /* ---- rotation loop ---- */
    spin() {
      const step = () => {
        if (!this.shown) return;
        if (this.mode === "sphere") {
          if (!this.dragging) {
            this.ry += this.vry; this.rx += this.vrx;
            this.vrx *= 0.94; if (Math.abs(this.vrx) < 0.002) this.vrx = 0;
            // ease auto spin back if user flung
            if (Math.abs(this.vry) > 0.06) this.vry *= 0.96; else this.vry = 0.06;
          }
          this.rx = Math.max(-70, Math.min(70, this.rx));
          const s = TJ.$("#sphere");
          s.style.setProperty("--ry", this.ry + "deg");
          s.style.setProperty("--rx", this.rx + "deg");
        }
        this.raf = requestAnimationFrame(step);
      };
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(step);
    },

    bind() {
      const stage = TJ.$("#sphereStage");
      stage.addEventListener("pointerdown", (e) => {
        if (this.mode !== "sphere") return;
        this.dragging = true; this.moved = false;
        this._downTile = e.target.closest(".sphere-item");   // record before capture
        this._sx = e.clientX; this._sy = e.clientY; this._ry0 = this.ry; this._rx0 = this.rx;
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener("pointermove", (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this._sx, dy = e.clientY - this._sy;
        if (Math.abs(dx) + Math.abs(dy) > 6) this.moved = true;
        this.ry = this._ry0 + dx * 0.25;
        this.rx = this._rx0 - dy * 0.25;
        this.vry = dx * 0.01; this.vrx = 0;
      });
      const end = () => {
        this.dragging = false;
        // a tap (no drag) on a tile -> focus it (pointer capture steals `click`)
        if (!this.moved && this._downTile && this.mode === "sphere") {
          this.focus(parseInt(this._downTile.getAttribute("data-i"), 10));
        }
        this._downTile = null;
      };
      stage.addEventListener("pointerup", end);
      stage.addEventListener("pointercancel", () => { this.dragging = false; this._downTile = null; });

      TJ.$("#landingEnter").addEventListener("click", () => this.enterEditor());
      TJ.$("#landingBack").addEventListener("click", () => this.toSphere());
      TJ.$("#landingArcNav").addEventListener("click", () => this.focus(this.focusIndex >= 0 ? this.focusIndex : 0));
      TJ.$("#landingGesture").addEventListener("click", () => TJ.gesture.toggle());
      TJ.$("#landingPico").addEventListener("click", () => { this.hide(); TJ.pico.show("landing"); });

      // click the centred photo -> step into the location (AR + glassmorphism)
      const frame = TJ.$(".gallery__frame");
      if (frame) frame.addEventListener("click", () => this.openAR(this.focusIndex));

      TJ.$("#arClose").addEventListener("click", () => this.closeAR());
      TJ.$("#arPico").addEventListener("click", () => {
        const rec = this.records[this.focusIndex];
        this.closeAR(true); this.hide();
        TJ.pico.show("landing", { country: rec && rec.country });
      });
      TJ.$("#arEnter").addEventListener("click", () => { this.closeAR(true); this.enterEditor(); });
    },

    fmtLat(lat) {
      if (lat == null) return "—";
      return Math.abs(lat).toFixed(2) + "° " + (lat >= 0 ? "N" : "S");
    },
    fmtCoord(lat, lon) {
      if (lat == null || lon == null) return "";
      return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
    },

    openAR(i) {
      const rec = this.records[i];
      if (!rec) return;
      const bg = TJ.$("#arBg");
      bg.style.backgroundImage = `url("${rec.url}")`;
      bg.style.animation = "none"; void bg.offsetWidth; bg.style.animation = "";  // restart zoom
      TJ.$("#arCountry").textContent = rec.country || rec.city || "Unknown";
      TJ.$("#arCity").textContent = rec.city ? rec.city.toUpperCase() : "";
      TJ.$("#arLat").textContent = this.fmtLat(rec.lat);
      TJ.$("#arCoord").textContent = this.fmtCoord(rec.lat, rec.lon);
      TJ.$("#arHint").textContent = rec.city ? `${rec.city} — 이 신호가 있는 곳으로 들어왔습니다` : "사진 속 장소로 들어왔습니다";
      TJ.$("#ar").hidden = false;
      if (rec.accent) { TJ.Store.update((s) => { s.accent = rec.accent; }, "accent"); TJ.applyAccent(); }
    },
    closeAR() { TJ.$("#ar").hidden = true; },

    /* ---- gallery selection (Paprika-style) ---- */
    focus(i) {
      this.focusIndex = i;
      if (this.mode !== "gallery") { this.buildGalleryColumns(); this.mode = "gallery"; }
      TJ.$("#landing").classList.add("is-gallery");
      TJ.$("#gallery").hidden = false;
      TJ.$("#landingBack").hidden = false;
      TJ.$("#landingCaption").hidden = true;
      this.showCenter(i);
    },

    buildGalleryColumns() {
      const L = TJ.$("#galleryL"), Rc = TJ.$("#galleryR");
      L.innerHTML = ""; Rc.innerHTML = "";
      const n = this.records.length;
      const mid = Math.ceil(n / 2);
      this.records.forEach((rec, idx) => {
        const cell = TJ.el("li", { class: "gcell", "data-i": idx }, [
          TJ.el("img", { src: rec.url, alt: rec.city || rec.name, draggable: "false" }),
          TJ.el("span", { class: "gcell__no", text: "(" + (idx + 1) + ")" }),
        ]);
        cell.addEventListener("click", () => this.showCenter(idx));
        (idx < mid ? L : Rc).appendChild(cell);
      });
    },

    showCenter(i) {
      this.focusIndex = i;
      const rec = this.records[i];
      if (!rec) return;
      TJ.$("#galleryImg").src = rec.url;
      TJ.$("#galleryCity").textContent = rec.city || rec.name;
      TJ.$("#galleryCode").textContent = rec.code || "";
      TJ.$$(".gcell").forEach((c) =>
        c.classList.toggle("is-current", +c.getAttribute("data-i") === i));
      // adopt this signal's accent
      TJ.Store.update((s) => { s.accent = rec.accent || s.accent; }, "accent");
      TJ.applyAccent();
    },

    toSphere() {
      this.mode = "sphere";
      TJ.$("#landing").classList.remove("is-gallery");
      TJ.$("#gallery").hidden = true;
      TJ.$("#landingBack").hidden = true;
      TJ.$("#landingCaption").hidden = false;
    },

    /* ---- hand to editor ---- */
    enterEditor() {
      this.hide();
      // if the canvas is empty, offer an instant Memory-Grid arrangement
      const hasItems = TJ.Store.get().items.length > 0;
      TJ.index.render();
      if (!hasItems) { TJ.memory.build(); }
      else { TJ.rerender(); }
      TJ.toast("그리드 편집 모드 — 인덱스에서 사진을 끌어오거나 편집하세요.");
    },

    hide() {
      this.shown = false;
      cancelAnimationFrame(this.raf); this.raf = 0;
      TJ.$("#landing").hidden = true;
    },

    /* ---- palm control (called from gesture.js in landing mode) ---- */
    onHand(hands) {
      if (hands.length >= 2 || this.mode !== "sphere") {
        // pinch on one hand selects focus; two hands ignored here
      }
      const lm = hands[0];
      if (!lm) { this.palmLastX = null; return; }
      // pinch -> focus nearest-to-center tile
      const pinch = Math.hypot(lm[4].x - lm[8].x, lm[4].y - lm[8].y) < 0.06;
      if (pinch && this.mode === "sphere") {
        this.focus(this.frontTileIndex());
        this.palmLastX = null;
        return;
      }
      // open palm push -> spin by horizontal palm movement (mirror)
      const x = 1 - lm[9].x;      // palm center-ish (middle-finger mcp), mirrored
      if (this.palmLastX == null) { this.palmLastX = x; return; }
      const dx = x - this.palmLastX;
      this.palmLastX = x;
      if (this.mode === "sphere") { this.vry = 0.06 + dx * 60; this.ry += dx * 120; }
    },

    // tile currently closest to facing the camera (front), given current ry
    frontTileIndex() {
      let best = 0, bestZ = -Infinity;
      const ryRad = this.ry * Math.PI / 180, rxRad = this.rx * Math.PI / 180;
      this.tiles.forEach((t, i) => {
        const lo = t.lon * Math.PI / 180, la = t.lat * Math.PI / 180;
        // position on unit sphere then apply ry/rx, take resulting z
        let x = Math.cos(la) * Math.sin(lo), y = Math.sin(la), z = Math.cos(la) * Math.cos(lo);
        // rotateY
        let x2 = x * Math.cos(ryRad) + z * Math.sin(ryRad);
        let z2 = -x * Math.sin(ryRad) + z * Math.cos(ryRad);
        // rotateX
        let z3 = y * Math.sin(rxRad) + z2 * Math.cos(rxRad);
        if (z3 > bestZ) { bestZ = z3; best = i; }
      });
      return best;
    },
  };

  TJ.landing = Landing;
})(window.TJ);
