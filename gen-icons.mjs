import sharp from 'sharp';

await sharp('assets/icon.svg', { density: 400 }).resize(192, 192).png().toFile('assets/icon-192.png');
await sharp('assets/icon.svg', { density: 400 }).resize(512, 512).png().toFile('assets/icon-512.png');

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#18181B"/>
  <circle cx="256" cy="256" r="102" fill="#FFD60A"/>
</svg>`;
await sharp(Buffer.from(maskable), { density: 400 }).resize(512, 512).png().toFile('assets/icon-maskable-512.png');

console.log('icons done');
