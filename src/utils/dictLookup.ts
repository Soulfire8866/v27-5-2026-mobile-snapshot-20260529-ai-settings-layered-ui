/**
 * Tra cứu từ điển (Vietphrase / nhập tay): khớp dài nhất, ưu tiên tên riêng,
 * hạn chế khớp nhầm cụm phổ biến khi nạp từ điển lớn.
 */

import type { DictItem } from "../types";

export type DictLookupSource = "dict" | "dict-name";

export interface DictSelectionMatch {
  chinese: string;
  vietnamese: string;
  category?: DictItem["category"];
  confidence: number;
  matchType: "exact" | "bounded" | "contains";
  novelScoped: boolean;
}

const NAME_LIKE_CATEGORIES = new Set<DictItem["category"]>(["name", "sect", "item", "history"]);

/** Từ/cụm Việt quá chung — không khớp kiểu “chuỗi con” trừ khi trùng khít cả vùng chọn */
const VI_GENERIC_BLOCKLIST = new Set([
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
]);

export const normalizeForDictMatch = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/#!$%^&*;:{}=_`~()?"'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const hasHan = (s: string) => /[\u4e00-\u9fa5]/.test(s);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Khớp mục Việt trong vùng chọn gốc (có biên từ) */
function findBoundedInRaw(rawSelection: string, entryVi: string): boolean {
  const raw = rawSelection.trim();
  const entry = entryVi.trim();
  if (!raw || !entry) return false;
  if (raw.toLowerCase() === entry.toLowerCase()) return true;

  const re = new RegExp(
    `(?:^|[\\s,.;:!?'"“”()\\[\\]—–\\-])${escapeRegExp(entry)}(?:$|[\\s,.;:!?'"“”()\\[\\]—–\\-])`,
    "i"
  );
  if (re.test(raw)) return true;

  const reNorm = new RegExp(
    `(?:^|\\s)${escapeRegExp(normalizeForDictMatch(entry))}(?:$|\\s)`,
    "i"
  );
  return reNorm.test(normalizeForDictMatch(raw));
}

function scoreDictCandidate(
  item: DictItem,
  selNorm: string,
  rawSelection: string,
  novelId?: string
): { score: number; matchType: DictSelectionMatch["matchType"] } | null {
  const zh = item.chinese?.trim();
  const viRaw = item.vietnamese?.trim();
  if (!zh || !viRaw || !hasHan(zh)) return null;

  const viNorm = normalizeForDictMatch(viRaw);
  if (!viNorm) return null;

  let matchType: DictSelectionMatch["matchType"] | null = null;
  let baseScore = 0;

  if (viNorm === selNorm) {
    matchType = "exact";
    baseScore = 100;
  } else if (selNorm.includes(viNorm)) {
    if (!findBoundedInRaw(rawSelection, viRaw)) return null;
    matchType = "bounded";
    baseScore = 88;
  } else if (viNorm.includes(selNorm) && selNorm.length >= 3) {
    matchType = "contains";
    baseScore = 78;
  } else {
    return null;
  }

  const isGeneric = VI_GENERIC_BLOCKLIST.has(viNorm);
  const minViLen = NAME_LIKE_CATEGORIES.has(item.category) ? 2 : 3;

  if (viNorm.length < minViLen && matchType !== "exact") return null;
  if (isGeneric && matchType !== "exact") return null;
  if (viNorm.length < 3 && matchType === "bounded" && !NAME_LIKE_CATEGORIES.has(item.category)) {
    return null;
  }

  let score = baseScore;
  score += Math.min(viNorm.length, 24) * 1.5;
  score += Math.min(zh.length, 8);

  if (novelId && item.novelId === novelId) score += 18;
  else if (!item.novelId) score += 6;

  if (NAME_LIKE_CATEGORIES.has(item.category)) score += 12;
  if (item.category === "name") score += 6;

  if (matchType === "contains") {
    const coverage = selNorm.length / Math.max(viNorm.length, 1);
    if (coverage < 0.45) return null;
    score -= 8;
  }

  if (matchType === "bounded" && viNorm.length < 4) {
    score -= 5;
  }

  return { score, matchType };
}

/**
 * Tra ngược: cụm Việt đã chọn → Hán tự (ưu tiên khớp dài, tên riêng, truyện riêng).
 * Ngưỡng mặc định 72 — dưới ngưỡng coi như không khớp (tránh nhiễu Vietphrase lớn).
 */
export function lookupSelectionInDict(
  selectedVietnamese: string,
  dictItems: DictItem[],
  novelId?: string,
  minScore = 72
): DictSelectionMatch | null {
  const raw = selectedVietnamese.trim();
  const selNorm = normalizeForDictMatch(raw);
  if (!selNorm || selNorm.length < 1) return null;

  const relevant = dictItems.filter((item) => {
    if (!item.chinese?.trim() || !item.vietnamese?.trim()) return false;
    if (item.novelId && item.novelId !== novelId) return false;
    return true;
  });

  let best: DictSelectionMatch | null = null;

  for (const item of relevant) {
    const scored = scoreDictCandidate(item, selNorm, raw, novelId);
    if (!scored || scored.score < minScore) continue;

    const candidate: DictSelectionMatch = {
      chinese: item.chinese.trim(),
      vietnamese: item.vietnamese.trim(),
      category: item.category,
      confidence: Math.round(scored.score),
      matchType: scored.matchType,
      novelScoped: !!item.novelId && item.novelId === novelId,
    };

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    } else if (
      candidate.confidence === best.confidence &&
      candidate.vietnamese.length > best.vietnamese.length
    ) {
      best = candidate;
    }
  }

  return best;
}

/** Tra xuôi: Hán tự → nghĩa Vietphrase (không API) */
export function lookupChineseInDict(
  chinese: string,
  dictItems: DictItem[],
  novelId?: string
): DictSelectionMatch | null {
  const term = chinese.trim();
  if (!term || !hasHan(term)) return null;

  const relevant = dictItems.filter((item) => {
    if (!item.chinese?.trim() || !item.vietnamese?.trim()) return false;
    if (item.novelId && item.novelId !== novelId) return false;
    return true;
  });

  let best: DictSelectionMatch | null = null;

  for (const item of relevant) {
    const zh = item.chinese.trim();
    let matchType: DictSelectionMatch["matchType"] | null = null;
    let score = 0;

    if (zh === term) {
      matchType = "exact";
      score = 100;
    } else if (term.includes(zh) && zh.length >= 2) {
      matchType = "bounded";
      score = 85 + zh.length;
    } else if (zh.includes(term) && term.length >= 2) {
      matchType = "contains";
      score = 75 + term.length;
    } else {
      continue;
    }

    if (novelId && item.novelId === novelId) score += 15;
    if (NAME_LIKE_CATEGORIES.has(item.category)) score += 8;

    const candidate: DictSelectionMatch = {
      chinese: zh,
      vietnamese: item.vietnamese.trim(),
      category: item.category,
      confidence: Math.round(score),
      matchType,
      novelScoped: !!item.novelId && item.novelId === novelId,
    };

    if (!best || candidate.confidence > best.confidence) {
      best = candidate;
    } else if (candidate.confidence === best.confidence && zh.length > best.chinese.length) {
      best = candidate;
    }
  }

  return best;
}
