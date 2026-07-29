/* exif.js — minimal, dependency-free EXIF reader.
   Extracts DateTimeOriginal and GPS lat/lon from JPEG APP1 (Exif) segment.
   Gracefully returns {} when data is absent or file is not a JPEG. */
window.TJ = window.TJ || {};
(function (TJ) {
  "use strict";

  function readExifFromArrayBuffer(buf) {
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}; // not JPEG
    let offset = 2;
    const len = view.byteLength;
    while (offset < len) {
      if (view.getUint16(offset) === 0xffe1) {
        // APP1
        return parseApp1(view, offset + 4);
      }
      if ((view.getUint16(offset) & 0xff00) !== 0xff00) break;
      offset += 2 + view.getUint16(offset + 2);
    }
    return {};
  }

  function parseApp1(view, start) {
    // "Exif\0\0"
    if (view.getUint32(start) !== 0x45786966) return {};
    const tiff = start + 6;
    const little = view.getUint16(tiff) === 0x4949;
    const get16 = (o) => view.getUint16(o, little);
    const get32 = (o) => view.getUint32(o, little);
    if (get16(tiff + 2) !== 0x002a) return {};

    const ifd0 = tiff + get32(tiff + 4);
    const out = {};
    let exifIfdPtr = null, gpsIfdPtr = null;

    readDir(view, ifd0, tiff, little, (tag, type, count, valOff) => {
      if (tag === 0x8769) exifIfdPtr = tiff + get32(valOff);
      else if (tag === 0x8825) gpsIfdPtr = tiff + get32(valOff);
    });

    if (exifIfdPtr) {
      readDir(view, exifIfdPtr, tiff, little, (tag, type, count, valOff) => {
        // 0x9003 DateTimeOriginal, 0x9004 DateTimeDigitized, 0x0132 DateTime
        if (tag === 0x9003 || tag === 0x0132) {
          const s = readAscii(view, valOff, count);
          const d = parseExifDate(s);
          if (d) out.time = d;
        }
      });
    }
    if (gpsIfdPtr) {
      let latRef, lonRef, lat, lon;
      readDir(view, gpsIfdPtr, tiff, little, (tag, type, count, valOff) => {
        if (tag === 1) latRef = readAscii(view, valOff, count).trim();
        else if (tag === 3) lonRef = readAscii(view, valOff, count).trim();
        else if (tag === 2) lat = readRational3(view, get32(valOff) + tiff, little);
        else if (tag === 4) lon = readRational3(view, get32(valOff) + tiff, little);
      });
      if (lat != null && lon != null) {
        out.gps = {
          lat: (latRef === "S" ? -1 : 1) * lat,
          lon: (lonRef === "W" ? -1 : 1) * lon,
        };
      }
    }
    return out;
  }

  function readDir(view, dir, tiff, little, cb) {
    const get16 = (o) => view.getUint16(o, little);
    const count = get16(dir);
    for (let i = 0; i < count; i++) {
      const entry = dir + 2 + i * 12;
      const tag = get16(entry);
      const type = get16(entry + 2);
      const num = view.getUint32(entry + 4, little);
      cb(tag, type, num, entry + 8);
    }
  }

  function readAscii(view, off, count) {
    let s = "";
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }

  function readRational3(view, off, little) {
    const r = (o) => {
      const n = view.getUint32(o, little), d = view.getUint32(o + 4, little);
      return d ? n / d : 0;
    };
    const deg = r(off), min = r(off + 8), sec = r(off + 16);
    return deg + min / 60 + sec / 3600;
  }

  function parseExifDate(s) {
    // "YYYY:MM:DD HH:MM:SS"
    const m = /(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s || "");
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
    return isNaN(d.getTime()) ? null : d;
  }

  TJ.readExif = function (file) {
    return new Promise((resolve) => {
      if (!/jpe?g/i.test(file.type) && !/\.jpe?g$/i.test(file.name)) return resolve({});
      const slice = file.slice(0, 128 * 1024); // metadata lives near the top
      const reader = new FileReader();
      reader.onload = () => {
        try { resolve(readExifFromArrayBuffer(reader.result)); }
        catch (e) { resolve({}); }
      };
      reader.onerror = () => resolve({});
      reader.readAsArrayBuffer(slice);
    });
  };
})(window.TJ);
