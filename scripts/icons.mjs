// Renders the PNG app icons (black tile, crimson mark) without any image dependencies.
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const BG = [0x0c, 0x0a, 0x0a], MARK = [0xb1, 0x12, 0x26];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return ~c >>> 0; };
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

// Rounded-rect coverage with 4x4 supersampling for smooth edges.
function inRound(x, y, x0, y0, w, h, r) {
  if (x < x0 || y < y0 || x > x0 + w || y > y0 + h) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + w - r), cy = Math.min(Math.max(y, y0 + r), y0 + h - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function icon(size, { tileRadius, markScale }) {
  const s = size / 512;
  const mw = 100 * markScale * s, mh = 160 * markScale * s;
  const mx = (size - mw) / 2, my = (size - mh) / 2, mr = 20 * markScale * s;
  const rows = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let x = 0; x < size; x++) {
      let tile = 0, mark = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
        if (inRound(px, py, 0, 0, size, size, tileRadius * s)) tile++;
        if (inRound(px, py, mx, my, mw, mh, mr)) mark++;
      }
      const m = mark / 16, a = tile / 16;
      const o = 1 + x * 4;
      for (let i = 0; i < 3; i++) row[o + i] = Math.round(BG[i] * (1 - m) + MARK[i] * m);
      row[o + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(rows))), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Legacy launcher icons for Android < 8 (newer versions use the adaptive vector icon).
const RES = 'android/app/src/main/res';
for (const [dir, px] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  writeFileSync(`${RES}/mipmap-${dir}/ic_launcher.png`, icon(px, { tileRadius: 112, markScale: 1 }));
  writeFileSync(`${RES}/mipmap-${dir}/ic_launcher_round.png`, icon(px, { tileRadius: 256, markScale: 1 }));
}
writeFileSync('public/icon-192.png', icon(192, { tileRadius: 112, markScale: 1 }));
writeFileSync('public/icon-512.png', icon(512, { tileRadius: 112, markScale: 1 }));
writeFileSync('public/icon-maskable-512.png', icon(512, { tileRadius: 0, markScale: 0.8 }));
console.log('icons written');
