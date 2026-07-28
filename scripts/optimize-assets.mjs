import sharp from "sharp";
import { fileURLToPath } from "node:url";

const input = fileURLToPath(new URL("../public/images/albanian-riviera.png", import.meta.url));
const output = fileURLToPath(new URL("../public/images/albanian-riviera.webp", import.meta.url));

await sharp(input)
  .resize({ width: 1280, withoutEnlargement: true })
  .webp({ quality: 84, effort: 6 })
  .toFile(output);

console.log("Visuel principal optimisé en WebP.");
