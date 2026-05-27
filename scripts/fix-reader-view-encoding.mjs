/**
 * Khôi phục UTF-8 cho ReaderView.tsx (mojibake Latin-1).
 * Đã chạy 2026-05-27 — giữ lại nếu cần khôi phục lại file bị hỏng.
 * Chạy: node scripts/fix-reader-view-encoding.mjs
 * Sau đó rà tay / npm run check:encoding
 */
import fs from "fs";
import path from "path";

const TARGET = path.join("src", "components", "ReaderView.tsx");

let raw = fs.readFileSync(TARGET, "utf8");

// Editor đôi khi thay byte điều khiển bằng dấu ngoặc góc
raw = raw.replace(/\u203a/g, "\u009b");
raw = raw.replace(/\u2039/g, "\u008b");

let fixed = Buffer.from(raw, "latin1").toString("utf8");

// Regex đ/Đ trong removeVietnameseTones (không qua latin1 đúng)
fixed = fixed.replace(/\/\u00c4\u2018/g, "/\u0111");
fixed = fixed.replace(/\/\u00c4\u0090/g, "/\u0110");
fixed = fixed.replace(/\/\^\u00c4\u2018/g, "/^\u0111");

// BOM / ký tự đầu file hỏng sau decode
fixed = fixed.replace(/^\uFEFF/, "");
fixed = fixed.replace(/^\uFFFDimport/, "import");

// Sửa sót phổ biến sau decode (control + FFFD)
const postPairs = [
  [/\uFFFD\u0018/g, "\u0111"], // đ
  [/\uFFFD\u0090/g, "\u0110"], // Đ
  [/\uFFFD\u001C/g, "\u1ED1"], // ố
  [/\uFFFD\u0014/g, "\u1ED1"], // ố variant
  [/\uFFFD\u201C/g, "\u201C"],
  [/\uFFFD\u201D/g, "\u201D"],
  [/\uFFFD/g, ""], // còn lại — log bên dưới
];

for (const [re, sub] of postPairs.slice(0, -1)) {
  fixed = fixed.replace(re, sub);
}

const remaining = (fixed.match(/\uFFFD/g) || []).length;
if (remaining > 0) {
  console.warn(`Còn ${remaining} ký tự U+FFFD — cần rà tay.`);
}

const mojibake = fixed.match(/Ã|â€|Ä|Æ°|áº|Â«|Â»/g);
if (mojibake?.length) {
  console.error("Vẫn còn mojibake:", mojibake.length);
  process.exit(1);
}

fs.writeFileSync(TARGET, fixed, "utf8");
console.log("Đã ghi", TARGET, "— kiểm tra: npm run lint && npm run check:encoding");
