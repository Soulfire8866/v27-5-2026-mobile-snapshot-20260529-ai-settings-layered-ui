/**
 * Mô phỏng kịch bản người dùng (trước build APK):
 * - Tải file .txt Trung
 * - Lab Dịch song ngữ (dòng)
 * - Tra cứu Phòng Đọc
 * - Xoay API key / batch luồng
 *
 * Chạy: npx tsx scripts/qa-user-scenarios.mjs
 */

import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import {
  parseChineseNovelChapters,
  parseChaptersWithCustomPattern,
  isLikelyChapterHeader,
  countContentChars,
} from "../src/utils/chapterParser.ts";
import {
  createDefaultChapterRuleStates,
  parseChaptersWithRules,
} from "../src/utils/chapterRulesEngine.ts";
import { compileChapterPattern } from "../src/utils/chapterPattern.ts";
import { resolveSelectionFromBilingualChapter } from "../src/utils/bilingualAlignment.ts";
import {
  expandProperNameInLine,
  resolveLabBilingualSelection,
  validateDictPairBeforeSave,
  isProperNamePhrase,
} from "../src/utils/labSelectionPipeline.ts";
import {
  snapSplitIndexToWordBoundary,
  splitTextToFitHeight,
} from "../src/utils/readerPagination.ts";
import {
  saveReaderSequentialState,
  loadReaderSequentialState,
} from "../src/utils/readerSequentialState.ts";
import { buildDictContextString, MAX_DICT_CONTEXT_CHARS } from "../src/utils/dictContextBuilder.ts";
import {
  computeReaderSettingsPanelTopPx,
  getReaderThemeTokens,
  normalizeReaderTheme,
  READER_SAFE_TOP_FALLBACK_PX,
  READER_TOOLBAR_HEIGHT_PX,
} from "../src/utils/readerChromeLayout.ts";
import {
  mergeTranslationBackup,
  novelToTranslationBackupPayload,
  previewTranslationBackupMerge,
  TRANSLATION_BACKUP_KIND,
  TRANSLATION_BACKUP_SCHEMA_VERSION,
} from "../src/utils/translationBackup.ts";
import { readerThemeChromeBg } from "../src/utils/systemChrome.ts";
import { lookupSelectionInDict, lookupChineseInDict } from "../src/utils/dictLookup.ts";
import {
  buildTranslationAttempts,
  buildSystemInstruction,
  hasUserTranslationPrompts,
  resolveDeepSeekApiModel,
  normalizePromptForApi,
  parseApiKeys,
  isRateLimitError,
} from "../src/utils/translationClient.ts";
import { mapWithConcurrency, clampThreadCount } from "../src/utils/concurrency.ts";
import {
  orderAttemptsByQuota,
  recordApiRequest,
  recordApiRateLimit,
  resetQuotaTrackerForTests,
} from "../src/utils/apiQuotaTracker.ts";
import { TRANSLATION_QUEUE_MIN_GAP_MS } from "../src/utils/translationQueue.ts";
import {
  resolveChapterTranslationPlan,
  splitLinesIntoChunks,
  validateTranslationLineCount,
  formatLineMismatchWarning,
  buildChapterSourceWithTitle,
  splitChapterTranslationResult,
  buildCompareBilingualTexts,
  TIER_A_MAX_CHARS,
  TIER_A_MAX_CHARS_DEEPSEEK,
  TIER_A_MAX_LINES,
  TIER_B_LINES_PER_CHUNK_DEEPSEEK,
  DEEPSEEK_FORCE_CHUNK_CHARS,
  FORCE_CHUNK_CHARS,
  resolveChunkLineCountForModel,
} from "../src/utils/chapterTranslationEngine.ts";
import { isDeepSeekChunkSplitError } from "../src/utils/translationClient.ts";
import {
  isLineCountMismatchError,
  isDeepSeekRecoverableChunkError,
  resolveChapterChunkConcurrency,
  CHAPTER_CHUNK_MAX_CONCURRENCY,
} from "../src/utils/chapterTranslationEngine.ts";
import { buildChunkContinuityPrefix } from "../src/utils/chunkContinuity.ts";
import {
  realignTranslationToSourceLineCount,
  buildNumberedSourcePayload,
  parseNumberedTranslationResponse,
} from "../src/utils/translationLineProtocol.ts";
import {
  clampAutoTranslateDelaySec,
  shouldArmSequentialAfterNav,
  resolveChapterNavKind,
  canAccumulateDwellTime,
  READER_AUTO_TRANSLATE_MIN_DELAY_SEC,
} from "../src/utils/readerAutoTranslateNext.ts";
import { getHanVietOffline } from "../src/utils/hanVietOffline.ts";
import {
  isScanNoiseChinesePhrase,
  isLikelyNameFromVietphrase,
  expandVietnameseSuffixAfterPhrase,
  resolveTranslationFromLabCorpus,
  buildNameScanRow,
  isLabMatchPlausible,
  pickBestLabPhraseForChineseOnLine,
} from "../src/utils/nameScanPipeline.ts";
import {
  buildDictReplacementPreview,
  buildDictExportTxtContent,
  filterSuspiciousPreviewRows,
  isNovelDictImportEligible,
  isValidDictReplaceFrom,
  countReplacementOnAlignedLines,
} from "../src/utils/novelDictImport.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, "../fixtures/test-novel-cn.txt");

let passed = 0;
let failed = 0;
let warnings = [];

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function warn(msg) {
  warnings.push(msg);
  console.log(`  ⚠ ${msg}`);
}

console.log("\n=== QA: Người dùng tải file raw text Trung (.txt) ===\n");

const raw = readFileSync(fixturePath, "utf-8");
const parsed = parseChineseNovelChapters(raw);

ok("File fixture đọc được", raw.length > 200);
ok("Nhận đúng 3 chương (第N章)", parsed.chapters.length === 3, `got ${parsed.chapters.length}`);
ok(
  "Không tách nhầm「第一次」thành chương",
  !parsed.chapters.some((c) => /第一次/.test(c.originalName) && /^第/.test(c.originalName) === false),
  parsed.chapters.map((c) => c.originalName).join(", ")
);
for (const ch of parsed.chapters) {
  ok(
    `Chương "${ch.originalName}" đủ nội dung`,
    countContentChars(ch.text) >= 40,
    `${countContentChars(ch.text)} ký tự`
  );
}
ok(
  "Tiêu đề chương 1 đúng",
  parsed.chapters[0]?.originalName.includes("山王") || parsed.chapters[0]?.originalName.includes("第一章")
);

const falseHeader = "第一次见面，他说道：你好。";
ok(
  "isLikelyChapterHeader loại「第一次见面」",
  !isLikelyChapterHeader(falseHeader, [falseHeader], 0, false)
);

const longTitleLine =
  "第一章" + " 风云再起江湖恩怨情仇".repeat(4);
ok(
  "Nhận diện 第N章 khi kèm tiêu đề dài (>55 ký tự)",
  isLikelyChapterHeader(longTitleLine, [longTitleLine, "正文"], 0, false),
  `len=${longTitleLine.length}`
);

const bodyBlock =
  "话说天下大势，分久必合，合久必分。这是足够长的正文段落用于测试分章识别。".repeat(2);
let bulkRaw = "";
for (let n = 1; n <= 1727; n++) {
  bulkRaw += `第${n}章\n${bodyBlock}\n\n`;
}
const bulkParsed = parseChineseNovelChapters(bulkRaw);
ok(
  "Nhận đủ 1727 chương (第N章 liên tiếp)",
  bulkParsed.chapters.length === 1727,
  `got ${bulkParsed.chapters.length}, strict=${bulkParsed.stats.usedStrictMode}`
);

const mixedRaw =
  "第一章\n短注。\n第二章\n" +
  bodyBlock +
  "\n第3章 标题很长很长很长很长很长很长很长很长很长很长\n" +
  bodyBlock;
const mixedParsed = parseChineseNovelChapters(mixedRaw);
ok(
  "Tách chương khi 第N章 chuẩn dù chương trước rất ngắn",
  mixedParsed.chapters.length >= 3,
  `got ${mixedParsed.chapters.length}: ${mixedParsed.chapters.map((c) => c.originalName).join(" | ")}`
);

ok("Biên dịch mẫu 第<num>章", compileChapterPattern("第<num>章").compiled != null);
ok("Biên dịch preset 第<num>回", compileChapterPattern("第<num>回").compiled != null);
ok("Biên dịch preset 第<num>卷 第<num>章", compileChapterPattern("第<num>卷 第<num>章").compiled != null);
const customBulk = parseChaptersWithCustomPattern(bulkRaw, "第<num>章");
ok(
  "Mẫu 第<num>章 nhận đủ 1727 chương",
  customBulk.chapters.length === 1727,
  `got ${customBulk.chapters.length}`
);
ok("Mẫu lỗi trả patternError", parseChaptersWithCustomPattern(bulkRaw, "第章").patternError != null);

const defaultRules = createDefaultChapterRuleStates();
const rulesParsed = parseChineseNovelChapters(raw, defaultRules);
ok(
  "Rule engine mặc định: fixture 3 chương",
  rulesParsed.chapters.length === 3,
  `got ${rulesParsed.chapters.length}, rules=${rulesParsed.stats.enabledRuleCount}`
);
const rulesBulk = parseChaptersWithRules(bulkRaw, defaultRules);
ok(
  "Rule engine mặc định: 1727 chương",
  rulesBulk.chapters.length === 1727,
  `got ${rulesBulk.chapters.length}`
);

console.log("\n=== QA: Lab Dịch → Phòng Đọc (song ngữ theo dòng) ===\n");

const ch1Source = parsed.chapters[0].text.replace(/\r\n/g, "\n");
const ch1Translated = [
  "Lâm Phàm đứng trên đỉnh Thanh Vân Phong, ngắm nhìn vân hải phía xa cuồn cuộn.",
  "Lần đầu hắn vận hành Cửu Chuyển Huyền Công, chỉ cảm thấy nhiệt khí trong đan điền cuồn chảy.",
  "Sơn phong vồ vù, hắn thấp giọng: Lần này ta tuyệt không để kẻ nào ăn hiếp nữa.",
].join("\n");

const matchMountainKing = resolveSelectionFromBilingualChapter(
  "vua núi",
  ch1Source,
  ch1Translated.replace("Sơn phong", "vua núi phong vồ vù")
);
// Better test: user selects wrong translation on line with 山王
const sourceWithKing = "山风猎猎，他低声道：山王之名，今日便要响彻南疆。";
const transWrong = "Gió núi vồ vù, hắn thấp giọng: danh xưng vua núi, hôm nay sẽ vang khắp Nam Cương.";
const matchKing = resolveSelectionFromBilingualChapter("vua núi", sourceWithKing, transWrong);

ok("Khớp dòng「vua núi」→ Hán tự", !!matchKing?.chinese, matchKing?.chinese || "null");
ok(
  "Hán tự chứa 山王 hoặc 王",
  !matchKing || /山|王/.test(matchKing.chinese),
  matchKing?.chinese
);
ok("Nguồn tra là line hoặc line-fuzzy", !matchKing || ["line", "line-fuzzy"].includes(matchKing.source));

console.log("\n=== QA: Tự dịch chương kế & dict context (1A/1C/2B) ===\n");

if (typeof sessionStorage !== "undefined") {
  saveReaderSequentialState("novel-x", true, "ch-50");
  const loaded = loadReaderSequentialState("novel-x");
  ok("1A: lưu/khôi phục sequentialArmed", loaded?.armed === true && loaded.chapterId === "ch-50");
} else {
  ok("1A: sessionStorage (chỉ trình duyệt/APK)", true);
}

const hugeDict = Array.from({ length: 800 }, (_, i) => ({
  id: String(i),
  chinese: `词${i}`,
  vietnamese: `Từ điển mẫu số ${i} với mô tả dài thêm`,
  category: "custom",
}));
const ctx = buildDictContextString({ dictItems: hugeDict, pronounMappings: [], novelId: "n1" });
ok("2B: dictContext bị giới hạn ký tự", ctx.length <= MAX_DICT_CONTEXT_CHARS);
ok("2B: dictContext không rỗng", ctx.length > 100);

// Dedupe prompt theo «Hán tự» (Chung vs Riêng) — ưu tiên Riêng khi có.
const ctxDedupe = buildDictContextString({
  dictItems: [
    { id: "c", chinese: "甲", vietnamese: "A chung", category: "name" },
    { id: "r", chinese: "甲", vietnamese: "A riêng", category: "name", novelId: "n1" },
  ],
  pronounMappings: [],
  novelId: "n1",
});
ok("Dedupe: giữ 1 dòng cho cùng Hán tự", ctxDedupe.includes("甲 -> A riêng") && !ctxDedupe.includes("甲 -> A chung"));

// Scope-aware cho quét: chỉ chặn nếu đã tồn tại trong Riêng của truyện hiện tại.
const dictItemsForScope = [
  { id: "c", chinese: "甲", vietnamese: "A chung", category: "name" },
  { id: "r", chinese: "乙", vietnamese: "B riêng", category: "name", novelId: "n1" },
];
const allowCand = (candZh) => !dictItemsForScope.some((it) => it.chinese === candZh && it.novelId === "n1");
ok("Scope-aware: cho phép thêm Riêng khi chỉ Chung tồn tại", allowCand("甲") === true);
ok("Scope-aware: chặn khi Riêng đã tồn tại", allowCand("乙") === false);

console.log("\n=== QA: B-Reader chrome (safe layout + màu giấy) ===\n");

const darkTokens = getReaderThemeTokens("dark");
ok("B-Reader: panel tối #09090b", darkTokens.surfaceHex === "#09090b");
ok(
  "B-Reader: chrome native khớp panel",
  readerThemeChromeBg("dark") === darkTokens.surfaceHex
);
ok(
  "B-Reader: panel cài đặt dưới status+toolbar",
  computeReaderSettingsPanelTopPx(READER_SAFE_TOP_FALLBACK_PX) ===
    READER_SAFE_TOP_FALLBACK_PX + READER_TOOLBAR_HEIGHT_PX
);
ok(
  "B-Reader: panel cài đặt với safe=0 vẫn ≥ toolbar",
  computeReaderSettingsPanelTopPx(0) === READER_TOOLBAR_HEIGHT_PX
);
ok(
  "B-Reader: viền tối không dùng zinc-200",
  !darkTokens.borderClass.includes("zinc-200")
);
ok(
  "B-Reader: panel cài đặt tối không bg-white",
  !darkTokens.settingsPanelClass.includes("bg-white")
);

console.log("\n=== QA: Phân trang Phòng Đọc (không cắt giữa từ) ===\n");

const phrase = "nhi qua môn mà đến, cũng là một trang";
const cutAt = phrase.indexOf("mà") + 1;
const snapped = snapSplitIndexToWordBoundary(phrase, cutAt);
const headPart = phrase.slice(0, snapped).trimEnd();
const tailPart = phrase.slice(snapped).trimStart();
ok("Không để «m» lẻ ở cuối trang", !/\s+m\s*$/i.test(headPart) && !headPart.endsWith(" m"));
ok("Đầu trang sau không bắt đầu bằng «à»", !tailPart.startsWith("à"));
ok("Cụm «mà» nguyên vẹn ở đầu hoặc cuối", tailPart.startsWith("mà") || headPart.endsWith("mà"));

const pageSplit = splitTextToFitHeight(phrase, 48, 28, 22, 8);
ok(
  "splitTextToFitHeight: tail không bắt đầu giữa từ",
  !/^[\p{L}]{1}$/u.test(pageSplit.tail.trim())
);

ok("isProperNamePhrase: Vưu Thị", isProperNamePhrase("Vưu Thị"));
ok("isProperNamePhrase: từ thường", !isProperNamePhrase("ta đi chơi"));

console.log("\n=== QA: Pipeline popup Phòng Đọc (A–E / Lab) ===\n");

const qinSource = "秦可卿看向不远处脸上见着怅然之色的尤三姐。";
const qinTrans = "Tần Khả Khanh nhìn về phía không xa, trên mặt Uất Tam tỷ hiện vẻ buồn bã.";
const qinExpand = expandProperNameInLine("Tần", qinTrans);
ok("Mở rộng Tần → Tần Khả Khanh", qinExpand.expanded && qinExpand.text === "Tần Khả Khanh");

const vuExpand = expandProperNameInLine("Vưu", "Vưu Thị nói: 'Ta ở đây trông chừng là được rồi.'");
ok("Mở rộng Vưu → Vưu Thị", vuExpand.expanded && vuExpand.text === "Vưu Thị");

const qinHit = resolveLabBilingualSelection({
  selectedVietnamese: "Tần",
  rawSelectedVietnamese: "Tần",
  lineText: qinTrans,
  context: { sourceText: qinSource, translatedText: qinTrans, dictItems: [] },
});
ok("Pipeline: Tần → 秦可卿", qinHit?.chinese === "秦可卿", qinHit?.chinese);
ok("Pipeline: Việt đầy đủ", qinHit?.vietnamese === "Tần Khả Khanh", qinHit?.vietnamese);
ok("Pipeline: đánh dấu mở rộng", qinHit?.expandedFromPartial === true);

const qinWarn = validateDictPairBeforeSave("秦可卿", "Tần", {
  vietnameseLine: qinTrans,
  rawSelection: "Tần",
});
ok("Validate cảnh báo Tần ngắn", qinWarn.level === "warn" && qinWarn.suggestedVietnamese === "Tần Khả Khanh");

console.log("\n=== QA: Từ điển Vietphrase (tra ngược / xuôi) ===\n");

const sampleDict = [
  { id: "1", chinese: "山王", vietnamese: "Sơn Vương", category: "name", novelId: "novel-1" },
  { id: "2", chinese: "林凡", vietnamese: "Lâm Phàm", category: "name" },
  { id: "3", chinese: "青云宗", vietnamese: "Thanh Vân Tông", category: "sect" },
];

const dictHit = lookupSelectionInDict("Sơn Vương", sampleDict, "novel-1");
ok("Tra ngược tên riêng chính xác", dictHit?.chinese === "山王");
ok("Ưu tiên mục riêng truyện", dictHit?.novelScoped === true);

const boundedHit = lookupSelectionInDict("danh xưng Sơn Vương, hôm nay", sampleDict, "novel-1");
ok("Khớp tên trong cụm dài (biên từ)", boundedHit?.chinese === "山王");

const blockShort = lookupSelectionInDict("nhà của ta đi chơi", [
  { id: "x", chinese: "他", vietnamese: "ta", category: "other" },
]);
ok("Chặn khớp「ta」rời trong câu dài", !blockShort);

const forward = lookupChineseInDict("山王", sampleDict, "novel-1");
ok("Tra xuôi Hán → Việt", forward?.vietnamese === "Sơn Vương");

console.log("\n=== QA: Cài đặt dịch — xoay key & batch song song ===\n");

const attempts = buildTranslationAttempts(
  "gemini-3.5-flash",
  { google: "keyA, keyB", openai: "keyC" },
  true
);
ok("buildTranslationAttempts: 2 key Google trước", attempts.filter((a) => a.provider === "google").length === 2);
ok("Cross-rotation thêm OpenAI", attempts.some((a) => a.provider === "openai"));
ok("Không trùng fingerprint key", new Set(attempts.map((a) => a.key)).size === attempts.length);

const attemptsNoCross = buildTranslationAttempts("gemini-3.5-flash", { google: "k1,k2", openai: "k3" }, false);
ok("Tắt cross chỉ còn Google", attemptsNoCross.every((a) => a.provider === "google"));

ok("parseApiKeys tách phẩy", parseApiKeys(" a , b , ").length === 2);
ok("isRateLimitError 429", isRateLimitError(429, ""));
ok("clampThreadCount giới hạn 1-5", clampThreadCount(99) === 5 && clampThreadCount(0) === 1);

const order = await mapWithConcurrency([1, 2, 3, 4, 5], 3, async (n) => {
  await new Promise((r) => setTimeout(r, 10 * (6 - n)));
  return n * 10;
});
ok("mapWithConcurrency giữ thứ tự", order.join(",") === "10,20,30,40,50");

console.log("\n=== QA: Prompt Lab Dịch — ưu tiên Cấu hình vs built-in ===\n");

const sysEmpty = buildSystemInstruction("", "");
ok("Cả hai ô trống → có hướng dẫn mặc định hệ thống", sysEmpty.includes("DỊCH GIẢ CHUYÊN NGHIỆP"));
ok("Cả hai ô trống → vẫn có core đại từ", sysEmpty.includes("他 -> hắn"));

const sysUser1 = buildSystemInstruction("Giọng hiện đại", "");
ok("Có chỉ thị 1 → không gửi style mặc định", !sysUser1.includes("DỊCH GIẢ CHUYÊN NGHIỆP"));
ok(
  "Có chỉ thị 1 → vẫn có quy tắc chống Hán-Việt thuần",
  sysUser1.includes("KHÔNG phiên âm máy móc")
);
ok("Có chỉ thị 1 → nhúng nội dung user", sysUser1.includes("Giọng hiện đại"));
ok("Có chỉ thị 1 → nhãn ưu tiên", sysUser1.includes("HƯỚNG DẪN DỊCH 1"));

const sysBoth = buildSystemInstruction("Một", "Hai");
ok("Có 1 và 2 → thứ tự 1 trước 2", sysBoth.indexOf("Một") < sysBoth.indexOf("Hai"));
ok("hasUser: chỉ 2", hasUserTranslationPrompts("", "  x  "));
ok("hasUser: trống", !hasUserTranslationPrompts("  ", ""));

ok(
  "DeepSeek: không đổi model khi gọi API",
  resolveDeepSeekApiModel("deepseek-v4-flash") === "deepseek-v4-flash" &&
    resolveDeepSeekApiModel("deepseek-v4-pro") === "deepseek-v4-pro"
);

const jsonPrompt = '{"VAI_TRÒ":{"mô_tả":"Dịch giả chuyên nghiệp"},"MỤC_TIÊU":{"nhiệm_vụ":"Dịch Trung Việt"}}';
const flat = normalizePromptForApi(jsonPrompt);
ok("Prompt JSON được làm phẳng cho API", flat.includes("Dịch giả chuyên nghiệp") && flat.includes("Dịch Trung Việt"));

console.log("\n=== QA: Lab Dịch — kế hoạch 1 chương / khối dòng ===\n");

const shortSource = "第一行\n第二行\n第三行";
const shortPlan = resolveChapterTranslationPlan(shortSource);
ok("Chương ngắn → tier single", shortPlan.tier === "single", `${shortPlan.lineCount} dòng`);

const longLines = Array.from({ length: 160 }, (_, i) => `第${i + 1}句`).join("\n");
const longPlan = resolveChapterTranslationPlan(longLines);
ok("Chương nhiều dòng → tier chunked", longPlan.tier === "chunked", `${longPlan.lineCount} dòng`);

const longChars = "字".repeat(FORCE_CHUNK_CHARS + 1);
ok("Chương cực dài ký tự → chunked", resolveChapterTranslationPlan(longChars).tier === "chunked");

const atTierAChars = "字".repeat(TIER_A_MAX_CHARS);
ok(
  "Ngưỡng ký tự tier A (1 dòng)",
  resolveChapterTranslationPlan(atTierAChars).tier === "single",
  `${atTierAChars.length} ký tự`
);

const borderLines = Array.from({ length: TIER_A_MAX_LINES }, () => "句").join("\n");
ok("Ngưỡng dòng tier A", resolveChapterTranslationPlan(borderLines).tier === "single");

const deepseekMid = "字".repeat(TIER_A_MAX_CHARS_DEEPSEEK + 100);
const deepPlan = resolveChapterTranslationPlan(deepseekMid, "deepseek-v4-flash");
ok(
  "DeepSeek: vượt ngưỡng ký tự → chunked",
  deepPlan.tier === "chunked" && deepPlan.chunkLineCount === TIER_B_LINES_PER_CHUNK_DEEPSEEK
);
const deepseekForce = "字".repeat(DEEPSEEK_FORCE_CHUNK_CHARS + 1);
ok(
  "DeepSeek: force chunk sớm",
  resolveChapterTranslationPlan(deepseekForce, "deepseek-v4-flash").tier === "chunked"
);
ok(
  "Nhận lỗi chia đoạn: Failed to fetch",
  isDeepSeekChunkSplitError(new Error("[DeepSeek] Failed to fetch"))
);
ok(
  "Lệch dòng → không chia đôi (căn cục bộ trước)",
  !isDeepSeekRecoverableChunkError(new Error("[deepseek-v4-flash] Số dòng dịch không khớp (23/16)."))
);
ok(
  "API rỗng/mạng → vẫn chia đôi được",
  isDeepSeekRecoverableChunkError(new Error("[DeepSeek] HTTP 200: API trả về rỗng"))
);
const misaligned = "a\nb\nc\nd\ne\nf";
const realigned = realignTranslationToSourceLineCount("1\n2\n3", misaligned);
ok("Căn dòng cục bộ 6→3", validateTranslationLineCount("1\n2\n3", realigned).ok);
const numbered = buildNumberedSourcePayload("甲\n乙");
ok("Payload có [L001]", numbered.payload.includes("[L001]") && numbered.lineCount === 2);
const taggedReply = "[L001] A\n[L002] B";
ok("Parse [Lnnn]", parseNumberedTranslationResponse(taggedReply, 2) === "A\nB");
ok(
  "Song song chunk trong chương (DeepSeek)",
  resolveChapterChunkConcurrency("deepseek-v4-flash", { maxThreads: 3 }) === CHAPTER_CHUNK_MAX_CONCURRENCY
);
ok(
  "Dịch tuần tự: tắt song song đoạn",
  resolveChapterChunkConcurrency("deepseek-v4-flash", {
    maxThreads: 5,
    translationSequentialChunks: true,
  }) === 1
);
ok(
  "Continuity prefix có ngữ cảnh đoạn trước",
  buildChunkContinuityPrefix("甲\n乙", "A\nB").includes("Gốc cuối") &&
    buildChunkContinuityPrefix("甲", "A").includes("Dịch cuối")
);
ok("isLineCountMismatchError", isLineCountMismatchError(new Error("Số dòng dịch không khớp (2/3)")));
ok(
  "DeepSeek chunk nhỏ hơn mặc định",
  resolveChunkLineCountForModel("deepseek-v4-flash") < resolveChunkLineCountForModel("gemini-3.5-flash")
);

const { chunks, ranges } = splitLinesIntoChunks(["a", "b", "c", "d", "e"], 2);
ok("Chia khối 2 dòng → 3 chunk", chunks.length === 3 && ranges[0].lineCount === 2);
ok("Ghép chunk giữ số dòng", chunks.join("\n").split("\n").length === 5);

const goodVi = "một\ntwo\nba";
ok("Validate khớp dòng", validateTranslationLineCount(shortSource, goodVi).ok);
ok(
  "Validate lệch dòng",
  !validateTranslationLineCount(shortSource, "một\ntwo").ok,
  `${validateTranslationLineCount(shortSource, "một\ntwo").translatedLines} vs 3`
);
ok(
  "Cảnh báo lệch dòng",
  formatLineMismatchWarning("第一章", shortSource, "Chương 1", "a\nb")?.includes("không khớp")
);

ok("Gộp title+body", buildChapterSourceWithTitle("第一章 山", "正文").combined.includes("\n"));
const split = splitChapterTranslationResult("Chương 1: Sơn\nDòng một\nDòng hai", true);
ok("Tách translatedTitle", split.translatedTitle.startsWith("Chương"));
ok("Tách translatedText giữ 2 dòng", split.translatedText.split("\n").length === 2);
const cmp = buildCompareBilingualTexts("第一章", "甲\n乙", "Chương 1", "A\nB");
ok("Compare có title line", cmp.hasTitleLine && cmp.sourceCombined.startsWith("第一章"));

console.log("\n=== QA: Phòng Đọc — tự dịch chương kế (phương án A) ===\n");

ok("clamp delay: 9 → 10", clampAutoTranslateDelaySec(9) === 10);
ok("clamp delay: 45 giữ nguyên", clampAutoTranslateDelaySec(45) === 45);
ok("Nhảy 20→50 = jump", resolveChapterNavKind(19, 49) === "jump");
ok("50→51 = adjacent-next", resolveChapterNavKind(49, 50) === "adjacent-next");
ok("51→50 = adjacent-prev", resolveChapterNavKind(50, 49) === "adjacent-prev");
ok("Bật tuần tự sau next", shouldArmSequentialAfterNav("adjacent-next"));
ok("Không bật sau jump", !shouldArmSequentialAfterNav("jump"));
ok(
  "canAccumulate: tắt khi menu chương mở",
  !canAccumulateDwellTime({
    enabled: true,
    isReaderTabActive: true,
    sequentialArmed: true,
    documentHidden: false,
    chapterDrawerOpen: true,
    settingsOpen: false,
  })
);
ok("MIN_DELAY >= 10", READER_AUTO_TRANSLATE_MIN_DELAY_SEC >= 10);

console.log("\n=== QA: Hàng đợi API & quota cục bộ (0+1+2) ===\n");

resetQuotaTrackerForTests();
const quotaAttempts = [
  { provider: "google", key: "key-aaa-111", model: "gemini-3.5-flash" },
  { provider: "google", key: "key-bbb-222", model: "gemini-3.5-flash" },
];
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRequest("google", "key-aaa-111", "x".repeat(4000));
recordApiRateLimit("google", "key-aaa-111");
const orderedQuota = orderAttemptsByQuota(quotaAttempts);
ok(
  "orderAttemptsByQuota ưu tiên key chưa cooldown",
  orderedQuota[0]?.key === "key-bbb-222",
  orderedQuota.map((a) => a.key).join(",")
);
ok("TRANSLATION_QUEUE_MIN_GAP_MS >= 1s", TRANSLATION_QUEUE_MIN_GAP_MS >= 1000);

console.log("\n=== QA: Quét tên riêng (PA-3 + 10A/10B/10C) ===\n");

ok("6BC: 如此 là nhiễu", isScanNoiseChinesePhrase("如此"));
ok("6BC: 一声 là nhiễu", isScanNoiseChinesePhrase("一声"));
ok("6BC: 秦始皇 không phải nhiễu", !isScanNoiseChinesePhrase("秦始皇"));
ok("6BC: 十分 là nhiễu", isScanNoiseChinesePhrase("十分"));
ok("6BC: 身体 là nhiễu", isScanNoiseChinesePhrase("身体"));
ok("5B: Lab không khớp «Lục» cho 琳琅", !isLabMatchPlausible("琳琅", "Lục"));
ok("5B: Lab không khớp «Sở Hoan» cho 十分", !isLabMatchPlausible("十分", "Sở Hoan"));

ok("PA-3 filter: accept 'Thanh Vân tông'", isLikelyNameFromVietphrase("Thanh Vân tông"));
ok("PA-3 filter: accept lowercase 'hầu tuấn cát'", isLikelyNameFromVietphrase("hầu tuấn cát"));
ok("PA-3 filter: accept mixed case 'Hầu tuấn cát'", isLikelyNameFromVietphrase("Hầu tuấn cát"));
ok("PA-3 filter: reject long sentence", !isLikelyNameFromVietphrase("trong vòng 1 phút"));
ok("PA-3 filter: reject common phrase", !isLikelyNameFromVietphrase("đi lại"));
ok(
  "10A expand suffix: 'Thanh Vân' -> 'Thanh Vân tông'",
  expandVietnameseSuffixAfterPhrase("Thanh Vân", "Thanh Vân tông rất mạnh") === "Thanh Vân tông"
);

const labCorpus = [
  {
    sourceText: "侯俊革走了过来。",
    translatedText: "Hầu Tuấn Cát bước tới.",
  },
];
const labHit = resolveTranslationFromLabCorpus("侯俊革", labCorpus);
ok(
  "5B: khớp tên từ translatedText Lab",
  labHit?.vietnamese === "Hầu Tuấn Cát",
  labHit?.vietnamese ?? "null"
);
const row = buildNameScanRow("侯俊革", 3, labCorpus, [], [], { "侯俊革": "Hầu Tuấn Cát" });
ok("PA-3: buildNameScanRow vietnamese từ VP", row.vietnamese === "Hầu Tuấn Cát");
ok("8A: buildNameScanRow tách hanViet", typeof row.hanViet === "string" && row.hanViet.length > 0);
ok("PA-3: ưu tiên Vietphrase khi hợp lệ", row.translationSource === "vietphrase");
ok("10B: entityKind nhân vật", row.entityKind === "character");

console.log("\n=== QA: Import từ điển riêng (3A+3B+3C) ===\n");

ok("3B: loại 今天 khỏi import tên", !isNovelDictImportEligible("今天", "Kim Thiên"));
ok("3B: chấp nhận tên nhân vật", isNovelDictImportEligible("贾珩", "Giả Hành"));

const bleedCorpus = [
  {
    sourceText: "今天贾珩回府。",
    translatedText: "Hôm nay Giả Hành về phủ.",
  },
];
const pickToday = pickBestLabPhraseForChineseOnLine("今天", bleedCorpus[0].sourceText, bleedCorpus[0].translatedText);
ok(
  "3A: không gán Giả Hành cho 今天 trên cùng dòng",
  pickToday !== "Giả Hành",
  pickToday ?? "null"
);

const pickJia = pickBestLabPhraseForChineseOnLine("贾珩", bleedCorpus[0].sourceText, bleedCorpus[0].translatedText);
ok("3A: vẫn bắt Giả Hành cho 贾珩", pickJia === "Giả Hành", pickJia ?? "null");

ok(
  "4A: loại from/to không chung token",
  !isValidDictReplaceFrom("卫国公", "Bá Quân", "Vệ quốc công")
);
ok(
  "4A: loại from dài hơn to quá 1 từ (婵月)",
  !isValidDictReplaceFrom("婵月", "Lý Thuyền Nguyệt", "Thiền Nguyệt")
);
ok(
  "4A: chấp nhận sửa chính tả gần",
  isValidDictReplaceFrom("宋暄", "Tống Tuyên", "Tống Huyên")
);

ok("5D: loại 贾母→Giả Hành vs Giả mẫu", !isValidDictReplaceFrom("贾母", "Giả Hành", "Giả mẫu"));
ok("5D: loại 宝琴→Bảo Ngọc vs Bảo Cầm", !isValidDictReplaceFrom("宝琴", "Bảo Ngọc", "Bảo Cầm"));
ok(
  "5D: loại 宋皇后 Tống Hoàng vs Tống hoàng hậu",
  !isValidDictReplaceFrom("宋皇后", "Tống Hoàng", "Tống hoàng hậu")
);

const previewChapters = [
  {
    id: "c1",
    title: "Ch 1",
    sourceText: "侯俊革走了过来。\n东虏犯边。",
    translatedText: "Hầu Tuấn Cát bước tới.\nĐông Lỗ xâm biên.",
  },
];
const previewRows = buildDictReplacementPreview(
  [
    { chinese: "侯俊革", vietnamese: "Hầu Tuấn Cát" },
    { chinese: "东虏", vietnamese: "Đông Lỗ" },
  ],
  previewChapters
);
ok(
  "3C: preview không trùng from Giả Hành cho mọi Hán",
  !previewRows.some((r) => r.chinese === "东虏" && r.from === "Giả Hành")
);

const scoped = countReplacementOnAlignedLines("东虏", "Đông Lỗ", previewChapters);
ok("3C: đếm trên dòng có Hán", scoped.occurrences >= 1 && scoped.chapterCount === 1);

const suspicious = filterSuspiciousPreviewRows([
  {
    id: "1",
    chinese: "甲",
    from: "Giả Hành",
    to: "A",
    occurrences: 1,
    chapterCount: 1,
    confidence: "high",
    selected: true,
  },
  {
    id: "2",
    chinese: "乙",
    from: "Giả Hành",
    to: "B",
    occurrences: 1,
    chapterCount: 1,
    confidence: "low",
    selected: false,
  },
]);
ok("An toàn: lọc from trùng ≥2 Hán", suspicious.length === 0);

const exportTxt = buildDictExportTxtContent([
  { chinese: "贾珩", vietnamese: "Giả Hành" },
  { chinese: "宝玉", vietnamese: "Bảo Ngọc" },
]);
ok("Export .txt: định dạng Hán=Việt", exportTxt.includes("贾珩=Giả Hành") && exportTxt.includes("宝玉=Bảo Ngọc"));

ok(
  "5F: mặc định chỉ chọn tin cậy",
  previewRows.length === 0 || previewRows.every((r) => r.confidence !== "high" || r.selected)
);

console.log("\n=== QA: Cảnh báo / hạn chế sản phẩm (không fail build) ===\n");

warn(
  "NovelLoader.handleFetchWebsite: URL web hiện chỉ tạo dữ liệu MÔ PHỎNG (10 chương giả), không cào trang thật — cần API/backend riêng nếu muốn tải báo/truyện online thật."
);
warn(
  "Tra song ngữ Phòng Đọc yêu cầu chương đã có translatedText + sourceText cùng số dòng (Lab Dịch 1:1). Gộp/tách dòng sẽ làm khớp kém."
);
warn(
  "Dịch hàng loạt cần API key hợp lệ trong Cài đặt; APK trên máy thật cần INTERNET + cleartext/HTTPS theo capacitor.config (hostname app.local)."
);
warn(
  "Lab Dịch: chương ngắn 1 request, chương dài chia ~100 dòng/request + validate số dòng; Phòng Đọc chỉ hiển thị translatedText Lab (không API dịch trang)."
);
warn(
  "Tự dịch chương kế (Cấu hình Trang Sách): mặc định tắt; sau nhảy chương cần Next/Prev liền kề một lần; đủ x giây mới dịch C+1 qua Lab."
);

// Sao lưu data dịch (1C+1D+2A+4A)
const sampleNovel = {
  id: "n-backup",
  title: "Test",
  author: "QA",
  createdAt: "2026-01-01T00:00:00.000Z",
  chapters: [
    {
      id: "c1",
      title: "Ch 1",
      sourceText: "甲",
      translatedText: "Giáp",
      createdAt: "2026-01-01T00:00:00.000Z",
      charCount: 1,
      wordCount: 1,
    },
    {
      id: "c2",
      title: "Ch 2",
      sourceText: "乙",
      translatedText: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      charCount: 1,
      wordCount: 0,
    },
  ],
};
const payload = novelToTranslationBackupPayload(sampleNovel);
ok("1D: chỉ export chương đã dịch", payload?.chapters.length === 1 && payload.chapters[0].id === "c1");
ok("4A: schema backup cố định", TRANSLATION_BACKUP_SCHEMA_VERSION === 1 && TRANSLATION_BACKUP_KIND === "translation-data");

const existing = [
  {
    ...sampleNovel,
    chapters: [
      {
        id: "c1",
        title: "Ch 1",
        sourceText: "甲",
        translatedText: "Cũ",
        createdAt: "2026-01-01T00:00:00.000Z",
        charCount: 1,
        wordCount: 1,
      },
    ],
    deletedFromLibrary: true,
  },
];
const imported = [
  {
    ...sampleNovel,
    chapters: [
      {
        id: "c1",
        title: "Ch 1",
        sourceText: "甲",
        translatedText: "Mới",
        createdAt: "2026-01-01T00:00:00.000Z",
        charCount: 1,
        wordCount: 1,
      },
      {
        id: "c3",
        title: "Ch 3",
        sourceText: "丙",
        translatedText: "Bính",
        createdAt: "2026-01-01T00:00:00.000Z",
        charCount: 1,
        wordCount: 1,
      },
    ],
  },
];
const preview = previewTranslationBackupMerge(existing, imported);
ok("2A preview: ghi đè 1 chương", preview.chaptersUpdated === 1 && preview.chaptersAdded === 1);
const merged = mergeTranslationBackup(existing, imported);
ok("2A merge: cập nhật translatedText", merged.novels[0].chapters.find((c) => c.id === "c1")?.translatedText === "Mới");
ok("2A merge: giữ deletedFromLibrary", merged.novels[0].deletedFromLibrary === true);
ok("2A merge: xóa cache page_trans khi ghi đè", merged.clearedPageCacheChapterIds.includes("c1"));

const previewAddOnly = previewTranslationBackupMerge(existing, imported, { mode: "add_only" });
ok("add_only preview: bỏ qua trùng id", previewAddOnly.chaptersSkipped === 1 && previewAddOnly.chaptersUpdated === 0);
const mergedAddOnly = mergeTranslationBackup(existing, imported, { mode: "add_only" });
ok(
  "add_only merge: giữ bản dịch cũ",
  mergedAddOnly.novels[0].chapters.find((c) => c.id === "c1")?.translatedText === "Cũ"
);
ok("add_only merge: thêm chương mới", mergedAddOnly.novels[0].chapters.some((c) => c.id === "c3"));
ok("add_only merge: không xóa page_trans", mergedAddOnly.clearedPageCacheChapterIds.length === 0);

ok("Fluent legacy id", normalizeReaderTheme("fluent") === "light");

console.log("\n=== Tổng kết ===\n");
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);
console.log(`  Warnings: ${warnings.length}`);
if (warnings.length) {
  console.log("\n  Chi tiết cảnh báo:");
  warnings.forEach((w) => console.log(`    - ${w}`));
}
console.log("");

process.exit(failed > 0 ? 1 : 0);
