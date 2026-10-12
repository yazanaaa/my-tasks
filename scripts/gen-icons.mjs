// Renders the PWA PNG icons from public/icon.svg.
import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const svg = await readFile('public/icon.svg');
await sharp(svg).resize(192, 192).png().toFile('public/icon-192.png');
await sharp(svg).resize(512, 512).png().toFile('public/icon-512.png');

// Maskable: full-bleed background with the glyph inside the safe zone.
const glyph = await sharp(svg).resize(360, 360).png().toBuffer();
await sharp({ create: { width: 512, height: 512, channels: 4, background: '#2F7CF6' } })
  .composite([{ input: glyph, gravity: 'center' }])
  .png()
  .toFile('public/icon-maskable-512.png');
console.log('icons written');
