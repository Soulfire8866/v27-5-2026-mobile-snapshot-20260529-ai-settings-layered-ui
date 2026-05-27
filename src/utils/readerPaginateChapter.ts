import type { TranslationSettings } from "../types";
import {
  paginateChapterText,
  type PageContent,
  type PaginateMeasureOptions,
} from "./readerPagination";
import { paginateChapterTextDom } from "./readerDomPagination";

export type PaginateOptions = {
  widthIsContentBox?: boolean;
  heightReservePx?: number;
  measureRoot?: HTMLElement | null;
  /** Bỏ qua đo DOM (tránh treo main thread trên mobile/APK). */
  skipDomMeasure?: boolean;
};

export function paginateChapter(
  translatedText: string,
  settings: TranslationSettings,
  containerHeight: number = 600,
  containerWidth: number = 800,
  options?: PaginateOptions
): PageContent[] {
  if (
    !options?.skipDomMeasure &&
    typeof document !== "undefined" &&
    options?.measureRoot
  ) {
    const domPages = paginateChapterTextDom(translatedText, settings, {
      contentWidth: containerWidth,
      contentHeight: containerHeight,
      heightReservePx: options.heightReservePx,
      measureRoot: options.measureRoot,
    });
    if (domPages.length > 0) return domPages;
  }

  const measureOpts: PaginateMeasureOptions = {
    widthIsContentBox: options?.widthIsContentBox,
    heightReservePx: options?.heightReservePx,
  };
  return paginateChapterText(
    translatedText,
    settings,
    containerHeight,
    containerWidth,
    measureOpts
  );
}
