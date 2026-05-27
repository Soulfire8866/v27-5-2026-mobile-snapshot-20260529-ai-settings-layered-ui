import { Chapter } from "../types";
import { deleteValue, getValue } from "../lib/persistence";

/**
 * Ghép bản dịch từng trang (Phòng Đọc) thành translatedText chương (Lab Dịch).
 * Trả về null nếu chưa đủ trang.
 */
export const mergePageTranslationsIfComplete = async (
  chapter: Chapter
): Promise<string | null> => {
  if (chapter.translatedText?.trim()) {
    return chapter.translatedText;
  }

  const cachedPages = await getValue(`page_trans_${chapter.id}`).catch(() => null);
  if (
    !cachedPages ||
    !Array.isArray(cachedPages) ||
    cachedPages.length === 0 ||
    !cachedPages.every((p) => p && String(p).trim().length > 0)
  ) {
    return null;
  }

  return cachedPages.map((p) => String(p)).join("\n");
};

/** Xóa cache trang sau khi đã gộp vào chương */
export const clearPageTranslationCache = async (chapterId: string): Promise<void> => {
  await deleteValue(`page_trans_${chapterId}`).catch(() => {});
};

export type ChapterReadiness =
  | "lab_full"
  | "reader_pages"
  | "reader_partial"
  | "untranslated";

export type PageTranslationProgress = {
  filled: number;
  total: number;
};

export const getPageTranslationProgress = async (
  chapterId: string
): Promise<PageTranslationProgress | null> => {
  const cachedPages = await getValue(`page_trans_${chapterId}`).catch(() => null);
  if (!cachedPages || !Array.isArray(cachedPages) || cachedPages.length === 0) {
    return null;
  }
  const total = cachedPages.length;
  const filled = cachedPages.filter((p) => p && String(p).trim().length > 0).length;
  return { filled, total };
};

/** Đồng bộ — chỉ biết Lab đã lưu hay chưa */
export const getChapterReadinessSync = (chapter: Chapter): "lab_full" | "untranslated" =>
  chapter.translatedText?.trim() ? "lab_full" : "untranslated";

export const getChapterTranslationReadiness = async (
  chapter: Chapter
): Promise<ChapterReadiness> => {
  if (chapter.translatedText?.trim()) return "lab_full";

  const progress = await getPageTranslationProgress(chapter.id);
  if (!progress || progress.total === 0) return "untranslated";
  if (progress.filled === progress.total) return "reader_pages";
  if (progress.filled > 0) return "reader_partial";
  return "untranslated";
};

export const buildChapterReadinessMap = async (
  chapters: Chapter[]
): Promise<Record<string, ChapterReadiness>> => {
  const pairs = await Promise.all(
    chapters.map(async (ch) => [ch.id, await getChapterTranslationReadiness(ch)] as const)
  );
  return Object.fromEntries(pairs);
};

export const READINESS_BADGE: Record<
  ChapterReadiness,
  { label: string; title: string; className: string }
> = {
  lab_full: {
    label: "Lab ✓",
    title: "Đã có bản dịch Lab (song ngữ đầy đủ)",
    className:
      "bg-emerald-600/12 text-emerald-800 dark:text-emerald-300 border-emerald-600/30",
  },
  reader_pages: {
    label: "Ghép",
    title: "Phòng Đọc đã dịch đủ trang — có thể ghép vào Lab",
    className: "bg-sky-600/12 text-sky-800 dark:text-sky-300 border-sky-600/30",
  },
  reader_partial: {
    label: "Đọc dở",
    title: "Đang dịch từng trang trong Phòng Đọc",
    className: "bg-amber-600/12 text-amber-900 dark:text-amber-200 border-amber-600/30",
  },
  untranslated: {
    label: "Chưa dịch",
    title: "Chưa có bản dịch Lab hoặc trang đọc",
    className:
      "bg-app-surface-muted text-app-text-muted border-app-border",
  },
};
