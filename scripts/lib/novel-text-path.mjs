import fs from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** Khớp rect sách trong PandaBrandIcon (viewBox 80×80) */
export const PANDA_BOOK_LABEL = {
  centerX: 40,
  centerY: 58,
  fontSize: 8,
};

const FONT_CANDIDATES = [
  "C:/Windows/Fonts/msyhbd.ttc",
  "C:/Windows/Fonts/msyh.ttc",
  "C:/Windows/Fonts/simsunb.ttf",
  "C:/Windows/Fonts/simsun.ttc",
];

function openCjkFont() {
  const fontkit = require("fontkit");
  for (const file of FONT_CANDIDATES) {
    if (!fs.existsSync(file)) continue;
    try {
      const handle = fontkit.openSync(file);
      if (handle.fonts?.length) return handle.fonts[0];
      return handle;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Không tìm thấy font tiếng Trung (msyh / simsun). Cần Windows font CJK."
  );
}

/** Path vector cho 「小说」 — căn giữa trên quyển sách cam */
export function novelTextPathData({
  text = "小说",
  fontSize = PANDA_BOOK_LABEL.fontSize,
  centerX = PANDA_BOOK_LABEL.centerX,
  centerY = PANDA_BOOK_LABEL.centerY,
} = {}) {
  const font = openCjkFont();
  const run = font.layout(text);
  const scale = fontSize / font.unitsPerEm;

  let x = 0;
  const scaled = [];
  for (const glyph of run.glyphs) {
    scaled.push({
      path: glyph.path.scale(scale).translate(x, 0),
      advance: glyph.advanceWidth * scale,
    });
    x += glyph.advanceWidth * scale;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const { path } of scaled) {
    const b = path.bbox;
    if (!b) continue;
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
  }

  if (!Number.isFinite(minX)) {
    return "";
  }

  const boxCx = (minX + maxX) / 2;
  const boxCy = (minY + maxY) / 2;
  const dx = centerX - boxCx;
  const dy = centerY - boxCy;

  return scaled.map(({ path }) => path.translate(dx, dy).toSVG()).join(" ");
}
