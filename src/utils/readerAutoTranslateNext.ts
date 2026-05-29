import { Chapter, Novel, TranslationSettings } from "../types";
import type { ChapterTranslationResult } from "./chapterTranslationEngine";

export const READER_AUTO_TRANSLATE_MIN_DELAY_SEC = 10;
export const READER_AUTO_TRANSLATE_DEFAULT_DELAY_SEC = 30;

/** Cách người dùng chuyển chương — quyết định bật chế độ tuần tự (phương án A). */
export type ChapterNavKind = "adjacent-next" | "adjacent-prev" | "jump" | "initial";

export const clampAutoTranslateDelaySec = (value: number): number => {
  if (!Number.isFinite(value)) return READER_AUTO_TRANSLATE_DEFAULT_DELAY_SEC;
  return Math.max(READER_AUTO_TRANSLATE_MIN_DELAY_SEC, Math.floor(value));
};

export const getAutoTranslateDelaySec = (settings: TranslationSettings): number =>
  clampAutoTranslateDelaySec(
    settings.readerAutoTranslateNextDelaySec ?? READER_AUTO_TRANSLATE_DEFAULT_DELAY_SEC
  );

export const isReaderAutoTranslateEnabled = (settings: TranslationSettings): boolean =>
  settings.readerAutoTranslateNextEnabled === true;

export function shouldArmSequentialAfterNav(kind: ChapterNavKind): boolean {
  return kind === "adjacent-next" || kind === "adjacent-prev";
}

export function resolveChapterNavKind(
  fromIndex: number,
  toIndex: number,
  explicit?: ChapterNavKind
): ChapterNavKind {
  if (explicit) return explicit;
  if (fromIndex < 0 || toIndex < 0) return "initial";
  if (toIndex === fromIndex + 1) return "adjacent-next";
  if (toIndex === fromIndex - 1) return "adjacent-prev";
  return "jump";
}

const inFlightKeys = new Set<string>();
const triggeredSourceKeys = new Set<string>();

export const resetReaderAutoTranslateSession = (): void => {
  inFlightKeys.clear();
  triggeredSourceKeys.clear();
};

const pairKey = (novelId: string, sourceChapterId: string) => `${novelId}:${sourceChapterId}`;
const targetKey = (novelId: string, targetChapterId: string) => `${novelId}:target:${targetChapterId}`;

export type RunAutoTranslateNextParams = {
  novel: Novel;
  sourceChapter: Chapter;
  settings: TranslationSettings;
  apiKeys: TranslationSettings["apiKeys"];
  dictContext: string;
  onChapterTranslated: (chapterId: string, result: ChapterTranslationResult) => Promise<void>;
};

/**
 * Dịch chương kế (index+1) theo pipeline Lab — một lần cho mỗi cặp (truyện, chương nguồn).
 */
export type AutoTranslateNextResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

export async function runAutoTranslateNextChapter(
  params: RunAutoTranslateNextParams
): Promise<AutoTranslateNextResult> {
  const { novel, sourceChapter, settings, apiKeys, dictContext, onChapterTranslated } = params;
  const sourceIdx = novel.chapters.findIndex((c) => c.id === sourceChapter.id);
  if (sourceIdx < 0 || sourceIdx >= novel.chapters.length - 1) {
    return { ok: false as const, reason: "no-next" };
  }

  const nextChapter = novel.chapters[sourceIdx + 1];
  if (nextChapter.translatedText?.trim()) {
    return { ok: false as const, reason: "already-translated" };
  }

  const srcKey = pairKey(novel.id, sourceChapter.id);
  if (triggeredSourceKeys.has(srcKey)) {
    return { ok: false as const, reason: "already-scheduled" };
  }

  const tgtKey = targetKey(novel.id, nextChapter.id);
  if (inFlightKeys.has(tgtKey)) {
    return { ok: false as const, reason: "in-flight" };
  }

  triggeredSourceKeys.add(srcKey);
  inFlightKeys.add(tgtKey);

  try {
    const { translateChapter } = await import("./chapterTranslationEngine");
    const result = await translateChapter({
      sourceText: nextChapter.sourceText,
      chapterTitle: nextChapter.title,
      model: settings.selectedModel,
      temperature: settings.temperature,
      apiKeys,
      prompt1: settings.prompt1,
      prompt2: settings.prompt2,
      dictContext,
      settings,
      priority: "low",
    });
    await onChapterTranslated(nextChapter.id, result);
    return { ok: true as const };
  } catch (err: unknown) {
    triggeredSourceKeys.delete(srcKey);
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false as const, reason: message };
  } finally {
    inFlightKeys.delete(tgtKey);
  }
}

export const canAccumulateDwellTime = (opts: {
  enabled: boolean;
  isReaderTabActive: boolean;
  sequentialArmed: boolean;
  documentHidden: boolean;
  chapterDrawerOpen: boolean;
  settingsOpen: boolean;
}): boolean => {
  if (!opts.enabled) return false;
  if (!opts.isReaderTabActive) return false;
  if (!opts.sequentialArmed) return false;
  if (opts.documentHidden) return false;
  if (opts.chapterDrawerOpen) return false;
  if (opts.settingsOpen) return false;
  return true;
};
