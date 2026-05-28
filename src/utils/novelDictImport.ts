import { saveBlobWithNativeFallback } from "./nativeFileSave";

/**
 * Import từ điển (chung / riêng) + chuẩn hóa tên trong bản dịch Lab.
 */

import type { Chapter, DictItem } from "../types";
import { replaceAllExact } from "./nameConsistency";
import {
  isLabMatchPlausible,
  isLikelyNameFromVietphrase,
  isScanNoiseChinesePhrase,
  pickBestLabPhraseForChineseOnLine,
  resolveTranslationFromLabCorpus,
  type ScanChapterSlice,
} from "./nameScanPipeline";

export function decodeTxtArrayBuffer(buffer: ArrayBuffer): string {
  try {
    const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
    let content = utf8Decoder.decode(buffer);
    const fffdCount = (content.match(/\uFFFD/g) || []).length;
    if (fffdCount > 10 && fffdCount > content.length * 0.005) {
      throw new Error("try gb18030");
    }
    return content;
  } catch {
    try {
      return new TextDecoder("gb18030").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
}

/** Parse nội dung .txt: Hán=Việt (hoặc ->, tab, khoảng trắng). */
export function parseDictTxtContent(content: string): Record<string, string> {
  const loaded: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    let splitChar = "";
    if (trimmed.includes("=")) splitChar = "=";
    else if (trimmed.includes("->")) splitChar = "->";
    else if (trimmed.includes("=>")) splitChar = "=>";
    else if (trimmed.includes("\t")) splitChar = "\t";

    if (splitChar) {
      const parts = trimmed.split(splitChar);
      const zh = parts[0]?.trim();
      const vi = parts[1]?.trim();
      if (zh && vi) loaded[zh] = vi;
    } else {
      const firstSpace = trimmed.indexOf(" ");
      if (firstSpace !== -1) {
        const zh = trimmed.substring(0, firstSpace).trim();
        const vi = trimmed.substring(firstSpace).trim();
        if (zh && vi) loaded[zh] = vi;
      }
    }
  }

  return loaded;
}

/** Cụm Hán không nên vào import / chuẩn hóa tên riêng. */
export function isNovelDictImportEligible(chinese: string, vietnamese: string): boolean {
  const zh = chinese.trim();
  const vi = vietnamese.trim();
  if (!zh || !vi) return false;
  if (isScanNoiseChinesePhrase(zh)) return false;
  if (!isLikelyNameFromVietphrase(vi)) return false;
  return true;
}

export const normalizeViLabel = (s: string): string =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const viTokens = (s: string): string[] =>
  normalizeViLabel(s)
    .split(" ")
    .filter((t) => t.length >= 1);

function normalizedEditRatio(a: string, b: string): number {
  const al = normalizeViLabel(a);
  const bl = normalizeViLabel(b);
  if (!al || !bl) return 1;
  if (al === bl) return 0;

  const rows = bl.length + 1;
  const cols = al.length + 1;
  const prev = new Array<number>(cols).fill(0);
  for (let i = 1; i <= bl.length; i++) {
    let cur = i;
    for (let j = 1; j <= al.length; j++) {
      const cost = al[j - 1] === bl[i - 1] ? 0 : 1;
      const next = Math.min(prev[j] + 1, cur + 1, prev[j - 1] + cost);
      prev[j - 1] = cur;
      cur = next;
    }
    prev[al.length] = cur;
  }
  return prev[al.length] / Math.max(al.length, bl.length);
}

/** 5D — «from» phải gần «to» (token cuối, token chung, độ lệch). */
export function isValidDictReplaceFrom(chinese: string, from: string, to: string): boolean {
  const zh = chinese.trim();
  const f = from.trim();
  const t = to.trim();
  if (!zh || !f || !t) return false;
  if (normalizeViLabel(f) === normalizeViLabel(t)) return false;
  if (!isLabMatchPlausible(zh, f) || !isLabMatchPlausible(zh, t)) return false;

  const ft = viTokens(f);
  const tt = viTokens(t);
  if (!ft.length || !tt.length) return false;

  if (Math.abs(ft.length - tt.length) > 1) return false;

  const editRatio = normalizedEditRatio(f, t);

  const shared = ft.filter((tok) => tt.includes(tok) && tok.length >= 2);
  if (!shared.length) return false;

  if (tt.length >= 2 && ft[0] !== tt[0]) return false;

  const lastTo = tt[tt.length - 1];
  if (!lastTo || !ft.includes(lastTo)) {
    // Cho phép «sửa chính tả gần» làm token cuối hơi khác
    // (vd. Tống Tuyên → Tống Huyên) nhưng vẫn chặn các ghép sai khác thực thể.
    if (editRatio > 0.2) return false;
  }

  if (tt.length >= 2 && shared.length < 2) {
    // Nếu chỉ lệch 1 "âm tiết" (sửa chính tả gần) thì vẫn cho phép.
    if (editRatio > 0.18) return false;
  }

  if (ft.length > tt.length) {
    let ti = 0;
    for (const fTok of ft) {
      if (ti < tt.length && fTok === tt[ti]) ti += 1;
    }
    if (ti < tt.length) return false;
    if (ft.length > tt.length + 1) return false;
  }

  if (editRatio > 0.38) return false;

  return true;
}

export type DictReplaceConfidence = "high" | "low";

/** 5F — phân tầng tin cậy cho preview. */
export function classifyDictReplaceConfidence(
  chinese: string,
  from: string,
  to: string,
  chapters: ScanChapterSlice[]
): DictReplaceConfidence {
  if (!isValidDictReplaceFrom(chinese, from, to)) return "low";

  const lab = resolveTranslationFromLabCorpus(chinese, chapters);
  const fromNorm = normalizeViLabel(from);
  const labNorm = lab?.vietnamese ? normalizeViLabel(lab.vietnamese) : "";

  const ft = viTokens(from);
  const tt = viTokens(to);

  if (labNorm && fromNorm === labNorm) {
    if (ft.length === tt.length && tt.every((tok, i) => ft[i] === tok)) return "high";
    if (normalizedEditRatio(from, to) <= 0.28) return "high";
  }

  if (normalizedEditRatio(from, to) <= 0.2) return "high";

  if (tt.every((tok) => ft.includes(tok)) && ft.length === tt.length) return "high";

  return "low";
}

export function collectDictReplaceFromCandidates(
  chinese: string,
  chapters: ScanChapterSlice[]
): string[] {
  const zh = chinese.trim();
  if (!zh || isScanNoiseChinesePhrase(zh)) return [];

  const candidates = new Set<string>();

  const labHit = resolveTranslationFromLabCorpus(zh, chapters);
  if (labHit?.vietnamese?.trim() && isLabMatchPlausible(zh, labHit.vietnamese)) {
    candidates.add(labHit.vietnamese.trim());
  }

  for (const ch of chapters) {
    const src = ch.sourceText?.trim();
    const tr = ch.translatedText?.trim();
    if (!src || !tr) continue;

    const srcLines = splitBilingualLines(src);
    const trLines = splitBilingualLines(tr);
    const max = Math.max(srcLines.length, trLines.length);

    for (let i = 0; i < max; i++) {
      const pick = pickBestLabPhraseForChineseOnLine(zh, srcLines[i] || "", trLines[i] || "");
      if (pick && isLabMatchPlausible(zh, pick)) candidates.add(pick);
    }
  }

  return [...candidates];
}

export function dictItemsToImportEntries(items: DictItem[], novelId?: string): { chinese: string; vietnamese: string }[] {
  return items
    .filter((it) => {
      if (!it.chinese?.trim() || !it.vietnamese?.trim()) return false;
      if (novelId) return it.novelId === novelId;
      return !it.novelId;
    })
    .filter((it) => isNovelDictImportEligible(it.chinese, it.vietnamese))
    .map((it) => ({ chinese: it.chinese.trim(), vietnamese: it.vietnamese.trim() }));
}

export function buildDictExportTxtContent(
  items: { chinese: string; vietnamese: string }[]
): string {
  return items
    .filter((it) => it.chinese?.trim() && it.vietnamese?.trim())
    .sort((a, b) => a.chinese.localeCompare(b.chinese, "zh-Hans"))
    .map((it) => `${it.chinese.trim()}=${it.vietnamese.trim()}`)
    .join("\n");
}

export async function downloadDictTxtFile(fileName: string, content: string): Promise<void> {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  await saveBlobWithNativeFallback(blob, fileName, "text/plain");
}

function splitBilingualLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

export function countSubstringOccurrences(text: string, needle: string): number {
  if (!needle || !text) return 0;
  let count = 0;
  let pos = 0;
  while ((pos = text.indexOf(needle, pos)) !== -1) {
    count += 1;
    pos += needle.length;
  }
  return count;
}

/** Đếm «from» chỉ trên dòng có cụm Hán tương ứng. */
export function countReplacementOnAlignedLines(
  chinese: string,
  from: string,
  chapters: Pick<Chapter, "sourceText" | "translatedText">[]
): { occurrences: number; chapterCount: number } {
  const zh = chinese.trim();
  const needle = from.trim();
  if (!zh || !needle) return { occurrences: 0, chapterCount: 0 };

  let occurrences = 0;
  let chapterCount = 0;

  for (const ch of chapters) {
    const src = ch.sourceText?.trim();
    const tr = ch.translatedText?.trim();
    if (!src || !tr) continue;

    const srcLines = splitBilingualLines(src);
    const trLines = splitBilingualLines(tr);
    const max = Math.max(srcLines.length, trLines.length);

    let chapterOcc = 0;
    for (let i = 0; i < max; i++) {
      const lineZh = srcLines[i] || "";
      const lineVi = trLines[i] || "";
      if (!lineZh.includes(zh) || !lineVi.includes(needle)) continue;

      const pick = pickBestLabPhraseForChineseOnLine(zh, lineZh, lineVi);
      if (!pick || normalizeViLabel(pick) !== normalizeViLabel(needle)) continue;

      chapterOcc += countSubstringOccurrences(lineVi, needle);
    }

    if (chapterOcc > 0) {
      occurrences += chapterOcc;
      chapterCount += 1;
    }
  }

  return { occurrences, chapterCount };
}

export type DictReplacePreviewRow = {
  id: string;
  chinese: string;
  from: string;
  to: string;
  occurrences: number;
  chapterCount: number;
  confidence: DictReplaceConfidence;
  selected: boolean;
};

export function filterSuspiciousPreviewRows(rows: DictReplacePreviewRow[]): DictReplacePreviewRow[] {
  const byFrom = new Map<string, { targets: Set<string>; chinese: Set<string> }>();
  for (const row of rows) {
    const key = normalizeViLabel(row.from);
    const bucket = byFrom.get(key) ?? { targets: new Set<string>(), chinese: new Set<string>() };
    bucket.targets.add(normalizeViLabel(row.to));
    bucket.chinese.add(row.chinese.trim());
    byFrom.set(key, bucket);
  }

  const suspiciousFrom = new Set<string>();
  for (const [fromNorm, bucket] of byFrom) {
    if (bucket.targets.size >= 2 || bucket.chinese.size >= 2) suspiciousFrom.add(fromNorm);
  }

  if (suspiciousFrom.size === 0) return rows;

  return rows.filter((row) => !suspiciousFrom.has(normalizeViLabel(row.from)));
}

export function buildDictReplacementPreview(
  entries: { chinese: string; vietnamese: string }[],
  chapters: Pick<Chapter, "id" | "title" | "sourceText" | "translatedText">[]
): DictReplacePreviewRow[] {
  const translated = chapters.filter((ch) => ch.translatedText?.trim());
  if (translated.length === 0 || entries.length === 0) return [];

  const slices: ScanChapterSlice[] = translated.map((ch) => ({
    sourceText: ch.sourceText,
    translatedText: ch.translatedText,
  }));

  const rows: DictReplacePreviewRow[] = [];
  const seenIds = new Set<string>();

  for (const entry of entries) {
    const zh = entry.chinese.trim();
    const to = entry.vietnamese.trim();
    if (!isNovelDictImportEligible(zh, to)) continue;

    const candidates = collectDictReplaceFromCandidates(zh, slices);

    for (const variant of candidates) {
      const from = variant.trim();
      if (!from || !isValidDictReplaceFrom(zh, from, to)) continue;

      const { occurrences, chapterCount } = countReplacementOnAlignedLines(zh, from, translated);
      if (occurrences === 0) continue;

      const id = `${zh}\0${from}\0${to}`;
      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const confidence = classifyDictReplaceConfidence(zh, from, to, slices);

      rows.push({
        id,
        chinese: zh,
        from,
        to,
        occurrences,
        chapterCount,
        confidence,
        selected: confidence === "high",
      });
    }
  }

  return filterSuspiciousPreviewRows(rows).sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
    return b.occurrences - a.occurrences;
  });
}

export function applyReplacementsToChapters(
  chapters: Pick<Chapter, "id" | "translatedText">[],
  replacements: { from: string; to: string }[]
): { chapterId: string; translatedText: string }[] {
  const sorted = [...replacements]
    .filter((r) => r.from.trim() && r.to.trim() && r.from !== r.to)
    .sort((a, b) => b.from.length - a.from.length);

  if (sorted.length === 0) return [];

  const updates: { chapterId: string; translatedText: string }[] = [];

  for (const ch of chapters) {
    const original = ch.translatedText;
    if (!original?.trim()) continue;

    let text = original;
    for (const { from, to } of sorted) {
      text = replaceAllExact(text, from, to);
    }
    if (text !== original) {
      updates.push({ chapterId: ch.id, translatedText: text });
    }
  }

  return updates;
}
