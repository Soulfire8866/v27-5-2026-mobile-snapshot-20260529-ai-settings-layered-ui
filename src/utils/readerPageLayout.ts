/**
 * Khung Phòng Đọc: lượng tử hóa chiều cao + metrics cho CSS native page column.
 */

import type { CSSProperties } from "react";
import type { TranslationSettings } from "../types";
import { READER_SAFE_TOP_FALLBACK_PX, READER_TOOLBAR_HEIGHT_PX } from "./readerChromeLayout";
import { readerEdgeMarginPx } from "./systemChrome";

export const READER_CONTENT_HEIGHT_RATIO = 0.94;
export const READER_PAGE_MAX_WIDTH_RATIO = 0.96;
export const READER_TARGET_FRAME_RATIO = 0.92;
export const READER_MOBILE_MAX_WIDTH_RATIO = 0.98;

/** Thụt dòng đầu đoạn — chuẩn native page (không dùng margin đoạn). */
export const READER_NATIVE_TEXT_INDENT = "1.5em";

export const READER_LAB_BANNER_RESERVE_PX = 44;

export type ReaderPageViewport = {
  width: number;
  height: number;
  outerWidth: number;
  outerHeight: number;
  padX: number;
  padY: number;
  padTop: number;
  padBottom: number;
  rawAvailableHeight: number;
  targetHeight: number;
  quantizedHeight: number;
  exactLineHeightPx: number;
  columnWidthPx: number;
};

export function getReaderLineHeightPx(settings: TranslationSettings): number {
  const fontSizePx = Math.max(12, settings.readerFontSize || 20);
  const lineHeightRatio = Math.max(1, settings.readerLineHeight || 1.6);
  return Math.max(1, fontSizePx * lineHeightRatio);
}

export function computeReaderQuantizedMetrics(
  rawAvailableHeightPx: number,
  settings: TranslationSettings
): {
  rawAvailableHeight: number;
  targetHeight: number;
  quantizedHeight: number;
  exactLineHeightPx: number;
  maxLines: number;
} {
  const rawAvailableHeight = Math.max(200, Math.floor(rawAvailableHeightPx));
  const fillLevel = Math.max(87, Math.min(100, settings.readerFillPercent ?? 90));
  const targetHeight = Math.max(220, Math.floor(rawAvailableHeight * (fillLevel / 100)));
  const exactLineHeightPx = getReaderLineHeightPx(settings);
  const maxLines = Math.max(1, Math.floor(targetHeight / exactLineHeightPx));
  const quantizedHeight = maxLines * exactLineHeightPx;
  return { rawAvailableHeight, targetHeight, quantizedHeight, exactLineHeightPx, maxLines };
}

export function reduceQuantizedHeightByLines(
  quantizedHeightPx: number,
  settings: TranslationSettings,
  linesToRemove: number
): number {
  if (linesToRemove <= 0) return quantizedHeightPx;
  const lineHeightPx = getReaderLineHeightPx(settings);
  const currentLines = Math.max(1, Math.floor(quantizedHeightPx / lineHeightPx));
  const nextLines = Math.max(1, currentLines - linesToRemove);
  return nextLines * lineHeightPx;
}

const INLINE_TRANSLATE_HAN_RE = /[\u4e00-\u9fa5]{3,}/;

export function paragraphMayShowInlineTranslateAction(paragraph: string): boolean {
  return INLINE_TRANSLATE_HAN_RE.test(paragraph);
}

export function readerTextMayShowInlineTranslateAction(text: string): boolean {
  if (!text.trim()) return false;
  return text.split("\n").some((line) => paragraphMayShowInlineTranslateAction(line));
}

export function readSafeAreaInsetsPx(): { top: number; bottom: number } {
  if (typeof document === "undefined") {
    return { top: READER_SAFE_TOP_FALLBACK_PX, bottom: 0 };
  }

  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;left:0;top:0;width:0;height:0;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const top = Math.max(READER_SAFE_TOP_FALLBACK_PX, parseFloat(cs.paddingTop) || 0);
  const bottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
  return { top, bottom };
}

export type ComputeReaderPageViewportOptions = {
  isMobile: boolean;
  readMode: "scroll" | "page";
  containerRect?: { width: number; height: number } | null;
  /** Trừ banner «Chưa dịch Lab» trước khi lượng tử hóa. */
  bannerReservePx?: number;
  /** Trừ header/footer chrome khi đang hiện (overlay mobile). */
  chromeHeaderFooterPx?: number;
};

export function computeReaderPageViewport(
  settings: TranslationSettings,
  options: ComputeReaderPageViewportOptions
): ReaderPageViewport {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const measured = options.containerRect;
  const screenW = Math.floor(
    measured?.width ?? vv?.width ?? (typeof window !== "undefined" ? window.innerWidth : 400)
  );
  const screenH = Math.floor(
    measured?.height ?? vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 700)
  );

  if (options.readMode === "page") {
    const padX = Math.max(0, Math.min(48, settings.readerPaddingX ?? 12));
    const bannerReserve = Math.max(0, options.bannerReservePx ?? 0);
    const chromeReserve = Math.max(0, options.chromeHeaderFooterPx ?? 0);

    if (options.isMobile) {
      const widthRatio = Math.min(
        READER_MOBILE_MAX_WIDTH_RATIO,
        Math.max(READER_TARGET_FRAME_RATIO, (settings.readerWidth || 92) / 100)
      );
      const outerWidth = Math.max(260, Math.floor(screenW * widthRatio));
      const columnWidthPx = Math.max(220, outerWidth - padX * 2);

      let rawAvailableHeight: number;
      let padTop = 0;
      let padBottom = 0;

      if (measured) {
        rawAvailableHeight = Math.max(
          200,
          screenH - bannerReserve - chromeReserve
        );
      } else {
        const safe = readSafeAreaInsetsPx();
        rawAvailableHeight = Math.max(
          200,
          screenH - safe.top - safe.bottom - bannerReserve - chromeReserve
        );
        const metrics = computeReaderQuantizedMetrics(rawAvailableHeight, settings);
        const slack = Math.max(0, rawAvailableHeight - metrics.quantizedHeight);
        padTop = safe.top + Math.floor(slack / 2);
        padBottom = safe.bottom + (slack - Math.floor(slack / 2));
      }

      const metrics = computeReaderQuantizedMetrics(rawAvailableHeight, settings);

      return {
        outerWidth,
        outerHeight: measured ? screenH : screenH,
        padX,
        padY: Math.round((padTop + padBottom) / 2),
        padTop,
        padBottom,
        width: columnWidthPx,
        height: metrics.quantizedHeight,
        rawAvailableHeight: metrics.rawAvailableHeight,
        targetHeight: metrics.targetHeight,
        quantizedHeight: metrics.quantizedHeight,
        exactLineHeightPx: metrics.exactLineHeightPx,
        columnWidthPx,
      };
    }

    const edgeMargin = readerEdgeMarginPx(screenH);
    const outerWidth = Math.floor(
      screenW *
        Math.min(
          READER_PAGE_MAX_WIDTH_RATIO,
          Math.max(
            READER_TARGET_FRAME_RATIO,
            (settings.readerWidth || Math.round(READER_TARGET_FRAME_RATIO * 100)) / 100
          )
        )
    );
    const outerHeight = measured ? screenH : Math.floor(screenH * 0.95);
    const padTopBase = measured ? 0 : edgeMargin;
    const padBottomBase = measured ? 0 : edgeMargin;
    const rawAvailableHeight = Math.max(
      200,
      (measured ? screenH : outerHeight - padTopBase - padBottomBase) -
        bannerReserve -
        chromeReserve
    );
    const metrics = computeReaderQuantizedMetrics(rawAvailableHeight, settings);
    const slack = Math.max(0, rawAvailableHeight - metrics.quantizedHeight);
    const padTop = padTopBase + (measured ? 0 : Math.floor(slack / 2));
    const padBottom = padBottomBase + (measured ? 0 : slack - Math.floor(slack / 2));
    const columnWidthPx = Math.max(240, outerWidth - padX * 2);

    return {
      outerWidth,
      outerHeight,
      padX,
      padY: edgeMargin,
      padTop,
      padBottom,
      width: columnWidthPx,
      height: metrics.quantizedHeight,
      rawAvailableHeight: metrics.rawAvailableHeight,
      targetHeight: metrics.targetHeight,
      quantizedHeight: metrics.quantizedHeight,
      exactLineHeightPx: metrics.exactLineHeightPx,
      columnWidthPx,
    };
  }

  const padX = settings.readerPaddingX ?? 12;
  const outerWidth = Math.floor(screenW * (settings.readerWidth / 100));
  const outerHeight = Math.max(400, screenH - 120);
  const padTop = 24;
  const padBottom = 24;
  const scrollH = Math.max(320, outerHeight - padTop - padBottom);
  const exactLineHeightPx = getReaderLineHeightPx(settings);

  return {
    outerWidth,
    outerHeight,
    padX,
    padY: 24,
    padTop,
    padBottom,
    width: Math.max(240, outerWidth - padX * 2),
    height: scrollH,
    rawAvailableHeight: scrollH,
    targetHeight: scrollH,
    quantizedHeight: scrollH,
    exactLineHeightPx,
    columnWidthPx: Math.max(240, outerWidth - padX * 2),
  };
}

/** Style đoạn văn native — khớp class `.reader-page-p` trong index.css. */
export function buildReaderNativeParagraphStyle(
  settings: TranslationSettings,
  exactLineHeightPx: number
): CSSProperties {
  const fontSize = settings.readerFontSize || 16;
  return {
    fontSize: `${fontSize}px`,
    lineHeight: `${exactLineHeightPx}px`,
    textAlign: "justify",
    orphans: 1,
    widows: 1,
    breakInside: "auto",
    marginTop: 0,
    marginBottom: 0,
    textIndent: READER_NATIVE_TEXT_INDENT,
    wordBreak: "break-word",
    hyphens: "auto",
    WebkitHyphens: "auto",
  };
}

/** CSS variables cho `.reader-page-column` / wrapper. */
export function buildReaderPageColumnCssVars(
  viewport: ReaderPageViewport
): Record<string, string> {
  return {
    "--reader-quantized-h": `${viewport.quantizedHeight}px`,
    "--reader-target-h": `${viewport.targetHeight}px`,
    "--reader-column-w": `${viewport.columnWidthPx}px`,
    "--reader-line-h": `${viewport.exactLineHeightPx}px`,
  };
}

export function estimateReaderChromeHeaderFooterPx(options: {
  barsOverlay: boolean;
  showBarsOnMobile: boolean;
}): number {
  if (!options.barsOverlay || !options.showBarsOnMobile) return 0;
  return READER_TOOLBAR_HEIGHT_PX * 2;
}
