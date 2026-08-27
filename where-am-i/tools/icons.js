/**
 * Draws the app icons and writes them as PNGs.
 *
 * Hand-rolled for the same reason the charts are: the icon is one shape — a
 * ring, part filled — and pulling in a raster toolchain to draw it would cost
 * more than the whole rest of the build. It runs from `npm run build`, so the
 * icons in public/ are always the ones this file describes.
 *
 * The image is full-bleed, which is what a maskable icon needs: Android crops
 * it to whatever shape the launcher uses, and only the middle 80% is promised
 * to survive. The ring sits well inside that.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'public');

const INK = [0x1a, 0x1a, 0x17];
const PAPER = [0xfb, 0xfb, 0xf9];
const AHEAD = [0x57, 0xbd, 0x97];

/** How much of the ring is drawn. Not 100%: an icon claiming a finished goal would be a lie. */
const FILLED = 0.62;
const SAMPLES = 3;

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png(width, height, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;   // bit depth
  header[9] = 6;   // truecolour with alpha
  header[10] = 0;  // deflate
  header[11] = 0;  // adaptive filtering
  header[12] = 0;  // no interlace

  // One filter byte per scanline. Filter 0 (none) keeps this readable; the
  // images are flat colour and deflate handles them well enough regardless.
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Which colour, if any, this exact point falls on. Sampled, not rasterised. */
function sample(x, y, size) {
  const centre = size / 2;
  const dx = x - centre;
  const dy = y - centre;
  const distance = Math.hypot(dx, dy);

  const radius = size * 0.3;
  const stroke = size * 0.085;
  const inner = radius - stroke / 2;
  const outer = radius + stroke / 2;

  if (distance < inner || distance > outer) return null;

  // Angle measured clockwise from twelve o'clock, matching the ring on screen.
  const angle = (Math.atan2(dy, dx) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
  const fraction = angle / (Math.PI * 2);

  // The pace tick: a short gap in the ring at the point the calendar expects.
  if (Math.abs(fraction - 0.78) < 0.008) return AHEAD;

  return fraction <= FILLED ? PAPER : null;
}

function draw(size) {
  const pixels = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let hits = 0;

      // Supersampled, because a ring drawn straight onto the pixel grid at
      // 192px has visibly ragged edges.
      for (let sy = 0; sy < SAMPLES; sy += 1) {
        for (let sx = 0; sx < SAMPLES; sx += 1) {
          const colour = sample(x + (sx + 0.5) / SAMPLES, y + (sy + 0.5) / SAMPLES, size);
          if (!colour) continue;
          r += colour[0];
          g += colour[1];
          b += colour[2];
          hits += 1;
        }
      }

      const total = SAMPLES * SAMPLES;
      const coverage = hits / total;
      const offset = (y * size + x) * 4;
      // Composited onto the ink background rather than left transparent: a
      // maskable icon has to fill its whole box.
      pixels[offset] = Math.round(INK[0] * (1 - coverage) + (hits ? r / hits : 0) * coverage);
      pixels[offset + 1] = Math.round(INK[1] * (1 - coverage) + (hits ? g / hits : 0) * coverage);
      pixels[offset + 2] = Math.round(INK[2] * (1 - coverage) + (hits ? b / hits : 0) * coverage);
      pixels[offset + 3] = 255;
    }
  }

  return png(size, size, pixels);
}

mkdirSync(OUT, { recursive: true });
for (const size of [192, 512]) {
  const file = join(OUT, `icon-${size}.png`);
  writeFileSync(file, draw(size));
  console.log(`icon-${size}.png`);
}
