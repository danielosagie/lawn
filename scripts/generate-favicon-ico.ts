import fs from "node:fs";
import path from "node:path";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const publicDir = path.join(process.cwd(), "public");
const svgPath = path.join(publicDir, "favicon.svg");
const svg = fs.readFileSync(svgPath);

const sizes = [16, 32, 48] as const;
const pngs = await Promise.all(
  sizes.map((s) =>
    sharp(svg)
      .resize(s, s)
      .png({ compressionLevel: 9, effort: 10, palette: true, colors: 128 })
      .toBuffer(),
  ),
);

const ico = await pngToIco(pngs);
const out = path.join(publicDir, "favicon.ico");
fs.writeFileSync(out, ico);
console.log(`Wrote ${out} (${ico.length} bytes)`);
