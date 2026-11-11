// Generates the app and tray icons in build/ with no dependencies (pure Node + zlib).
// Run with: npm run icons
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const u = (x + (sx + 0.5) / SS) / size;
          const v = (y + (sy + 0.5) / SS) / size;
          const [pr, pg, pb, pa] = pixel(u, v);
          r += pr * pa; g += pg * pa; b += pb * pa; a += pa;
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      const n = SS * SS;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / n) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

function inTri(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function inRoundedSquare(u, v, inset, radius) {
  const x = Math.abs(u - 0.5), y = Math.abs(v - 0.5);
  const half = 0.5 - inset;
  const dx = Math.max(0, x - (half - radius)), dy = Math.max(0, y - (half - radius));
  return x <= half && y <= half && dx * dx + dy * dy <= radius * radius;
}

// App icon: night-to-dawn tile, floating island, pine tree, timer ring.
function appIcon(u, v) {
  if (!inRoundedSquare(u, v, 0.06, 0.2)) return [0, 0, 0, 0];
  const dx = u - 0.5, dy = v - 0.5, d = Math.hypot(dx, dy);
  // progress ring (3/4 complete)
  const ang = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
  if (d > 0.33 && d < 0.37) return ang < Math.PI * 1.5 ? [...hex('#7bd497'), 1] : [...hex('#2b4a3c'), 1];
  // pine tree
  const tiers = [[[0.5, 0.2], [0.36, 0.42], [0.64, 0.42]], [[0.5, 0.3], [0.32, 0.54], [0.68, 0.54]], [[0.5, 0.4], [0.29, 0.64], [0.71, 0.64]]];
  for (const [i, t] of tiers.entries()) if (inTri(u, v, ...t)) return [...hex(['#5fbf7f', '#4fae6c', '#3f9a5c'][i]), 1];
  if (u > 0.47 && u < 0.53 && v >= 0.64 && v < 0.7) return [...hex('#8a5a3a'), 1];
  // island
  const ix = (u - 0.5) / 0.26, iy = (v - 0.7) / 0.05;
  if (ix * ix + iy * iy <= 1) return [...hex('#6fb35a'), 1];
  if (inTri(u, v, [0.25, 0.71], [0.75, 0.71], [0.52, 0.84])) return [...hex('#7a5a40'), 1];
  // sky gradient
  const k = v;
  const top = hex('#14213f'), bot = hex('#2f5a6e');
  return [top[0] + (bot[0] - top[0]) * k, top[1] + (bot[1] - top[1]) * k, top[2] + (bot[2] - top[2]) * k, 1];
}

// Tray icon: tree inside a ring. The macOS template version is black and uses alpha only.
function trayIcon(color) {
  const c = hex(color);
  return (u, v) => {
    const d = Math.hypot(u - 0.5, v - 0.5);
    if (d > 0.36 && d < 0.47) return [...c, 1];
    if (inTri(u, v, [0.5, 0.2], [0.3, 0.62], [0.7, 0.62])) return [...c, 1];
    if (u > 0.45 && u < 0.55 && v >= 0.62 && v < 0.76) return [...c, 1];
    return [0, 0, 0, 0];
  };
}

const out = path.join(__dirname, '..', 'build');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'icon.png'), png(1024, appIcon));
fs.writeFileSync(path.join(out, 'tray.png'), png(32, trayIcon('#4fae6c')));
fs.writeFileSync(path.join(out, 'trayTemplate.png'), png(18, trayIcon('#000000')));
fs.writeFileSync(path.join(out, 'trayTemplate@2x.png'), png(36, trayIcon('#000000')));
console.log('Icons written to build/');
