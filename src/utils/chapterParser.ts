/**
 * Phân tích chương/hồi tiểu thuyết Trung (web novel) từ file .txt thô.
 * Ưu tiên định dạng phổ biến: 第N章, 第N节, 第N回; loại bỏ nhận diện nhầm trong lời thoại/danh sách.
 * Có thêm parseChaptersWithCustomPattern() theo mẫu người dùng (第<num>章, …).
 */

import { compileChapterPattern, isCustomChapterHeader } from "./chapterPattern.ts";
import {
  mergeChapterRuleStates,
  parseChaptersWithRules,
  type ChapterRuleState,
} from "./chapterRulesEngine";

export interface ParsedChapterDraft {
  originalName: string;
  text: string;
}

export interface ChapterParseStats {
  totalDetected: number;
  emptyBeforeCleanup: number;
  emptyAfterCleanup: number;
  usedStrictMode: boolean;
  usedCustomPattern?: boolean;
  customPattern?: string;
  /** Tách bằng bộ quy tắc regex bật/tắt */
  usedRuleEngine?: boolean;
  enabledRuleCount?: number;
}

export interface ChapterParseResult {
  chapters: ParsedChapterDraft[];
  stats: ChapterParseStats;
}

const CN_DIGIT = "0-9０-９一二三四五六七八九十百千万零两〇壹贰叁肆伍陆柒捌玖拾佰仟";
const MEASURE = "章节回卷集部幕折篇";

/** Nội dung tối thiểu (ký tự không khoảng trắng) — chỉ áp dụng khi gộp tiêu đề nghi ngờ (không phải 第N章 chuẩn) */
const MIN_CHAPTER_CONTENT_CHARS = 40;

const MAX_MEDIUM_HEADER_LEN = 55;
/** Tiêu đề 第N章 + tên chương dài trên cùng một dòng */
const MAX_STRICT_HEADER_LEN = 160;

const NARRATIVE_EXCLUDE =
  /(?:说道|问道|笑道|冷笑道|沉声道|心想|暗想|嘀咕|赞道|喝道|失声|不由|忍不住|只见|此时|忽然|已经|缓缓|微微)/;

/** Không phải tiêu đề chương: 第一次, 第一天, 第一层… (không gồm 回/幕/集 — đó là lượng từ chương hợp lệ) */
const FALSE_CHAPTER_PREFIX =
  new RegExp(
    `^第[${CN_DIGIT}]{0,6}(?:次|天|年|招|式|关|层|步|场|句|声|刀|拳|指|遍|趟|轮|波|击|段|种|件|条|项|名|位|个|只|把)`,
    "u"
  );

const SPECIAL_EPISODE =
  /^(?:楔子|序章|序言|序|引子|引|前言|后记|尾声|番外篇|番外|终章|大结局|完本感言|完本后记|写在最后|附章|外传|支线|彩蛋|番外小剧场|终章番外)(?:[\s　：:.\-—–—].{0,30})?$/u;

/** Định dạng chuẩn web novel — độ tin cậy cao */
const STRICT_HEADER = [
  new RegExp(
    `^第\\s*[${CN_DIGIT}]{1,12}\\s*[${MEASURE}]\\s*([：:．.\\-—–—\\s　].*)?$`,
    "u"
  ),
  new RegExp(
    `^[【\\[（(]\\s*第\\s*[${CN_DIGIT}]{1,12}\\s*[${MEASURE}]\\s*[^\\]】）)】]{0,80}[】\\]）)】]?\\s*$`,
    "u"
  ),
  new RegExp(
    `^第?\\s*[${CN_DIGIT}]{1,8}\\s*卷\\s*第?\\s*[${CN_DIGIT}]{1,12}\\s*[${MEASURE}]`,
    "u"
  ),
  /^(?:Chapter|CHAPTER|Chap\.?|Vol\.?|Volume)\s*[\d０-９]{1,5}(?:\s*[:：.\-—–—]?\s*.{0,80})?$/i,
  SPECIAL_EPISODE,
];

/** Định dạng phụ — chỉ chấp nhận khi dòng ngắn và có nội dung phía sau */
const MEDIUM_HEADER = [
  new RegExp(`^[\\d０-９]{1,4}\\s*[${MEASURE}]\\s*([：:．.\\-—–—\\s　].{0,35})?$`, "u"),
  new RegExp(
    `^[${CN_DIGIT}]{1,10}\\s*[${MEASURE}]\\s*([：:．.\\-—–—\\s　].{0,35})?$`,
    "u"
  ),
];

export function countContentChars(text: string): number {
  return text.replace(/[\s\r\n\u3000]/g, "").length;
}

export function matchesStrictHeader(line: string): boolean {
  const t = line.trim();
  if (!t || FALSE_CHAPTER_PREFIX.test(t)) return false;
  return STRICT_HEADER.some((re) => re.test(t));
}

function looksLikeBodySentence(line: string): boolean {
  const t = line.trim();
  if (matchesStrictHeader(t)) return false;
  if (t.length > MAX_MEDIUM_HEADER_LEN) return true;
  if (NARRATIVE_EXCLUDE.test(t)) return true;
  if (FALSE_CHAPTER_PREFIX.test(t)) return true;
  if (t.length > 28 && /[。！？…]["」』』]?$/.test(t)) return true;
  const punct = (t.match(/[，。！？；、]/g) || []).length;
  if (t.length > 20 && punct >= 2) return true;
  if (/^[（(]?\s*[\d一二三四五六七八九十]{1,3}\s*[)）]?\s*[、.．]\s*\S/.test(t)) return true;
  if (/^[一二三四五六七八九十]{1,2}[、.．]\s*\S{4,}/.test(t)) return true;
  return false;
}

function matchesMediumHeader(line: string): boolean {
  const t = line.trim();
  if (t.length > MAX_MEDIUM_HEADER_LEN) return false;
  if (FALSE_CHAPTER_PREFIX.test(t)) return false;
  return MEDIUM_HEADER.some((re) => re.test(t));
}

function hasUpcomingContent(lines: string[], fromIndex: number): boolean {
  for (let j = fromIndex + 1; j < Math.min(lines.length, fromIndex + 8); j++) {
    const next = lines[j]?.trim() ?? "";
    if (!next) continue;
    if (matchesStrictHeader(next) || matchesMediumHeader(next)) return false;
    if (countContentChars(next) >= 20) return true;
  }
  return false;
}

export function isLikelyChapterHeader(
  line: string,
  lines: string[],
  lineIndex: number,
  strictOnly: boolean
): boolean {
  const t = line.trim();
  if (!t) return false;

  const isStrict = matchesStrictHeader(t);
  if (isStrict) {
    if (t.length > MAX_STRICT_HEADER_LEN) return false;
    return true;
  }

  if (t.length > MAX_MEDIUM_HEADER_LEN) return false;
  if (looksLikeBodySentence(t)) return false;
  if (strictOnly) return false;

  if (matchesMediumHeader(t) && hasUpcomingContent(lines, lineIndex)) {
    return true;
  }

  return false;
}

function flushChapter(
  chapters: ParsedChapterDraft[],
  name: string,
  bodyLines: string[]
) {
  const text = bodyLines.join("\n").trim();
  const title = name.trim() || "Lời mở đầu / Prologue";
  chapters.push({ originalName: title, text });
}

/** Tách theo hàm nhận diện tiêu đề — mọi dòng khớp đều mở chương mới */
function splitRawTextByHeader(
  rawText: string,
  isHeader: (line: string, lines: string[], index: number) => boolean
): ParsedChapterDraft[] {
  const lines = rawText.split(/\r?\n/);
  const chapters: ParsedChapterDraft[] = [];
  let currentName = "";
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isHeader(line, lines, i)) {
      if (currentName || currentLines.some((l) => l.trim())) {
        flushChapter(chapters, currentName, currentLines);
      }
      currentName = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentName || currentLines.some((l) => l.trim())) {
    flushChapter(chapters, currentName, currentLines);
  }

  return chapters;
}

function splitRawText(rawText: string, strictOnly: boolean): ParsedChapterDraft[] {
  const lines = rawText.split(/\r?\n/);
  const chapters: ParsedChapterDraft[] = [];

  let currentName = "";
  let currentLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isLikelyChapterHeader(line, lines, i, strictOnly)) {
      const header = line.trim();
      const headerIsStrict = matchesStrictHeader(header);

      if (headerIsStrict) {
        if (currentName || currentLines.some((l) => l.trim())) {
          flushChapter(chapters, currentName, currentLines);
        }
        currentName = header;
        currentLines = [];
        continue;
      }

      const bodyChars = countContentChars(currentLines.join("\n"));

      if (bodyChars >= MIN_CHAPTER_CONTENT_CHARS) {
        flushChapter(chapters, currentName, currentLines);
        currentName = header;
        currentLines = [];
      } else if (bodyChars > 0) {
        if (currentName) currentLines.push(currentName);
        currentLines.push(line);
        currentName = "";
      } else if (currentName) {
        currentName = header;
      } else {
        currentName = header;
      }
    } else {
      currentLines.push(line);
    }
  }

  if (currentName || currentLines.some((l) => l.trim())) {
    flushChapter(chapters, currentName, currentLines);
  }

  return chapters;
}

function countStrictHeaders(chapters: ParsedChapterDraft[]): number {
  return chapters.filter((c) => matchesStrictHeader(c.originalName)).length;
}

/** Gộp chương quá ngắn / trống (tiêu đề nghi ngờ) — giữ nguyên mọi 第N章 chuẩn */
export function cleanupParsedChapters(chapters: ParsedChapterDraft[]): ParsedChapterDraft[] {
  if (chapters.length === 0) return chapters;

  const working = chapters.map((c) => ({
    originalName: c.originalName,
    text: c.text,
  }));
  const merged: ParsedChapterDraft[] = [];

  for (let i = 0; i < working.length; i++) {
    const ch = working[i];
    const chars = countContentChars(ch.text);
    const isStrictTitle = matchesStrictHeader(ch.originalName);

    if (chars >= MIN_CHAPTER_CONTENT_CHARS || isStrictTitle) {
      merged.push({ ...ch });
      continue;
    }

    const next = working[i + 1];
    if (next && countContentChars(next.text) >= MIN_CHAPTER_CONTENT_CHARS) {
      next.originalName = ch.originalName
        ? `${ch.originalName} · ${next.originalName}`
        : next.originalName;
      const prefix = [ch.text.trim(), ch.originalName.trim()].filter(Boolean).join("\n");
      if (prefix) {
        next.text = next.text.trim() ? `${prefix}\n\n${next.text.trim()}` : prefix;
      }
      continue;
    }

    if (merged.length > 0) {
      const prev = merged[merged.length - 1];
      const prefix = ch.originalName.trim();
      if (prefix) {
        prev.text = prev.text ? `${prev.text}\n\n${prefix}` : prefix;
      }
      if (ch.text.trim()) {
        prev.text = prev.text ? `${prev.text}\n${ch.text.trim()}` : ch.text.trim();
      }
    } else {
      merged.push({ ...ch });
    }
  }

  const filtered = merged.filter(
    (ch) =>
      countContentChars(ch.text) >= MIN_CHAPTER_CONTENT_CHARS ||
      matchesStrictHeader(ch.originalName)
  );

  if (filtered.length === 0 && working.length > 0) {
    return [
      {
        originalName: "Toàn bộ tác phẩm / Toàn văn",
        text: working.map((c) => `${c.originalName}\n${c.text}`).join("\n\n").trim(),
      },
    ];
  }

  return filtered;
}

function countEmpty(chapters: ParsedChapterDraft[]): number {
  return chapters.filter(
    (c) =>
      countContentChars(c.text) < MIN_CHAPTER_CONTENT_CHARS &&
      !matchesStrictHeader(c.originalName)
  ).length;
}

export interface CustomChapterParseResult extends ChapterParseResult {
  patternError?: string;
}

/**
 * Phân tích theo mẫu do người dùng định nghĩa (ví dụ 第<num>章).
 */
export function parseChaptersWithCustomPattern(
  rawText: string,
  pattern: string
): CustomChapterParseResult {
  const normalized = rawText.replace(/\uFEFF/g, "").replace(/\r\n/g, "\n");
  const { compiled, error } = compileChapterPattern(pattern);

  if (!compiled) {
    return {
      chapters: [],
      stats: {
        totalDetected: 0,
        emptyBeforeCleanup: 0,
        emptyAfterCleanup: 0,
        usedStrictMode: false,
        usedCustomPattern: true,
        customPattern: pattern,
      },
      patternError: error,
    };
  }

  const matcher = (line: string) => isCustomChapterHeader(line, compiled);
  const draft = splitRawTextByHeader(normalized, (line) => matcher(line));
  const emptyBefore = draft.filter((c) => countContentChars(c.text) < MIN_CHAPTER_CONTENT_CHARS).length;

  let chapters = draft.length > 0 ? draft : [];

  if (chapters.length === 0) {
    chapters = [
      {
        originalName: "Toàn bộ tác phẩm / Toàn văn",
        text: normalized.trim(),
      },
    ];
  }

  const emptyAfter = chapters.filter((c) => countContentChars(c.text) < MIN_CHAPTER_CONTENT_CHARS).length;

  return {
    chapters,
    stats: {
      totalDetected: draft.length,
      emptyBeforeCleanup: emptyBefore,
      emptyAfterCleanup: emptyAfter,
      usedStrictMode: false,
      usedCustomPattern: true,
      customPattern: pattern,
    },
  };
}

/**
 * Phân tích legacy (heuristic) — dùng khi rule engine không cho kết quả hoặc tắt hết rule.
 */
function parseChineseNovelChaptersLegacy(rawText: string): ChapterParseResult {
  const normalized = rawText.replace(/\uFEFF/g, "").replace(/\r\n/g, "\n");

  let usedStrictMode = false;
  let draft = splitRawText(normalized, false);
  const emptyBefore = countEmpty(draft);
  const strictTitleCount = countStrictHeaders(draft);
  const mostlyStrictNovel = draft.length > 0 && strictTitleCount / draft.length >= 0.85;

  const emptyRatio = draft.length > 0 ? emptyBefore / draft.length : 0;
  if (draft.length >= 8 && emptyRatio > 0.2 && !mostlyStrictNovel) {
    const strictDraft = splitRawText(normalized, true);
    const strictEmpty = countEmpty(strictDraft);
    const strictRatio = strictDraft.length > 0 ? strictEmpty / strictDraft.length : 1;
    const loseTooManyChapters = strictDraft.length < draft.length * 0.95;

    if (
      !loseTooManyChapters &&
      (strictRatio < emptyRatio || (strictDraft.length <= draft.length && strictEmpty < emptyBefore))
    ) {
      draft = strictDraft;
      usedStrictMode = true;
    }
  }

  let chapters = cleanupParsedChapters(draft);
  const emptyAfter = countEmpty(chapters);

  if (
    chapters.length === 1 &&
    !draft.some((c) => matchesStrictHeader(c.originalName)) &&
    countContentChars(chapters[0].text) > 0
  ) {
    const only = chapters[0];
    if (only.originalName.includes("Prologue") || only.originalName.includes("Lời mở đầu")) {
      only.originalName = "Toàn bộ tác phẩm / Toàn văn";
    }
  }

  if (chapters.length === 0) {
    chapters = [
      {
        originalName: "Toàn bộ tác phẩm / Toàn văn",
        text: normalized.trim(),
      },
    ];
  }

  return {
    chapters,
    stats: {
      totalDetected: draft.length,
      emptyBeforeCleanup: emptyBefore,
      emptyAfterCleanup: emptyAfter,
      usedStrictMode,
      usedRuleEngine: false,
    },
  };
}

/**
 * Phân tích toàn bộ văn bản — ưu tiên bộ quy tắc regex bật/tắt; fallback heuristic nếu 0 chương.
 */
export function parseChineseNovelChapters(
  rawText: string,
  ruleStates?: ChapterRuleState[] | null
): ChapterParseResult {
  const merged = mergeChapterRuleStates(ruleStates);
  const rulesResult = parseChaptersWithRules(rawText, merged);
  const detected = rulesResult.stats.totalDetected;

  if (detected >= 1 && rulesResult.enabledRuleCount > 0) {
    const cleaned = cleanupParsedChapters(rulesResult.chapters);
    return {
      chapters: cleaned,
      stats: {
        ...rulesResult.stats,
        emptyAfterCleanup: cleaned.filter((c) => countContentChars(c.text) < 40).length,
      },
    };
  }

  const legacy = parseChineseNovelChaptersLegacy(rawText);
  if (legacy.chapters.length > 1 || legacy.stats.totalDetected > 0) {
    return legacy;
  }

  return {
    chapters: rulesResult.chapters,
    stats: rulesResult.stats,
  };
}
