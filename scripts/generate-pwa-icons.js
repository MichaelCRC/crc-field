#!/usr/bin/env node
// Generate PWA icons for the CRC portal (and field app via flag).
// Usage: node scripts/generate-pwa-icons.js <source.svg|png> <outDir>
// Outputs icon-192.png, icon-512.png, apple-touch-icon.png — CRC badge on navy.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const NAVY = { r: 0, g: 26, b: 77 };

async function render(source, outDir, size, fileName, iconScale) {
  const pad = Math.round(size * (1 - iconScale) / 2);
  const iconSize = size - pad * 2;
  const rendered = await sharp(source, { density: 400 })
    .resize(iconSize, iconSize, { fit: 'contain', background: { r: NAVY.r, g: NAVY.g, b: NAVY.b, alpha: 1 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: size, height: size, channels: 4,
      background: { r: NAVY.r, g: NAVY.g, b: NAVY.b, alpha: 1 },
    },
  })
    .composite([{ input: rendered, top: pad, left: pad }])
    .png()
    .toFile(path.join(outDir, fileName));
  console.log(' wrote', fileName, size + 'x' + size);
}

(async function main() {
  const source = process.argv[2];
  const outDir = process.argv[3];
  if (!source || !outDir) {
    console.error('Usage: node generate-pwa-icons.js <source> <outDir>');
    process.exit(1);
  }
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  // Maskable icons need ~80% safe zone — shrink the badge, navy bleeds to edge
  await render(source, outDir, 192, 'icon-192.png', 0.72);
  await render(source, outDir, 512, 'icon-512.png', 0.72);
  // Apple touch icon — iOS adds its own rounded mask, so we use more of the canvas
  await render(source, outDir, 180, 'apple-touch-icon.png', 0.80);
  console.log('done.');
})().catch(e => { console.error(e); process.exit(1); });
