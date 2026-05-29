import type { DictItem, PronounMapping } from "../types";

/** Giới hạn dict gửi kèm mỗi request — tránh phình token (2B). */
export const MAX_DICT_CONTEXT_CHARS = 12_000;
export const CHUNK_DICT_CONTEXT_MAX_CHARS = 2_800;

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

const normalizeCjk = (value: string): string => value.trim().replace(/\s+/g, "");

const getDictSourceToken = (line: string): string => {
  const arrowIndex = line.indexOf("->");
  if (arrowIndex < 0) return "";
  return normalizeCjk(line.slice(0, arrowIndex));
};

const looksLikePronounOrCoreRule = (zh: string): boolean => {
  if (!zh) return false;
  if (zh.length <= 2) return true;
  return /们$/.test(zh) || /位$/.test(zh);
};

/**
 * Chuẩn hóa dictContext trước khi ghép vào system prompt:
 * - trim dòng
 * - loại dòng trùng tuyệt đối
 * - giữ nguyên thứ tự để không đảo ưu tiên do người dùng thiết lập.
 */
export const normalizeDictContextForPrompt = (dictContext?: string): string => {
  const raw = dictContext?.trim();
  if (!raw) return "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const normalized = line.trim().replace(/\s+/g, " ");
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out.join("\n");
};

/**
 * Chỉ lấy phần dict liên quan trực tiếp đến chunk hiện tại để giảm token:
 * - luôn giữ nhóm quy tắc ngắn/cốt lõi (đại từ, từ ngắn)
 * - thêm các mục thật sự xuất hiện trong chunk
 * - nếu vẫn còn trống thì lấy thêm từ đầu danh sách theo thứ tự ưu tiên có sẵn.
 */
export const selectDictContextForChunk = (
  dictContext: string | undefined,
  sourceChunk: string,
  maxChars = CHUNK_DICT_CONTEXT_MAX_CHARS
): string => {
  const normalizedDict = normalizeDictContextForPrompt(dictContext);
  if (!normalizedDict) return "";

  const lines = normalizedDict.split("\n").map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  const sourceNormalized = normalizeCjk(sourceChunk);
  const pinned: string[] = [];
  const matched: string[] = [];
  const fallback: string[] = [];

  for (const line of lines) {
    const zh = getDictSourceToken(line);
    if (!zh) continue;
    if (looksLikePronounOrCoreRule(zh)) {
      pinned.push(line);
      continue;
    }
    if (sourceNormalized.includes(zh)) {
      matched.push(line);
      continue;
    }
    fallback.push(line);
  }

  const selected: string[] = [];
  let used = 0;
  const push = (line: string): boolean => {
    const extra = selected.length === 0 ? line.length : line.length + 1;
    if (used + extra > maxChars) return false;
    selected.push(line);
    used += extra;
    return true;
  };

  for (const line of pinned) {
    if (!push(line)) break;
  }
  for (const line of matched) {
    if (!push(line)) break;
  }
  for (const line of fallback) {
    if (!push(line)) break;
  }

  return selected.join("\n");
};
