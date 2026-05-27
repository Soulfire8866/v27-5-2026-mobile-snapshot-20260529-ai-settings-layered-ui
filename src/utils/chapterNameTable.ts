import type { DictItem } from "../types";

export type ChapterNameRow = {
  vietnamese: string;
  count: number;
  /** Gợi ý Hán tự theo dòng (nếu tìm được) */
  chineseGuess?: string;
  /** Dòng gốc/dịch chứa cụm (để người dùng kiểm tra) */
  sourceLine?: string;
  translatedLine?: string;
  lineIndex?: number;
  /** Đã có trong từ điển chưa */
  alreadyInDict?: boolean;
};

export function extractChineseCandidates(sourceLine: string): string[] {
  if (!sourceLine?.trim()) return [];
  const matches = sourceLine.match(/[\u4e00-\u9fff]{2,}/g) ?? [];
  // ưu tiên cụm dài hơn
  return matches
    .map((m) => m.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

export function isAlreadyInDict(chinese: string, vietnamese: string, dictItems: DictItem[], novelId?: string): boolean {
  const zh = chinese.trim();
  const vi = vietnamese.trim();
  if (!zh || !vi) return false;
  return dictItems.some((it) => {
    if (!it.chinese?.trim() || !it.vietnamese?.trim()) return false;
    if (novelId && it.novelId && it.novelId !== novelId) return false;
    return it.chinese.trim() === zh && it.vietnamese.trim() === vi;
  });
}

