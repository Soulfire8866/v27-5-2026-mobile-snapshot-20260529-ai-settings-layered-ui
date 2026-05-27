/**
 * Tạo resources/icon.png từ SVG (chữ 「小说」 = path vector) và mipmap Android.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { novelTextPathData } from "./lib/novel-text-path.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pngPath = path.join(root, "resources", "icon.png");
const svgPath = path.join(root, "resources", "icon.svg");
const androidRes = path.join(root, "android", "app", "src", "main", "res");

const LEGACY = {
  "mipmap-mdpi": 48,
  "mipmap-hdpi": 72,
  "mipmap-xhdpi": 96,
  "mipmap-xxhdpi": 144,
  "mipmap-xxxhdpi": 192,
};

const FOREGROUND = {
  "mipmap-mdpi": 108,
  "mipmap-hdpi": 162,
  "mipmap-xhdpi": 216,
  "mipmap-xxhdpi": 324,
  "mipmap-xxxhdpi": 432,
};

function buildLauncherSvg() {
  const novelPath = novelTextPathData();
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="#0f6e6e"/>
  <g transform="translate(112 112) scale(10)">
    <circle cx="17" cy="28" r="5.5" fill="#000000"/>
    <circle cx="37" cy="28" r="5.5" fill="#000000"/>
    <circle cx="43" cy="28" r="5.5" fill="#000000"/>
    <circle cx="63" cy="28" r="5.5" fill="#000000"/>
    <circle cx="27" cy="38" r="13" fill="#FFFFFF"/>
    <circle cx="53" cy="38" r="13" fill="#FFFFFF"/>
    <ellipse cx="22" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(-15 22 37)"/>
    <ellipse cx="32" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(15 32 37)"/>
    <circle cx="23" cy="36" r="1.2" fill="#FFFFFF"/>
    <circle cx="31" cy="36" r="1.2" fill="#FFFFFF"/>
    <ellipse cx="27" cy="42" rx="1.8" ry="1.2" fill="#000000"/>
    <circle cx="18" cy="42" r="2" fill="#FF8D9E" fill-opacity="0.6"/>
    <circle cx="36" cy="42" r="2" fill="#FF8D9E" fill-opacity="0.6"/>
    <circle cx="13" cy="23" r="1.6" fill="#F472B6"/>
    <path d="M13 23 L9 20 L9 26 Z" fill="#F43F5E"/>
    <path d="M13 23 L17 20 L17 26 Z" fill="#F43F5E"/>
    <ellipse cx="48" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(-15 48 37)"/>
    <ellipse cx="58" cy="37" rx="3.5" ry="4.5" fill="#000000" transform="rotate(15 58 37)"/>
    <circle cx="49" cy="36" r="1.2" fill="#FFFFFF"/>
    <circle cx="57" cy="36" r="1.2" fill="#FFFFFF"/>
    <ellipse cx="53" cy="42" rx="1.8" ry="1.2" fill="#000000"/>
    <circle cx="14" cy="52" r="4.5" fill="#000000"/>
    <circle cx="66" cy="52" r="4.5" fill="#000000"/>
    <rect x="22" y="47" width="36" height="22" rx="3" fill="#E67E22" stroke="#FFFFFF" stroke-width="1.2"/>
    <path fill="#FFFFFF" d="${novelPath}"/>
    <circle cx="25" cy="54" r="4" fill="#000000"/>
    <circle cx="55" cy="54" r="4" fill="#000000"/>
  </g>
</svg>`;
}

async function writePng(sharp, src, out, size) {
  await sharp(src).resize(size, size).png().toFile(out);
}

async function main() {
  let sharp;
  try {
    sharp = (await import("sharp")).default;
  } catch {
    console.error("Cần cài sharp: npm install -D sharp");
    process.exit(1);
  }

  const svg = Buffer.from(buildLauncherSvg(), "utf8");
  fs.writeFileSync(svgPath, svg);
  console.log("Đã tạo", svgPath);

  await sharp(svg, { density: 300 }).resize(1024, 1024).png().toFile(pngPath);
  console.log("Đã tạo", pngPath);

  for (const [folder, size] of Object.entries(LEGACY)) {
    const dir = path.join(androidRes, folder);
    fs.mkdirSync(dir, { recursive: true });
    await writePng(sharp, pngPath, path.join(dir, "ic_launcher.png"), size);
    await writePng(sharp, pngPath, path.join(dir, "ic_launcher_round.png"), size);
  }

  for (const [folder, size] of Object.entries(FOREGROUND)) {
    const dir = path.join(androidRes, folder);
    fs.mkdirSync(dir, { recursive: true });
    await writePng(sharp, pngPath, path.join(dir, "ic_launcher_foreground.png"), size);
  }

  console.log("Đã cập nhật mipmap Android (ic_launcher + foreground)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
