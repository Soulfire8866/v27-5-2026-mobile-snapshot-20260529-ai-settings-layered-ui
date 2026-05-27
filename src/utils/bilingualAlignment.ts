/**
 * Tra cứu cụm tiếng Việt đã chọn → Hán tự gốc + dòng song ngữ (Lab Dịch),
 * không gọi API. Giả định CompareView/Lab Dịch giữ 1 dòng Trung ≈ 1 dòng Việt.
 */

export type BilingualLookupSource = "dict" | "line" | "line-fuzzy" | "paragraph" | "none";

export interface BilingualSelectionMatch {
  chinese: string;
  chineseLine: string;
  vietnameseLine: string;
  lineIndex: number;
  source: BilingualLookupSource;
  confidence: number;
}

const normalizeForMatch = (s: string): string =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,/#!$%^&*;:{}=_`~()?"'\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const stripPunctuation = (s: string) => s.replace(/[，。！？、；：""''（）【】《》\s]/g, "");

function findLineIndexContaining(
  lines: string[],
  selected: string
): { index: number; score: number } | null {
  const selNorm = normalizeForMatch(selected);
  if (!selNorm) return null;

  let bestIdx = -1;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const lineNorm = normalizeForMatch(line);

    if (lineNorm === selNorm) {
      return { index: i, score: 100 };
    }
    if (lineNorm.includes(selNorm)) {
      // Cụm ngắn trong dòng dài vẫn là khớp tin cậy (vd. "Sơn Vương" trong cả câu)
      const ratioScore = (selNorm.length / Math.max(lineNorm.length, 1)) * 90;
      const score = Math.max(88, ratioScore);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
      continue;
    }

    const selWords = selNorm.split(/\s+/).filter((w) => w.length > 1);
    if (selWords.length === 0) continue;
    const lineWords = new Set(lineNorm.split(/\s+/).filter((w) => w.length > 1));
    let overlap = 0;
    for (const w of selWords) {
      if (lineWords.has(w)) overlap++;
    }
    if (overlap > 0) {
      const score = (overlap / selWords.length) * 70;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }
  }

  if (bestIdx < 0 || bestScore < 35) return null;
  return { index: bestIdx, score: bestScore };
}

/** Các cụm Hán 2–4 chữ trong một dòng (cửa sổ trượt, tránh gom quá dài) */
function listHanSpans(line: string): { text: string; center: number }[] {
  const spans: { text: string; center: number }[] = [];
  const re = /[\u4e00-\u9fa5]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const run = m[0];
    const maxLen = Math.min(4, run.length);
    for (let len = 2; len <= maxLen; len++) {
      for (let i = 0; i <= run.length - len; i++) {
        spans.push({
          text: run.slice(i, i + len),
          center: m.index + i + len / 2,
        });
      }
    }
  }
  return spans;
}

/** Trích đoạn Hán tương ứng với cụm Việt trong cùng một dòng (cùng chỉ số Lab Dịch) */
function splitClauses(text: string, kind: "han" | "vi"): string[] {
  const re = kind === "han" ? /[，。！？；：、]/ : /[,.!?:;]/;
  return text
    .split(re)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractChineseSpanInPair(
  chinesePart: string,
  vietnamesePart: string,
  selectedVietnamese: string
): string | null {
  const zh = chinesePart.trim();
  const vi = vietnamesePart.trim();
  const sel = selectedVietnamese.trim();
  if (!zh || !vi || !sel) return null;
  if (normalizeForMatch(sel) === normalizeForMatch(vi)) {
    return zh;
  }
  if (!normalizeForMatch(vi).includes(normalizeForMatch(sel))) {
    return null;
  }

  const selStart = vi.toLowerCase().indexOf(sel.toLowerCase());
  if (selStart < 0) return null;

  const selWordCount = sel.split(/\s+/).filter((w) => w.trim()).length;
  const targetLen =
    selWordCount >= 2
      ? Math.min(4, Math.max(2, selWordCount))
      : Math.min(4, Math.max(2, Array.from(sel).filter((c) => c.trim()).length));

  const ratio = (selStart + sel.length / 2) / Math.max(vi.length, 1);
  const hanStr = [...zh].filter((c) => /[\u4e00-\u9fa5]/.test(c)).join("");
  if (!hanStr) return null;

  const hanSuffixes = ["之名", "称为", "叫做"];
  if (ratio >= 0.55 && selStart + sel.length >= vi.length - 4) {
    for (const suf of hanSuffixes) {
      if (!hanStr.endsWith(suf)) continue;
      const stem = hanStr.slice(0, -suf.length);
      if (stem.length >= targetLen) {
        return stem.slice(stem.length - targetLen);
      }
    }
  }

  const centerHanIdx = ratio * hanStr.length;
  const spans = listHanSpans(zh);
  if (spans.length === 0) {
    const start = Math.max(
      0,
      Math.min(hanStr.length - targetLen, Math.round(centerHanIdx - targetLen / 2))
    );
    return hanStr.slice(start, start + targetLen);
  }

  const centerZh = ratio * zh.length;
  let best = spans[0];
  let bestScore = Infinity;
  for (const span of spans) {
    const dist = Math.abs(span.center - centerZh);
    const lenPenalty = Math.abs(span.text.length - targetLen) * 2;
    const score = dist + lenPenalty;
    if (score < bestScore) {
      bestScore = score;
      best = span;
    }
  }
  const text = best.text;
  if (text.length > targetLen + 1) {
    return text.slice(0, Math.max(2, targetLen));
  }
  return text;
}

/** Trích đoạn Hán tương ứng với cụm Việt trong cùng một dòng (cùng chỉ số Lab Dịch) */
function extractChineseSpan(
  chineseLine: string,
  vietnameseLine: string,
  selectedVietnamese: string
): string {
  const zh = chineseLine.trim();
  const vi = vietnameseLine.trim();
  const sel = selectedVietnamese.trim();

  if (!zh) return "";
  if (!sel || normalizeForMatch(sel) === normalizeForMatch(vi)) {
    return zh;
  }

  const selNorm = normalizeForMatch(sel);
  const viClauses = splitClauses(vi, "vi");
  const zhClauses = splitClauses(zh, "han");
  if (viClauses.length > 1 && zhClauses.length > 1) {
    for (let i = 0; i < viClauses.length; i++) {
      if (!normalizeForMatch(viClauses[i]).includes(selNorm)) continue;
      const zhPart =
        zhClauses[Math.min(i, zhClauses.length - 1)] ??
        zhClauses[zhClauses.length - 1] ??
        zh;
      const clauseHit = extractChineseSpanInPair(zhPart, viClauses[i], sel);
      if (clauseHit?.trim()) return clauseHit.trim();
    }
  }

  const wholeLine = extractChineseSpanInPair(zh, vi, sel);
  if (wholeLine?.trim()) return wholeLine.trim();

  const selWordCount = sel.split(/\s+/).filter((w) => w.trim()).length;
  const targetLen =
    selWordCount >= 2
      ? Math.min(4, Math.max(2, selWordCount))
      : Math.min(4, Math.max(2, Array.from(sel).filter((c) => c.trim()).length));

  const hanStr = [...zh].filter((c) => /[\u4e00-\u9fa5]/.test(c)).join("");
  if (hanStr.length >= targetLen) {
    return hanStr.slice(0, targetLen);
  }
  return zh;
}

export type { DictSelectionMatch } from "./dictLookup";
export { lookupSelectionInDict } from "./dictLookup";

/**
 * Khớp cụm Việt đã chọn với bản song ngữ cả chương (Lab Dịch).
 */
export function resolveSelectionFromBilingualChapter(
  selectedVietnamese: string,
  sourceText: string,
  translatedText: string
): BilingualSelectionMatch | null {
  const sel = selectedVietnamese.trim();
  if (!sel || !sourceText?.trim() || !translatedText?.trim()) {
    return null;
  }

  const sourceLines = sourceText.replace(/\r\n/g, "\n").split("\n");
  const transLines = translatedText.replace(/\r\n/g, "\n").split("\n");
  const maxLines = Math.max(sourceLines.length, transLines.length);

  const paddedSource: string[] = [];
  const paddedTrans: string[] = [];
  for (let i = 0; i < maxLines; i++) {
    paddedSource.push(sourceLines[i] ?? "");
    paddedTrans.push(transLines[i] ?? "");
  }

  const hit = findLineIndexContaining(paddedTrans, sel);
  if (!hit) return null;

  const lineIndex = hit.index;
  const viLine = paddedTrans[lineIndex] || "";
  const zhLine = paddedSource[lineIndex] || "";

  let chinese = extractChineseSpan(zhLine, viLine, sel);
  if (!chinese.trim() && zhLine.trim()) {
    chinese = zhLine.trim();
  }
  if (!chinese.trim()) {
    for (const offset of [1, -1, 2, -2]) {
      const adj = lineIndex + offset;
      if (adj >= 0 && adj < maxLines && paddedSource[adj]?.trim()) {
        chinese = paddedSource[adj].trim();
        break;
      }
    }
  }

  if (!chinese.trim()) return null;

  const hanChars = stripPunctuation(chinese);
  if (!hanChars) return null;

  return {
    chinese: chinese.trim(),
    chineseLine: zhLine.trim(),
    vietnameseLine: viLine.trim(),
    lineIndex,
    source: hit.score >= 85 ? "line" : "line-fuzzy",
    confidence: hit.score,
  };
}
