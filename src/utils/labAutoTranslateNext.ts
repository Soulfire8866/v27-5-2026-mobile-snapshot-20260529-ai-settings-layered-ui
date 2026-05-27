/**
 * Sau khi Lab dịch xong chương C — tự queue dịch chương C+1 nếu bật «Tự dịch chương kế» (1C).
 */

import type { Chapter, Novel, TranslationSettings } from "../types";
import { buildDictContextString } from "./dictContextBuilder";
import { isReaderAutoTranslateEnabled, runAutoTranslateNextChapter } from "./readerAutoTranslateNext";
import { logTranslationTelemetry } from "./translationTelemetry";
import type { ChapterTranslationResult } from "./chapterTranslationEngine";

export type MaybeLabAutoTranslateNextParams = {
  novel: Novel;
  sourceChapter: Chapter;
  settings: TranslationSettings;
  dictItems: Parameters<typeof buildDictContextString>[0]["dictItems"];
  pronounMappings: Parameters<typeof buildDictContextString>[0]["pronounMappings"];
  onChapterTranslated: (chapterId: string, result: ChapterTranslationResult) => Promise<void>;
};

export function maybeQueueLabAutoTranslateNextAfterLab(
  params: MaybeLabAutoTranslateNextParams
): void {
  const { novel, sourceChapter, settings, dictItems, pronounMappings, onChapterTranslated } =
    params;

  if (!isReaderAutoTranslateEnabled(settings)) return;

  const idx = novel.chapters.findIndex((c) => c.id === sourceChapter.id);
  if (idx < 0 || idx >= novel.chapters.length - 1) return;

  const nextChapter = novel.chapters[idx + 1];
  if (nextChapter.translatedText?.trim()) {
    logTranslationTelemetry("auto_next_skip", {
      reason: "already-translated",
      sourceChapterId: sourceChapter.id,
      targetChapterId: nextChapter.id,
    });
    return;
  }

  const dictContext = buildDictContextString({
    dictItems,
    pronounMappings,
    novelId: novel.id,
  });

  logTranslationTelemetry("auto_next_start", {
    sourceChapterId: sourceChapter.id,
    targetChapterId: nextChapter.id,
    targetTitle: nextChapter.title,
    trigger: "lab_after_translate",
  });

  void runAutoTranslateNextChapter({
    novel,
    sourceChapter,
    settings,
    apiKeys: settings.apiKeys,
    dictContext,
    onChapterTranslated,
  }).then((result) => {
    if ("reason" in result) {
      logTranslationTelemetry("auto_next_skip", {
        reason: result.reason,
        sourceChapterId: sourceChapter.id,
        targetChapterId: nextChapter.id,
        trigger: "lab_after_translate",
      });
      return;
    }
    if (result.ok) {
      logTranslationTelemetry("auto_next_done", {
        sourceChapterId: sourceChapter.id,
        targetChapterId: nextChapter.id,
        trigger: "lab_after_translate",
      });
    }
  });
}
