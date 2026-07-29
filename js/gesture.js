/* gesture.js — OPTIONAL webcam hand editing, built on @mediapipe/tasks-vision
   (HandLandmarker). Opt-in only: the module and its WASM/model are fetched from
   a CDN the first time the user clicks "손동작". If they can't load (offline /
   blocked) the app says so and every other feature keeps working — the core
   stays 100% dependency-free.

   Loaded via dynamic import() so the rest of the app can remain classic scripts.

   Gestures (each needs a short hold/dwell so stray motion doesn't fire):
   - open palm, move        -> pushes the selected item across the canvas
   - pinch (thumb+index)    -> selects the item under the fingertip
   - two hands, spread/close -> scales the selected item's grid size
   Turn it off any time with the "손동작 끄기" button. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const VISION_VER = "0.10.14";
  const VISION_MJS = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VER}/vision_bundle.mjs`;
  const WASM_ROOT = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VER}/wasm`;
  const MODEL_URL = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
  const DWELL_MS = 450;

  const Gesture = {
    active: false,
    landmarker: null,
    stream: null,
    raf: 0,
    lastVideoTime: -1,
    pinchStable: 0,
    twoHandBase: null,
    hud: null,

    async toggle() {
      if (this.active) { this.stop(); return; }
      await this.start();
    },

    async loadLandmarker() {
      if (this.landmarker) return this.landmarker;
      const vision = await import(/* @vite-ignore */ VISION_MJS);
      const { HandLandmarker, FilesetResolver } = vision;
      const fileset = await FilesetResolver.forVisionTasks(WASM_ROOT);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: "GPU" },
        runningMode: "VIDEO",
        numHands: 2,
        minHandDetectionConfidence: 0.6,
        minHandPresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      return this.landmarker;
    },

    async start() {
      const overlay = TJ.$("#gestureOverlay");
      const video = TJ.$("#gestureVideo");
      this.hud = TJ.$("#gestureHud");
      overlay.hidden = false;
      this.setHud("초기화 중… (최초 1회 모델 로드)");

      // 1) load the tasks-vision HandLandmarker
      try {
        await this.loadLandmarker();
      } catch (e) {
        console.error(e);
        this.setHud("손 추적 모델을 불러오지 못했습니다. 오프라인이거나 차단되었을 수 있습니다.");
        TJ.toast("MediaPipe 로드 실패 — 마우스 편집은 정상 동작합니다.", 3200);
        return;
      }

      // 2) webcam
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false });
        video.srcObject = this.stream;
        await video.play();
      } catch (e) {
        console.error(e);
        this.setHud("웹캠 접근이 거부되었습니다.");
        TJ.toast("웹캠을 사용할 수 없습니다 — 마우스 편집은 정상 동작합니다.", 3200);
        return;
      }

      this.active = true;
      TJ.$("#btnGesture").classList.add("btn--solid");
      this.setHud("손을 화면에 보여주세요.");
      this.loop();
    },

    stop() {
      this.active = false;
      if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; }
      const v = TJ.$("#gestureVideo");
      if (v && v.srcObject) { v.srcObject.getTracks().forEach((t) => t.stop()); v.srcObject = null; }
      this.stream = null;
      TJ.$("#gestureOverlay").hidden = true;
      TJ.$("#btnGesture").classList.remove("btn--solid");
      this.twoHandBase = null; this.pinchStable = 0;
    },

    setHud(t) { if (this.hud) this.hud.textContent = t; },
    dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); },

    loop() {
      if (!this.active) return;
      const video = TJ.$("#gestureVideo");
      if (video.readyState >= 2 && video.currentTime !== this.lastVideoTime) {
        this.lastVideoTime = video.currentTime;
        let res = null;
        try { res = this.landmarker.detectForVideo(video, performance.now()); }
        catch (e) { /* transient */ }
        if (res) this.onResults(res);
      }
      this.raf = requestAnimationFrame(() => this.loop());
    },

    onResults(res) {
      const cv = TJ.$("#gestureCanvas");
      const v = TJ.$("#gestureVideo");
      cv.width = v.videoWidth || 640; cv.height = v.videoHeight || 480;
      const ctx = cv.getContext("2d");
      ctx.clearRect(0, 0, cv.width, cv.height);
      const hands = res.landmarks || [];

      ctx.fillStyle = TJ.Store.get().accent || "#ffffff";
      hands.forEach((lm) => lm.forEach((p) => { ctx.beginPath(); ctx.arc(p.x * cv.width, p.y * cv.height, 4, 0, 7); ctx.fill(); }));

      if (!hands.length) { this.setHud("손 없음"); this.twoHandBase = null; this.pinchStable = 0; return; }
      if (hands.length >= 2) { this.handleTwoHands(hands); return; }
      this.twoHandBase = null;
      this.handleOneHand(hands[0]);
    },

    fingersUp(lm) {
      const up = (tip, pip) => lm[tip].y < lm[pip].y;
      return { index: up(8, 6), middle: up(12, 10), ring: up(16, 14), pinky: up(20, 18) };
    },

    handleOneHand(lm) {
      const pinch = this.dist(lm[4], lm[8]) < 0.06;
      const f = this.fingersUp(lm);
      const openPalm = f.index && f.middle && f.ring && f.pinky;

      const canvas = TJ.$("#canvas");
      const rect = canvas.getBoundingClientRect();
      const cx = (1 - lm[8].x) * rect.width;   // mirror x (video is mirrored)
      const cy = lm[8].y * rect.height;

      if (pinch) {
        const now = performance.now();
        if (!this.pinchStable) this.pinchStable = now;
        this.setHud("선택 중… 오므린 손 유지");
        if (now - this.pinchStable > DWELL_MS) {
          this.selectAt(cx, cy);
          this.pinchStable = now + 1e6;   // debounce until released
        }
      } else {
        this.pinchStable = 0;
        if (openPalm && TJ.editor.selectedId) { this.moveSelectedTo(cx, cy); this.setHud("이동 — 손바닥을 움직이세요"); }
        else this.setHud(openPalm ? "손바닥 — 먼저 대상을 선택하세요" : "손 인식됨");
      }
    },

    handleTwoHands(hands) {
      const d = this.dist(hands[0][0], hands[1][0]);
      if (this.twoHandBase == null) { this.twoHandBase = d; this.setHud("양손 — 벌리거나 좁혀 크기 조절"); return; }
      if (!TJ.editor.selectedId) { this.setHud("양손 — 먼저 대상을 선택하세요"); return; }
      const ratio = d / this.twoHandBase;
      const m = TJ.grid.metrics();
      const it = TJ.Store.itemById(TJ.editor.selectedId);
      if (!it) return;
      if (ratio > 1.25) {
        this.twoHandBase = d;
        TJ.Store.commit(() => { const t = TJ.Store.itemById(it.id); t.gw = TJ.clamp(t.gw + 1, 1, m.cols - t.gx); t.gh = TJ.clamp(t.gh + 1, 1, m.rows - t.gy); }, "gesture-grow");
        TJ.rerender(); this.setHud("양손 크기 조절 · 확대");
      } else if (ratio < 0.8) {
        this.twoHandBase = d;
        TJ.Store.commit(() => { const t = TJ.Store.itemById(it.id); t.gw = Math.max(1, t.gw - 1); t.gh = Math.max(1, t.gh - 1); }, "gesture-shrink");
        TJ.rerender(); this.setHud("양손 크기 조절 · 축소");
      }
    },

    selectAt(cx, cy) {
      const m = TJ.grid.metrics();
      const s = TJ.Store.get();
      for (let i = s.items.length - 1; i >= 0; i--) {
        const r = TJ.grid.pxRect(s.items[i], m);
        if (cx >= r.left && cx <= r.left + r.width && cy >= r.top && cy <= r.top + r.height) {
          TJ.editor.select(s.items[i].id); TJ.toast("제스처 선택"); return;
        }
      }
    },

    _moveRAF: 0,
    moveSelectedTo(cx, cy) {
      const it = TJ.Store.itemById(TJ.editor.selectedId);
      if (!it) return;
      const m = TJ.grid.metrics();
      const gx = TJ.clamp(Math.round(cx / m.cellW - it.gw / 2), 0, m.cols - it.gw);
      const gy = TJ.clamp(Math.round(cy / m.cellH - it.gh / 2), 0, m.rows - it.gh);
      if (gx === it.gx && gy === it.gy) return;
      TJ.Store.update(() => { const t = TJ.Store.itemById(it.id); t.gx = gx; t.gy = gy; }, "gesture-move");
      if (!this._moveRAF) this._moveRAF = requestAnimationFrame(() => { this._moveRAF = 0; TJ.grid.renderItems(); });
    },
  };

  TJ.gesture = Gesture;
})(window.TJ);
