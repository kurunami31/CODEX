// Regenerates the PWA/app icons from the CB logo (client/public/assets/cb-logo.png)
// on the brand dark-teal gradient background. Pure Node — no native deps.
//
// Usage: node scripts/build-icons.mjs
// Writes: client/public/pwa-192x192.png, pwa-512x512.png, pwa-maskable-512x512.png
//
// Re-run this whenever the logo changes so the app icon stays in sync.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import zlib from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const LOGO_PATH = join(ROOT, 'client', 'public', 'assets', 'cb-logo.png');
const OUT = (name) => join(ROOT, 'client', 'public', name);

// ── minimal PNG decode ─────────────────────────────────────────────
function crcTable() {
  const t = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
}
const CRC_TABLE = crcTable();
function crc32(buf) {
  let crc = 0xffffffff;
  for (const b of buf) crc = CRC_TABLE[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  let idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`unsupported bit depth ${bitDepth}`);
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`unsupported color type ${colorType}`);
  const bpp = channels;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const recon = Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? recon[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (v + pr) & 0xff;
      }
      recon[x] = v;
    }
    for (let x = 0; x < width; x++) {
      const si = x * channels;
      const di = (y * width + x) * 4;
      if (colorType === 6) {
        rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = recon[si + 3];
      } else if (colorType === 2) {
        rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = 255;
      } else {
        rgba[di] = recon[si]; rgba[di + 1] = recon[si]; rgba[di + 2] = recon[si]; rgba[di + 3] = colorType === 4 ? recon[si + 1] : 255;
      }
    }
    prev = recon;
  }
  return { width, height, rgba };
}

// ── PNG encode (RGBA, 8-bit) ──────────────────────────────────────
function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── compositing ────────────────────────────────────────────────────
function hex(c) {
  return [c.r, c.g, c.b, c.a];
}

// brand vertical gradient: primary #1A5D78 (top) → deep #0B2B3A (bottom)
function bgPixel(x, y, size) {
  const t = y / (size - 1);
  const top = { r: 0x1a, g: 0x5d, b: 0x78 };
  const bot = { r: 0x0b, g: 0x2b, b: 0x3a };
  return [Math.round(top.r + (bot.r - top.r) * t), Math.round(top.g + (bot.g - top.g) * t), Math.round(top.b + (bot.b - top.b) * t), 255];
}

// bilinear sample of the source logo (premultiplied alpha to avoid fringes)
function samplePremul(src, w, h, fx, fy) {
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1);
  const tx = fx - x0, ty = fy - y0;
  const at = (x, y) => {
    const i = (y * w + x) * 4;
    const a = src[i + 3] / 255;
    return [src[i] * a, src[i + 1] * a, src[i + 2] * a, a];
  };
  const p00 = at(x0, y0), p10 = at(x1, y0), p01 = at(x0, y1), p11 = at(x1, y1);
  const top = [0, 1, 2, 3].map((k) => p00[k] + (p10[k] - p00[k]) * tx);
  const bot = [0, 1, 2, 3].map((k) => p01[k] + (p11[k] - p01[k]) * tx);
  return [0, 1, 2, 3].map((k) => top[k] + (bot[k] - top[k]) * ty);
}

function makeIcon(size, logoScale, logo, outPath) {
  const out = Buffer.alloc(size * size * 4);
  const logoW = logo.width, logoH = logo.height;
  const drawW = Math.round(size * logoScale);
  const drawH = Math.round(drawW * (logoH / logoW));
  const offX = Math.round((size - drawW) / 2);
  const offY = Math.round((size - drawH) / 2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const bg = bgPixel(x, y, size); // [r,g,b] 0..255
      const i = (y * size + x) * 4;
      let r = bg[0], g = bg[1], b = bg[2], a = 1; // a in 0..1, background is opaque
      if (x >= offX && y >= offY && x < offX + drawW && y < offY + drawH) {
        const fx = ((x - offX) / drawW) * (logoW - 1);
        const fy = ((y - offY) / drawH) * (logoH - 1);
        const [pr, pg, pb, pa] = samplePremul(logo.rgba, logoW, logoH, fx, fy); // pa in 0..1
        // src-over (src premultiplied)
        const aOut = pa + a * (1 - pa);
        if (aOut > 0) {
          r = (pr + bg[0] * a * (1 - pa)) / aOut;
          g = (pg + bg[1] * a * (1 - pa)) / aOut;
          b = (pb + bg[2] * a * (1 - pa)) / aOut;
          a = aOut;
        }
      }
      out[i] = Math.min(255, Math.max(0, Math.round(r)));
      out[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
      out[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
      out[i + 3] = Math.min(255, Math.max(0, Math.round(a * 255)));
    }
  }
  writeFileSync(outPath, encodePng(size, size, out));
  console.log(`wrote ${outPath} (${size}x${size})`);
}

const logo = decodePng(readFileSync(LOGO_PATH));
console.log(`logo: ${logo.width}x${logo.height}`);

// Non-maskable icons use the full canvas for the logo; the maskable one
// keeps the logo inside the 80% safe zone so OS masks don't crop it.
makeIcon(512, 0.72, logo, OUT('pwa-512x512.png'));
makeIcon(192, 0.72, logo, OUT('pwa-192x192.png'));
makeIcon(512, 0.6, logo, OUT('pwa-maskable-512x512.png'));
