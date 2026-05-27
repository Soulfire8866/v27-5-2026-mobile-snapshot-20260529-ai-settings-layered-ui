/**
 * Test tách chương trên file .txt lớn (chạy local, không load vào chat).
 * Usage: npx tsx scripts/test-chapter-rules-on-file.mjs "fixtures/Tam tan ky.txt"
 */
import { readFileSync, statSync } from "fs";
import { performance } from "perf_hooks";
import {
  parseChineseNovelChapters,
  parseChaptersWithCustomPattern,
  countContentChars,
} from "../src/utils/chapterParser.ts";
import {
  createDefaultChapterRuleStates,
  parseChaptersWithRules,
  previewRulesOnText,
  resolveChapterRules,
  getActiveCompiledRules,
} from "../src/utils/chapterRulesEngine.ts";

const filePath = process.argv[2];
const tocOnly = process.argv.includes("--toc-only");
if (!filePath) {
  console.error("Thiếu đường dẫn file. VD: npx tsx scripts/test-chapter-rules-on-file.mjs \"fixtures/Tam tan ky.txt\"");
  process.exit(1);
}

const stat = statSync(filePath);
const t0 = performance.now();
const raw = readFileSync(filePath, "utf8");
const readMs = performance.now() - t0;

const lines = raw.replace(/\r\n/g, "\n").split("\n");
let defaultRules = createDefaultChapterRuleStates();
if (tocOnly) {
  defaultRules = defaultRules.map((r) => ({
    ...r,
    enabled: r.id === "toc" || r.id === "toc-no-space",
  }));
}

const t1 = performance.now();
const rulesOnly = parseChaptersWithRules(raw, defaultRules);
const rulesMs = performance.now() - t1;

const t2 = performance.now();
const combined = parseChineseNovelChapters(raw, defaultRules);
const combinedMs = performance.now() - t2;

const preview = previewRulesOnText(raw, defaultRules, 12);

const active = getActiveCompiledRules(resolveChapterRules(defaultRules));
console.log("\n=== Test tách chương ===\n");
console.log(`File: ${filePath}`);
console.log(`Kích thước: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size.toLocaleString()} bytes)`);
console.log(`Số dòng: ${lines.length.toLocaleString()}`);
console.log(`Đọc file: ${readMs.toFixed(0)} ms`);
console.log(`Rule engine (${rulesOnly.enabledRuleCount} rule bật): ${rulesMs.toFixed(0)} ms`);
console.log(`parseChineseNovelChapters (rule + fallback): ${combinedMs.toFixed(0)} ms`);
console.log(`\nRule bật: ${active.map((r) => r.name).join(" | ")}`);

const ch = combined.chapters;
console.log(`\n--- Kết quả chính (parseChineseNovelChapters) ---`);
console.log(`Tổng chương: ${ch.length}`);
console.log(`stats:`, JSON.stringify(combined.stats, null, 2));
console.log(`Dòng khớp (preview): ${preview.matchCount}`);

const short = ch.filter((c) => countContentChars(c.text) < 40);
const empty = ch.filter((c) => countContentChars(c.text) === 0);
console.log(`Chương rất ngắn (<40 ký tự nội dung): ${short.length}`);
console.log(`Chương trống: ${empty.length}`);

const show = (label, arr, n = 8) => {
  console.log(`\n${label}:`);
  arr.slice(0, n).forEach((c, i) => {
    const cc = countContentChars(c.text);
    console.log(`  ${i + 1}. [${cc} chữ] ${c.originalName.slice(0, 72)}`);
  });
  if (arr.length > n) {
    console.log(`  ... và ${arr.length - n} chương nữa`);
  }
};

show("Tiêu đề đầu", ch);
show("Tiêu đề cuối", ch.slice(-8));

if (short.length > 0 && short.length <= 20) {
  show("Chương ngắn (cảnh báo)", short, 15);
} else if (short.length > 20) {
  console.log(`\nChương ngắn (5 mẫu / ${short.length}):`);
  short.slice(0, 5).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.originalName.slice(0, 60)} (${countContentChars(c.text)} chữ)`);
  });
}

// Thử mẫu 第<num>章 nếu rule cho ít chương hơn kỳ vọng
const custom = parseChaptersWithCustomPattern(raw, "第<num>章");
console.log(`\n--- So sánh mẫu 第<num>章 ---`);
console.log(`Số chương: ${custom.chapters.length}`);

console.log("\n=== Xong ===\n");
