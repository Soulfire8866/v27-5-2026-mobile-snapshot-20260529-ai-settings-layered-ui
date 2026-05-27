/**
 * Phân trang Phòng Đọc bằng đo DOM thật (1A) — khớp font, indent, justify, margin đoạn.
 */

import type { TranslationSettings } from "../types";
import { snapSplitIndexToWordBoundary } from "./readerPagination";
import type { PageContent, PageParagraph } from "./readerPagination";
import {
  getReaderAlignmentClass,
  getReaderFontClass,
  getReaderLineHeightPx,
  READER_TEXT_INDENT_EM,
} from "./readerTypography";

/** Dự phòng đáy: không để dòng cụt khi render thật lệch vài px. */
export const READER_DOM_BOTTOM_LINE_BUFFER = 1.15;

export type DomPaginateOptions = {
  contentWidth: number;
  contentHeight: number;
  heightReservePx?: number;
  measureRoot?: HTMLElement | null;
};

function ensureMeasureHost(root: HTMLElement): HTMLElement {
  let host = root.querySelector<HTMLElement>("[data-reader-measure-page]");
  if (!host) {
    host = document.createElement("div");
    host.setAttribute("data-reader-measure-page", "true");
    host.style.cssText =
      "position:absolute;left:-99999px;top:0;visibility:hidden;pointer-events:none;overflow:hidden;box-sizing:border-box;";
    root.appendChild(host);
  }
  return host;
}

function createMeasureParagraph(
  text: string,
  settings: TranslationSettings,
  marginBottomPx: number
): HTMLParagraphElement {
  const p = document.createElement("p");
  p.className = "leading-relaxed";
  p.style.fontSize = `${settings.readerFontSize || 16}px`;
  p.style.lineHeight = String(settings.readerLineHeight || 1.6);
  p.style.marginBottom = `${marginBottomPx}px`;
  p.style.textIndent = `${READER_TEXT_INDENT_EM}em`;
  p.style.whiteSpace = "pre-wrap";
  p.style.wordBreak = "break-word";
  p.textContent = text;
  return p;
}

function renderPageIntoHost(
  host: HTMLElement,
  settings: TranslationSettings,
  paragraphs: PageParagraph[],
  widthPx: number,
  maxHeightPx: number
): void {
  host.innerHTML = "";
  host.style.width = `${widthPx}px`;
  host.style.height = `${maxHeightPx}px`;
  host.style.maxHeight = `${maxHeightPx}px`;
  host.style.overflow = "hidden";
  host.style.fontSize = `${settings.readerFontSize || 16}px`;
  host.style.lineHeight = String(settings.readerLineHeight || 1.6);
  host.className = `${getReaderFontClass(settings.readerFont)} ${getReaderAlignmentClass(settings.readerAlignment)}`;

  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i];
    const isLast = i === paragraphs.length - 1;
    const marginBottom = isLast ? 0 : settings.readerParagraphSpacing ?? 18;
    host.appendChild(createMeasureParagraph(para.text, settings, marginBottom));
  }
}

function measurePageScrollHeight(
  host: HTMLElement,
  settings: TranslationSettings,
  paragraphs: PageParagraph[],
  widthPx: number,
  maxHeightPx: number
): number {
  renderPageIntoHost(host, settings, paragraphs, widthPx, maxHeightPx);
  return host.scrollHeight;
}

function splitParagraphToFitDom(
  host: HTMLElement,
  settings: TranslationSettings,
  existing: PageParagraph[],
  remaining: string,
  originalIndex: number,
  widthPx: number,
  maxHeightPx: number
): { head: string; tail: string } {
  const trimmed = remaining.trim();
  if (!trimmed) return { head: "", tail: "" };

  const fullH = measurePageScrollHeight(
    host,
    settings,
    [...existing, { text: trimmed, originalIndex }],
    widthPx,
    maxHeightPx
  );
  if (fullH <= maxHeightPx) {
    return { head: trimmed, tail: "" };
  }

  let lo = 1;
  let hi = trimmed.length;
  let best = 0;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const snapped = snapSplitIndexToWordBoundary(trimmed, mid);
    const headRaw = trimmed.slice(0, snapped).trimEnd();
    if (!headRaw) {
      lo = mid + 1;
      continue;
    }

    const h = measurePageScrollHeight(
      host,
      settings,
      [...existing, { text: headRaw, originalIndex }],
      widthPx,
      maxHeightPx
    );

    if (h <= maxHeightPx) {
      best = snapped;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (best <= 0) {
    return { head: "", tail: trimmed };
  }

  const head = trimmed.slice(0, best).trimEnd();
  const tail = trimmed.slice(best).trimStart();
  return { head, tail };
}

/**
 * Phân trang theo chiều cao pixel thật. Trả [] nếu không có DOM / root.
 */
export function paginateChapterTextDom(
  translatedText: string,
  settings: TranslationSettings,
  options: DomPaginateOptions
): PageContent[] {
  if (!translatedText?.trim()) return [];
  if (typeof document === "undefined") return [];

  const root = options.measureRoot ?? document.body;
  const host = ensureMeasureHost(root);

  const widthPx = Math.max(200, Math.floor(options.contentWidth));
  const lineHeightPx = getReaderLineHeightPx(settings);
  const bottomBuffer = Math.ceil(lineHeightPx * READER_DOM_BOTTOM_LINE_BUFFER);
  const bannerReserve = options.heightReservePx ?? 0;
  const maxHeightPx = Math.max(
    lineHeightPx * 2,
    Math.floor(options.contentHeight) - bottomBuffer
  );

  const rawParagraphs = translatedText.split("\n");
  const pages: PageContent[] = [];
  let currentPage: PageContent = { paragraphs: [] };
  let isFirstPage = true;

  const pushPage = () => {
    if (currentPage.paragraphs.length > 0) {
      pages.push(currentPage);
      currentPage = { paragraphs: [] };
      isFirstPage = false;
    }
  };

  const pageBudget = () =>
    isFirstPage && bannerReserve > 0 ? maxHeightPx - bannerReserve : maxHeightPx;

  const currentScrollHeight = () =>
    measurePageScrollHeight(host, settings, currentPage.paragraphs, widthPx, pageBudget());

  for (let idx = 0; idx < rawParagraphs.length; idx++) {
    let remaining = rawParagraphs[idx].trim();
    if (!remaining) continue;

    while (remaining) {
      const budget = pageBudget();
      const used = currentScrollHeight();
      const spaceLeft = budget - used;

      if (spaceLeft < lineHeightPx * READER_DOM_BOTTOM_LINE_BUFFER) {
        pushPage();
        continue;
      }

      const candidate: PageParagraph = { text: remaining, originalIndex: idx };
      const withCandidate = [...currentPage.paragraphs, candidate];
      const candidateH = measurePageScrollHeight(host, settings, withCandidate, widthPx, budget);

      if (candidateH <= budget) {
        currentPage.paragraphs.push(candidate);
        remaining = "";
        continue;
      }

      if (currentPage.paragraphs.length === 0) {
        const { head, tail } = splitParagraphToFitDom(
          host,
          settings,
          [],
          remaining,
          idx,
          widthPx,
          budget
        );

        if (!head) {
          pushPage();
          continue;
        }

        currentPage.paragraphs.push({ text: head, originalIndex: idx });
        remaining = tail;
        pushPage();
        continue;
      }

      pushPage();
    }
  }

  pushPage();
  return pages;
}
