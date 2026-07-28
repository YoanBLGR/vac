import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const output = new URL("../public/icons/", import.meta.url);
await mkdir(output, { recursive: true });

const icon = (size, maskable = false) => `
<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.22}" fill="#102f38"/>
  <circle cx="${size * 0.73}" cy="${size * 0.27}" r="${size * 0.11}" fill="#ed9a67"/>
  <path d="M${size * 0.16} ${size * 0.75} C${size * 0.34} ${size * 0.58}, ${size * 0.48} ${size * 0.44}, ${size * 0.84} ${size * 0.29}" fill="none" stroke="#f4efe4" stroke-width="${size * 0.06}" stroke-linecap="round"/>
  <path d="M${size * 0.16} ${size * 0.75} C${size * 0.36} ${size * 0.82}, ${size * 0.58} ${size * 0.82}, ${size * 0.84} ${size * 0.67}" fill="none" stroke="#2c7880" stroke-width="${size * 0.11}" stroke-linecap="round"/>
  <circle cx="${size * 0.16}" cy="${size * 0.75}" r="${size * 0.048}" fill="#d6513b"/>
  <circle cx="${size * 0.84}" cy="${size * 0.29}" r="${size * 0.048}" fill="#f4efe4"/>
</svg>`;

await sharp(Buffer.from(icon(192))).png().toFile(fileURLToPath(new URL("icon-192.png", output)));
await sharp(Buffer.from(icon(512))).png().toFile(fileURLToPath(new URL("icon-512.png", output)));
await sharp(Buffer.from(icon(512, true))).png().toFile(fileURLToPath(new URL("icon-maskable.png", output)));

console.log("Icônes PWA générées.");
