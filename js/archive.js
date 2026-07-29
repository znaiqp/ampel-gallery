/* archive.js — a collection of the pedestrian signals the user has switched on.
   Each completed figure (>=80%) is saved (PNG data URL + country) to
   localStorage and shown in the ARCHIVE view. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  const Archive = {
    KEY: "tj.signals.v1",
    list: [],

    init() {
      this.load();
      const x = TJ.$("#archiveX"); if (x) x.addEventListener("click", () => this.close());
      const s = TJ.$("#archiveToSphere"); if (s) s.addEventListener("click", () => this.close());
    },

    load() { try { this.list = JSON.parse(localStorage.getItem(this.KEY) || "[]"); } catch (e) { this.list = []; } },
    save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.list)); } catch (e) {} },

    add(entry) {
      this.list.unshift({
        id: TJ.uid("sig"),
        country: entry.country || "",
        dataUrl: entry.dataUrl,
        ts: Date.now(),
      });
      if (this.list.length > 60) this.list.length = 60;   // keep localStorage small
      this.save();
      TJ.toast((entry.country ? entry.country + " " : "") + "signal archived");
    },

    remove(id) {
      this.list = this.list.filter((e) => e.id !== id);
      this.save(); this.render();
    },

    open() { this.load(); this.render(); TJ.$("#archive").hidden = false; },
    close() { TJ.$("#archive").hidden = true; },

    fmtTs(ts) {
      const d = new Date(ts);
      return `${d.getFullYear()}.${TJ.pad2(d.getMonth() + 1)}.${TJ.pad2(d.getDate())}`;
    },

    render() {
      const grid = TJ.$("#archiveGrid"), empty = TJ.$("#archiveEmpty"), count = TJ.$("#archiveCount");
      if (!grid) return;
      grid.innerHTML = "";
      empty.hidden = this.list.length > 0;
      count.textContent = this.list.length
        ? `${this.list.length} signal${this.list.length > 1 ? "s" : ""} archived · newest first`
        : "Pedestrian pictograms you've switched on, archived by country.";
      this.list.forEach((e) => {
        grid.appendChild(TJ.el("div", { class: "arch-cell" }, [
          TJ.el("img", { src: e.dataUrl, alt: e.country || "signal" }),
          TJ.el("div", { class: "arch-cell__meta" }, [
            TJ.el("span", { text: e.country || "Signal" }),
            TJ.el("span", { text: this.fmtTs(e.ts) }),
          ]),
          TJ.el("button", { class: "arch-cell__del", title: "Delete", onclick: () => this.remove(e.id) }, "✕"),
        ]));
      });
    },
  };

  TJ.archive = Archive;
})(window.TJ);
