import type { TranslationSettings } from "../types";

export type PageParagraph = { text: string; originalIndex: number };
export type PageContent = { paragraphs: PageParagraph[] };

export const READER_PAGE_MIN_FILL_RATIO = 0.92;
const READER_MIN_FRAGMENT_LINES = 1.15;

/** Trừ thêm khi đo trang (0 = dùng padY khung đọc; tăng nếu vẫn clip đáy). */
export const PAGINATION_BOTTOM_LINE_RESERVE = 0;

/** Dự phòng gesture bar đáy khi phân trang (px). */
export const READER_MOBILE_SAFE_BOTTOM_PX = 10;

export type PaginateMeasureOptions = {
  widthIsContentBox?: boolean;
  /** Trừ chiều cao banner (vd. «Chưa dịch Lab») trước khi phân trang */
  heightReservePx?: number;
  /** Trừ thêm đáy safe-area / gesture bar */
  safeAreaBottomPx?: number;
};

export function resolvePaginateLayout(
  settings: TranslationSettings,
  containerWidth: number,
  containerHeight: number,
  options?: PaginateMeasureOptions
) {
  const actualWidth = options?.widthIsContentBox
    ? containerWidth
    : containerWidth * ((settings.readerWidth || 92) / 100);
  const fontSize = settings.readerFontSize || 16;
  const lineHeight = settings.readerLineHeight || 1.6;
  const paragraphSpacing = settings.readerParagraphSpacing ?? 20;
  const avgCharWidth = fontSize * 0.48;
  const charsPerLine = Math.max(15, Math.floor(actualWidth / avgCharWidth));
  const lineHeightPx = fontSize * lineHeight;
  const reserve = options?.heightReservePx ?? 0;
  const safeBottom = options?.safeAreaBottomPx ?? 0;
  const maxHeight = Math.max(120, containerHeight - 12 - reserve - safeBottom);
  const minFillHeight = maxHeight * READER_PAGE_MIN_FILL_RATIO;

  return { charsPerLine, lineHeightPx, paragraphSpacing, maxHeight, minFillHeight };
}

export function measureParagraphHeight(
  text: string,
  charsPerLine: number,
  lineHeightPx: number,
  paragraphSpacing: number
): number {
  if (!text.trim()) return 0;
  const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
  return lines * lineHeightPx + paragraphSpacing;
}

const isWordChar = (char: string) => !!char && /[\p{L}\p{N}]/u.test(char);

/** Không cắt giữa từ — lùi về khoảng trắng / dấu câu trước điểm cắt. */
export function snapSplitIndexToWordBoundary(text: string, charIndex: number): number {
  if (!text || charIndex <= 0) return 0;
  if (charIndex >= text.length) return text.length;

  if (!isWordChar(text[charIndex - 1]) || !isWordChar(text[charIndex])) {
    return charIndex;
  }

  let boundary = charIndex;
  while (boundary > 0 && isWordChar(text[boundary - 1])) {
    boundary--;
  }

  if (boundary === 0) {
    let forward = charIndex;
    while (forward < text.length && isWordChar(text[forward])) {
      forward++;
    }
    return forward < text.length ? forward : charIndex;
  }

  return boundary;
}

/** Cắt đoạn văn để vừa chiều cao còn lại (ưu tiên theo câu, sau đó theo ký tự). */
export function splitTextToFitHeight(
  text: string,
  maxHeight: number,
  charsPerLine: number,
  lineHeightPx: number,
  paragraphSpacing: number
): { head: string; tail: string } {
  const trimmed = text.trim();
  if (!trimmed) return { head: "", tail: "" };
  if (measureParagraphHeight(trimmed, charsPerLine, lineHeightPx, 0) <= maxHeight) {
    return { head: trimmed, tail: "" };
  }

  const lineReserve = PAGINATION_BOTTOM_LINE_RESERVE * lineHeightPx;
  const budget = Math.max(lineHeightPx, maxHeight - paragraphSpacing - lineReserve);
  const sentences = trimmed.match(/[^.!?…。！？]+[.!?…。！？]+(\s*|$)|.+$/g) || [trimmed];
  let head = "";
  let consumed = 0;

  for (const sentence of sentences) {
    const candidate = head + sentence;
    const h = measureParagraphHeight(candidate, charsPerLine, lineHeightPx, 0);
    if (h <= budget) {
      head = candidate;
      consumed += sentence.length;
    } else {
      break;
    }
  }

  if (head.trim()) {
    const tail = trimmed.slice(head.length).trim();
    return { head: head.trim(), tail };
  }

  let lo = 1;
  let hi = trimmed.length;
  let best = 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = trimmed.slice(0, mid);
    if (measureParagraphHeight(slice, charsPerLine, lineHeightPx, 0) <= budget) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const snapped = snapSplitIndexToWordBoundary(trimmed, best);
  const headRaw = trimmed.slice(0, snapped).trimEnd();
  const tailRaw = trimmed.slice(snapped).trimStart();
  if (!headRaw) {
    return { head: "", tail: trimmed };
  }
  return { head: headRaw, tail: tailRaw };
}

export function paginateChapterText(
  translatedText: string,
  settings: TranslationSettings,
  containerHeight: number,
  containerWidth: number,
  options?: PaginateMeasureOptions
): PageContent[] {
  if (!translatedText?.trim()) return [];

  const { charsPerLine, lineHeightPx, paragraphSpacing, maxHeight, minFillHeight } =
    resolvePaginateLayout(settings, containerWidth, containerHeight, options);

  const rawParagraphs = translatedText.split("\n");
  const pages: PageContent[] = [];
  let currentPage: PageContent = { paragraphs: [] };
  let currentHeight = 0;

  const pushPage = () => {
    if (currentPage.paragraphs.length > 0) {
      pages.push(currentPage);
      currentPage = { paragraphs: [] };
      currentHeight = 0;
    }
  };

  for (let idx = 0; idx < rawParagraphs.length; idx++) {
    let remaining = rawParagraphs[idx].trim();
    if (!remaining) continue;

    while (remaining) {
      const spaceLeft = maxHeight - currentHeight;
      if (spaceLeft < lineHeightPx * 1.2) {
        pushPage();
        continue;
      }

      const fullHeight = measureParagraphHeight(
        remaining,
        charsPerLine,
        lineHeightPx,
        paragraphSpacing
      );

      if (fullHeight <= spaceLeft) {
        currentPage.paragraphs.push({ text: remaining, originalIndex: idx });
        currentHeight += fullHeight;
        remaining = "";
        continue;
      }

      const { head, tail } = splitTextToFitHeight(
        remaining,
        spaceLeft,
        charsPerLine,
        lineHeightPx,
        paragraphSpacing
      );

      if (!head) {
        pushPage();
        continue;
      }

      const headHeight = measureParagraphHeight(
        head,
        charsPerLine,
        lineHeightPx,
        paragraphSpacing
      );
      const headLines = headHeight / Math.max(1, lineHeightPx);
      // Tránh đáy trang chỉ còn một cụm quá cụt gây xấu và dễ tạo cảm giác "rách câu".
      if (
        currentPage.paragraphs.length > 0 &&
        headLines < READER_MIN_FRAGMENT_LINES &&
        spaceLeft > lineHeightPx * 1.6
      ) {
        pushPage();
        continue;
      }

      currentPage.paragraphs.push({ text: head, originalIndex: idx });
      currentHeight += headHeight;
      remaining = tail;

      const remainingSpace = maxHeight - currentHeight;
      const shouldFlush =
        !remaining ||
        (remainingSpace < lineHeightPx * 2 && currentHeight >= minFillHeight);

      if (shouldFlush) {
        pushPage();
      }
    }
  }

  pushPage();
  return pages;
}
