/* youtube.js — plays each country's real pedestrian-signal sound from YouTube
   via the official IFrame Player API (loaded lazily on first use). If the API
   is blocked / offline / the video can't embed, we fall back to the synthesized
   signal in picogram.js. Nothing is downloaded or re-hosted — YouTube stays the
   source, which is the ToS-compliant way to use it.

   Sources (real crossing-signal recordings):
   - Japan        https://www.youtube.com/watch?v=F-7k2y-mXAw
   - Germany      https://www.youtube.com/watch?v=NU-01L-4VYw
   - South Korea  https://www.youtube.com/watch?v=pJ6bO2J50Wg
   - Australia    https://www.youtube.com/watch?v=B0cz1XW9QvE
   - Worldwide    https://www.youtube.com/watch?v=ORPGr4m2-Sw  (default) */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const VIDS = {
    "Japan": "F-7k2y-mXAw",
    "Germany": "NU-01L-4VYw",
    "Austria": "NU-01L-4VYw",
    "South Korea": "pJ6bO2J50Wg",
    "Australia": "B0cz1XW9QvE",
  };
  const DEFAULT = "ORPGr4m2-Sw";   // "Pedestrian traffic light sounds around the world"

  const Yt = {
    player: null, ready: false, apiRequested: false, failed: false,
    _want: null, _playing: false, _fallbackTimer: 0, _fellBack: false,

    videoFor(country) { return VIDS[country] || DEFAULT; },
    watchUrl(country) { return "https://www.youtube.com/watch?v=" + this.videoFor(country); },

    // play the synth once if YouTube can't deliver
    _fallback() {
      clearTimeout(this._fallbackTimer);
      if (this._fellBack || this._playing) return;
      this._fellBack = true;
      if (TJ.pico) TJ.pico.playSignal();
    },

    // returns true if it will attempt YouTube (so caller can skip the synth)
    play(country) {
      if (this.failed) return false;
      this._want = this.videoFor(country);
      this._playing = false; this._fellBack = false;
      clearTimeout(this._fallbackTimer);
      this._fallbackTimer = setTimeout(() => this._fallback(), 2800);
      if (this.player && this.ready) { this._start(); }
      else { this.loadApi(); }
      return true;
    },

    _start() {
      try { if (this.player && this._want) this.player.loadVideoById(this._want); }
      catch (e) { this.failed = true; this._fallback(); }
    },

    stop() {
      clearTimeout(this._fallbackTimer);
      this._playing = false; this._want = null;
      try { if (this.player) this.player.stopVideo(); } catch (e) {}
    },

    loadApi() {
      if (this.apiRequested) return;
      this.apiRequested = true;
      window.onYouTubeIframeAPIReady = () => this._createPlayer();
      const s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      s.onerror = () => { this.failed = true; this._fallback(); };
      document.head.appendChild(s);
    },

    _createPlayer() {
      try {
        this.player = new YT.Player("picoYt", {
          height: "180", width: "320",
          videoId: this._want || DEFAULT,
          playerVars: { autoplay: 0, controls: 0, playsinline: 1, rel: 0 },
          events: {
            onReady: () => { this.ready = true; this._start(); },
            onStateChange: (e) => { if (e.data === 1) { this._playing = true; clearTimeout(this._fallbackTimer); } },
            onError: () => { this.failed = true; this._fallback(); },
          },
        });
      } catch (e) { this.failed = true; this._fallback(); }
    },
  };

  TJ.ytSound = Yt;
})(window.TJ);
