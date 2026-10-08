// Sinh icon PNG (không cần thư viện ngoài): ô vuông bo góc màu indigo + dấu tick trắng.
// Chạy: npm run icons  (sau đó `tauri icon` tạo icon.ico cho Windows)

import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [79, 70, 229];
const FG = [255, 255, 255];

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function insideRounded(u, v, r) {
  if (r <= 0) return true;
  const cx = Math.min(Math.max(u, r), 1 - r);
  const cy = Math.min(Math.max(v, r), 1 - r);
  return Math.hypot(u - cx, v - cy) <= r;
}

/** u,v trong [0,1]; scale < 1 thu nhỏ dấu tick (vùng an toàn cho maskable) */
function render(size, { radius = 0.22, scale = 1 } = {}) {
  const SS = 4;
  const pts = [[0.28, 0.53], [0.44, 0.68], [0.73, 0.36]].map(([x, y]) => [0.5 + (x - 0.5) * scale, 0.5 + (y - 0.5) * scale]);
  const half = 0.055 * scale;
  return png(size, (x, y) => {
    let bg = 0, fg = 0;
    for (let i = 0; i < SS; i++) {
      for (let j = 0; j < SS; j++) {
        const u = (x + (i + 0.5) / SS) / size;
        const v = (y + (j + 0.5) / SS) / size;
        if (!insideRounded(u, v, radius)) continue;
        bg++;
        const d = Math.min(distToSegment(u, v, ...pts[0], ...pts[1]), distToSegment(u, v, ...pts[1], ...pts[2]));
        if (d <= half) fg++;
      }
    }
    const n = SS * SS;
    const a = bg / n;
    if (a === 0) return [0, 0, 0, 0];
    const f = fg / bg;
    return [0, 1, 2].map((k) => Math.round(BG[k] * (1 - f) + FG[k] * f)).concat(Math.round(a * 255));
  });
}

mkdirSync('public/icons', { recursive: true });
mkdirSync('build', { recursive: true });
writeFileSync('public/icons/pwa-192.png', render(192));
writeFileSync('public/icons/pwa-512.png', render(512));
writeFileSync('public/icons/maskable-512.png', render(512, { radius: 0, scale: 0.75 }));
writeFileSync('public/icons/apple-touch-icon.png', render(180, { radius: 0, scale: 0.85 }));
writeFileSync('build/app-icon.png', render(1024));
writeFileSync('public/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#4f46e5"/><path d="M18 34 L28 43.5 L46.7 23" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>\n`);
console.log('Icons generated.');
