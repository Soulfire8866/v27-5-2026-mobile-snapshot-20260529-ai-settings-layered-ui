import type { DictItem, PronounMapping } from "../types";

/** Giới hạn dict gửi kèm mỗi request — tránh phình token (2B). */
export const MAX_DICT_CONTEXT_CHARS = 12_000;

const scoreDictItem = (item: DictItem, novelId?: string): number => {
  let score = 0;
  if (novelId && item.novelId === novelId) score += 40;
  if (item.category === "name") score += 30;
  if (item.category === "sect" || item.category === "history") score += 15;
  if (!item.novelId) score += 5;
  return score;
};

export function buildDictContextString(opts: {
  dictItems: DictItem[];
  pronounMappings: PronounMapping[];
  novelId?: string;
  maxChars?: number;
}): string {
  const maxChars = opts.maxChars ?? MAX_DICT_CONTEXT_CHARS;
  const lines: string[] = [];
  let used = 0;

  const pushLine = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    const extra = (lines.length > 0 ? 1 : 0) + trimmed.length;
    if (used + extra > maxChars) return false;
    lines.push(trimmed);
    used += extra;
    return true;
  };

  const relevant = opts.dictItems
    .filter((item) => item.chinese?.trim() && item.vietnamese?.trim())
    .filter((item) => !item.novelId || item.novelId === opts.novelId)
    .sort((a, b) => scoreDictItem(b, opts.novelId) - scoreDictItem(a, opts.novelId));

  // Dedupe theo «Hán tự» để tránh prompt bị mâu thuẫn (Chung vs Riêng).
  // Vì `relevant` đã được sort theo score (Riêng thắng), item đầu tiên sẽ là ưu tiên nhất.
  const deduped: DictItem[] = [];
  const seenZh = new Set<string>();
  for (const item of relevant) {
    const zh = item.chinese.trim();
    if (seenZh.has(zh)) continue;
    seenZh.add(zh);
    deduped.push(item);
  }

  for (const item of deduped) {
    if (!pushLine(`${item.chinese.trim()} -> ${item.vietnamese.trim()}`)) break;
  }

  for (const p of opts.pronounMappings) {
    if (!p.chinese?.trim() || !p.vietnamese?.trim()) continue;
    if (!pushLine(`${p.chinese.trim()} -> ${p.vietnamese.trim()}`)) break;
  }

  return lines.join("\n");
}
