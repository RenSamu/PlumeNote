// Génère toutes les icônes depuis le dessin de la plume (nib).
import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';

const BG = '#141311', AMBER = '#F2A33A';
const NIB = `<path d="M12 2.8c3.4 2.9 5.6 6.3 5.6 9.9 0 2.1-.8 3.9-2.3 5.3L12 21.2l-3.3-3.2c-1.5-1.4-2.3-3.2-2.3-5.3 0-3.6 2.2-7 5.6-9.9z" fill="${AMBER}"/><path d="M12 11v7.4" stroke="${BG}" stroke-width="1.6" stroke-linecap="round"/><circle cx="12" cy="10.2" r="1.3" fill="${BG}"/>`;

const svg = ({ size, scale, radius = 0, bg = BG, nib = true, dy = 0 }) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
${bg ? `<rect width="${size}" height="${size}" rx="${radius}" fill="${bg}"/>` : ''}
${nib ? `<g transform="translate(${size / 2} ${size / 2 + dy}) scale(${scale}) translate(-12 -12)">${NIB}</g>` : ''}
</svg>`;

mkdirSync('assets/web-icons', { recursive: true });
mkdirSync('assets', { recursive: true });
const png = (s, file, size) => sharp(Buffer.from(s)).resize(size, size).png().toFile(file);

const main512 = svg({ size: 512, scale: 15.5, radius: 112 });
writeFileSync('assets/web-icons/icon.svg', main512);
await png(main512, 'assets/web-icons/icon-512.png', 512);
await png(main512, 'assets/web-icons/icon-192.png', 192);
await png(svg({ size: 512, scale: 12.5, radius: 0 }), 'assets/web-icons/icon-maskable-512.png', 512);

// Ressources pour @capacitor/assets (Android)
await png(svg({ size: 1024, scale: 31, radius: 0 }), 'assets/icon-only.png', 1024);
await png(svg({ size: 1024, scale: 25, bg: null }), 'assets/icon-foreground.png', 1024);
await png(svg({ size: 1024, scale: 1, nib: false }), 'assets/icon-background.png', 1024);
const splash = svg({ size: 2732, scale: 22 });
await png(splash, 'assets/splash.png', 2732);
await png(splash, 'assets/splash-dark.png', 2732);
console.log('icônes générées');
