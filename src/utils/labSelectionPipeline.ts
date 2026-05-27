/**
 * Pipeline A–E cho popup «Dịch» ở Phòng Đọc — nguồn dữ liệu Lab (sourceText + translatedText).
 * ReaderView chỉ bắt selection / render UI; logic khớp Hán–Việt và validate nằm ở đây.
 */

import type { DictItem, PronounMapping } from "../types";
import {
  resolveSelectionFromBilingualChapter,
  lookupSelectionInDict,
  type BilingualLookupSource,
  type BilingualSelectionMatch,
  type DictSelectionMatch,
} from "./bilingualAlignment";

export type LabSelectionContext = {
  sourceText: string;
  translatedText: string;
  dictItems: DictItem[];
  novelId?: string;
};

export type LabSelectionResolveResult = {
  vietnamese: string;
  rawVietnamese: string;
  chinese: string;
  chineseLine: string;
  vietnameseLine: string;
  lineIndex: number | null;
  lookupSource: BilingualLookupSource | "dict" | "dict-name" | "api" | "none";
  expandedFromPartial: boolean;
  nameSuggestion: string | null;
  confidence: number;
};

export type DictPairValidation = {
  ok: boolean;
  level: "ok" | "warn";
  message?: string;
  suggestedVietnamese?: string;
};

/** Từ thường viết thường — không mở rộng cụm tên khi gặp */
const NAME_EXPAND_BLOCKLIST = new Set([
  "ta",
  "toi",
  "han",
  "nang",
  "no",
  "nguoi",
  "nay",
  "do",
  "la",
  "co",
  "khong",
  "mot",
  "va",
  "cac",
  "voi",
  "cho",
  "trong",
  "tren",
  "duoi",
  "di",
  "den",
  "da",
  "se",
  "bi",
  "duoc",
  "roi",
  "neu",
  "thi",
  "ma",
  "hay",
  "con",
  "rat",
  "nhung",
  "the",
  "nhu",
  "khi",
  "o",
  "vao",
  "ra",
  "noi",
  "day",
  "kia",
  "gi",
  "ai",
  "sao",
  "theo",
  "tu",
  "ve",
  "ban",
  "minh",
  "ho",
  "an",
  "uong",
  "nam",
  "nu",
]);

function isTitleCaseNamePart(word: string): boolean {
  const w = word.trim();
  if (!w || w.length < 2) return false;
  return /^[\p{Lu}]/u.test(w);
}

export function isTitleCaseToken(word: string): boolean {
  if (!isTitleCaseNamePart(word)) return false;
  const normalized = word.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (NAME_EXPAND_BLOCKLIST.has(normalized)) return false;
  return true;
}

/** Cụm tên riêng: mỗi từ viết hoa chữ đầu (vd. Vưu Thị, Tần Khả Khanh). */
export function isProperNamePhrase(phrase: string): boolean {
  const tokens = phrase.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return false;
  if (tokens.length === 1) return isTitleCaseToken(tokens[0]);
  return tokens.every((t) => isTitleCaseNamePart(t));
}

type LineToken = { text: string; start: number; end: number };

function tokenizeLine(line: string): LineToken[] {
  const tokens: LineToken[] = [];
  const re = /[\p{L}\p{M}\p{N}]+/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  }
  return tokens;
}

function findSelectionSpan(line: string, selected: string): { start: number; end: number } | null {
  const sel = selected.trim();
  if (!sel || !line) return null;
  let start = line.indexOf(sel);
  if (start >= 0) return { start, end: start + sel.length };
  const lowerLine = line.toLowerCase();
  const lowerSel = sel.toLowerCase();
  start = lowerLine.indexOf(lowerSel);
  if (start >= 0) return { start, end: start + sel.length };
  return null;
}

/**
 * B — Mở rộng cụm tên riêng liên tiếp (vd. «Tần» → «Tần Khả Khanh», «Vưu» → «Vưu Thị»).
 */
export function expandProperNameInLine(
  selected: string,
  lineText: string
): { text: string; expanded: boolean; start: number; end: number } {
  const line = lineText;
  const sel = selected.trim();
  if (!sel || !line.trim()) {
    return { text: sel, expanded: false, start: -1, end: -1 };
  }

  const span = findSelectionSpan(line, sel);
  if (!span) return { text: sel, expanded: false, start: -1, end: -1 };

  const tokens = tokenizeLine(line);
  const selTokenIdx = tokens.findIndex((t) => span.start >= t.start && span.start < t.end);
  if (selTokenIdx < 0) return { text: sel, expanded: false, start: span.start, end: span.end };

  if (!isTitleCaseToken(tokens[selTokenIdx].text)) {
    return { text: sel, expanded: false, start: span.start, end: span.end };
  }

  let left = selTokenIdx;
  let right = selTokenIdx;
  while (left > 0 && isTitleCaseNamePart(tokens[left - 1].text)) left--;
  while (right < tokens.length - 1 && isTitleCaseNamePart(tokens[right + 1].text)) right++;

  const runLen = right - left + 1;
  if (runLen < 2) {
    return { text: sel, expanded: false, start: span.start, end: span.end };
  }

  const expandedStart = tokens[left].start;
  const expandedEnd = tokens[right].end;
  const expandedText = line.slice(expandedStart, expandedEnd).trim();
  if (expandedText.length <= sel.length) {
    return { text: sel, expanded: false, start: span.start, end: span.end };
  }

  return { text: expandedText, expanded: true, start: expandedStart, end: expandedEnd };
}

/** Mở rộng selection theo biên từ trong đoạn */
export function expandToWordBoundaries(
  selected: string,
  paragraphText: string,
  startIdx: number,
  endIdx: number
): { text: string; start: number; end: number } {
  if (startIdx < 0 || endIdx < 0 || !paragraphText) {
    return { text: selected.trim(), start: startIdx, end: endIdx };
  }

  const isWordChar = (char: string) => !!char && /^[\p{L}\p{N}]$/u.test(char);
  let start = startIdx;
  let end = endIdx;
  while (start > 0 && isWordChar(paragraphText[start - 1])) start--;
  while (end < paragraphText.length && isWordChar(paragraphText[end])) end++;
  return { text: paragraphText.slice(start, end).trim(), start, end };
}

function countHanChars(s: string): number {
  return [...s.replace(/\s/g, "")].filter((c) => /[\u4e00-\u9fa5]/.test(c)).length;
}

function applyBilingualMatch(
  match: BilingualSelectionMatch,
  vietnamese: string,
  rawVietnamese: string,
  expandedFromPartial: boolean
): LabSelectionResolveResult {
  return {
    vietnamese,
    rawVietnamese,
    chinese: match.chinese,
    chineseLine: match.chineseLine,
    vietnameseLine: match.vietnameseLine,
    lineIndex: match.lineIndex,
    lookupSource: match.source,
    expandedFromPartial,
    nameSuggestion: null,
    confidence: match.confidence,
  };
}

function applyDictMatch(
  hit: DictSelectionMatch,
  vietnamese: string,
  rawVietnamese: string,
  expandedFromPartial: boolean,
  chapterSource: string
): LabSelectionResolveResult {
  const srcLines = chapterSource.replace(/\r\n/g, "\n").split("\n");
  const lineIdx = srcLines.findIndex((l) => l.includes(hit.chinese));
  return {
    vietnamese: hit.vietnamese || vietnamese,
    rawVietnamese,
    chinese: hit.chinese,
    chineseLine: lineIdx >= 0 ? srcLines[lineIdx].trim() : hit.chinese,
    vietnameseLine: vietnamese,
    lineIndex: lineIdx >= 0 ? lineIdx : null,
    lookupSource: hit.category === "name" ? "dict-name" : "dict",
    expandedFromPartial,
    nameSuggestion: null,
    confidence: hit.confidence,
  };
}

/**
 * C — Khớp Hán–Việt từ Lab: từ điển → dòng song ngữ (sau mở rộng cụm tên).
 */
export function resolveLabBilingualSelection(params: {
  selectedVietnamese: string;
  rawSelectedVietnamese?: string;
  lineText: string;
  context: LabSelectionContext;
  skipNameExpand?: boolean;
}): LabSelectionResolveResult | null {
  const { context, lineText, skipNameExpand } = params;
  const raw = (params.rawSelectedVietnamese ?? params.selectedVietnamese).trim();
  let vietnamese = params.selectedVietnamese.trim();
  if (!vietnamese || !lineText.trim()) return null;

  let expandedFromPartial = false;
  if (!skipNameExpand) {
    const nameExpand = expandProperNameInLine(vietnamese, lineText);
    if (nameExpand.expanded) {
      vietnamese = nameExpand.text;
      expandedFromPartial = true;
    }
  }

  const { sourceText, translatedText, dictItems, novelId } = context;
  const hasLab = !!(sourceText?.trim() && translatedText?.trim());

  const dictHit = lookupSelectionInDict(vietnamese, dictItems, novelId);
  if (dictHit) {
    return applyDictMatch(dictHit, vietnamese, raw, expandedFromPartial, sourceText || "");
  }

  if (!hasLab) return null;

  const bilingualMatch = resolveSelectionFromBilingualChapter(vietnamese, sourceText, translatedText);
  if (bilingualMatch) {
    return applyBilingualMatch(bilingualMatch, vietnamese, raw, expandedFromPartial);
  }

  if (expandedFromPartial) {
    const retryRaw = resolveSelectionFromBilingualChapter(raw, sourceText, translatedText);
    if (retryRaw) {
      return applyBilingualMatch(retryRaw, vietnamese, raw, expandedFromPartial);
    }
  }

  return null;
}

/**
 * E — Cảnh báo trước khi lưu nếu Hán dài / Việt quá ngắn so với cụm tên trong dòng Lab.
 */
export function validateDictPairBeforeSave(
  chinese: string,
  vietnamese: string,
  opts: { vietnameseLine?: string; rawSelection?: string }
): DictPairValidation {
  const zh = chinese.trim();
  const vi = vietnamese.trim();
  if (!zh || !vi) {
    return { ok: false, level: "warn", message: "Thiếu từ gốc Trung hoặc bản dịch Việt." };
  }

  const hanCount = countHanChars(zh);
  const viTokens = vi.split(/\s+/).filter(Boolean);
  const viLine = opts.vietnameseLine?.trim() || "";

  if (hanCount >= 2 && viTokens.length === 1 && viLine) {
    const fromLine = expandProperNameInLine(vi, viLine);
    if (fromLine.expanded && fromLine.text !== vi) {
      return {
        ok: false,
        level: "warn",
        message: `Cụm Hán «${zh}» (${hanCount} chữ) có vẻ là tên đầy đủ, nhưng bản Việt chỉ có «${vi}».`,
        suggestedVietnamese: fromLine.text,
      };
    }

    if (opts.rawSelection && opts.rawSelection.trim() !== vi) {
      const fromRaw = expandProperNameInLine(opts.rawSelection.trim(), viLine);
      if (fromRaw.expanded && fromRaw.text !== vi) {
        return {
          ok: false,
          level: "warn",
          message: `Cụm Hán «${zh}» có thể tương ứng «${fromRaw.text}» thay vì «${vi}».`,
          suggestedVietnamese: fromRaw.text,
        };
      }
    }
  }

  if (hanCount >= 3 && viTokens.length <= 1 && viLine) {
    const probe = expandProperNameInLine(vi, viLine);
    if (probe.expanded && probe.text.split(/\s+/).length >= 2) {
      return {
        ok: false,
        level: "warn",
        message: `Tên Hán ${hanCount} chữ — gợi ý bản Việt đầy đủ: «${probe.text}».`,
        suggestedVietnamese: probe.text,
      };
    }
  }

  return { ok: true, level: "ok" };
}

/** Thời gian chờ selection ổn định trước khi mở popup (A). */
export const LAB_SELECTION_SETTLE_MS = 320;
