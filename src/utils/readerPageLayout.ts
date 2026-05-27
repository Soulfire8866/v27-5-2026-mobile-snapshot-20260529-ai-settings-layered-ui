/**
 * Khung Phòng Đọc (phân trang): ~94% chiều cao khả dụng sau safe-area.
 */

import type { TranslationSettings } from "../types";
import { READER_SAFE_TOP_FALLBACK_PX } from "./readerChromeLayout";
import { readerEdgeMarginPx } from "./systemChrome";

/** Tỷ lệ vùng chữ so với (màn hình − safe top − safe bottom) — chốt 1A. */
export const READER_CONTENT_HEIGHT_RATIO = 0.94;

export const READER_PAGE_MAX_WIDTH_RATIO = 0.96;
export const READER_TARGET_FRAME_RATIO = 0.92;
export const READER_MOBILE_MAX_WIDTH_RATIO = 0.98;

export type ReaderPageViewport = {
  width: number;
  height: number;
  outerWidth: number;
  outerHeight: number;
  padX: number;
  padY: number;
  padTop: number;
  padBottom: number;
};

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

export function computeReaderPageViewport(
  settings: TranslationSettings,
  options: { isMobile: boolean; readMode: "scroll" | "page" }
): ReaderPageViewport {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  const screenW = Math.floor(vv?.width ?? (typeof window !== "undefined" ? window.innerWidth : 400));
  const screenH = Math.floor(vv?.height ?? (typeof window !== "undefined" ? window.innerHeight : 700));

  if (options.readMode === "page") {
    const fillPercent = Math.max(87, Math.min(93, settings.readerFillPercent ?? 90));
    const fillRatio = fillPercent / 100;
    const padX = Math.max(0, Math.min(48, settings.readerPaddingX ?? 12));

    if (options.isMobile) {
      const safe = readSafeAreaInsetsPx();
      const availableH = Math.max(200, screenH - safe.top - safe.bottom);
      const contentHeight = Math.max(280, Math.floor(availableH * fillRatio));
      const slack = Math.max(0, availableH - contentHeight);
      const padTop = safe.top + Math.floor(slack / 2);
      const padBottom = safe.bottom + (slack - Math.floor(slack / 2));
      const widthRatio = Math.min(
        READER_MOBILE_MAX_WIDTH_RATIO,
        Math.max(READER_TARGET_FRAME_RATIO, (settings.readerWidth || 92) / 100)
      );
      const outerWidth = Math.max(260, Math.floor(screenW * widthRatio));

      return {
        outerWidth,
        outerHeight: screenH,
        padX,
        padY: Math.round((padTop + padBottom) / 2),
        padTop,
        padBottom,
        width: Math.max(220, outerWidth - padX * 2),
        height: contentHeight,
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
    const outerHeight = Math.floor(screenH * 0.95);
    const padTop = edgeMargin;
    const padBottom = edgeMargin;
    const height = Math.max(320, Math.floor((outerHeight - padTop - padBottom) * fillRatio));

    return {
      outerWidth,
      outerHeight,
      padX,
      padY: edgeMargin,
      padTop,
      padBottom,
      width: Math.max(240, outerWidth - padX * 2),
      height,
    };
  }

  const padX = settings.readerPaddingX ?? 12;
  const outerWidth = Math.floor(screenW * (settings.readerWidth / 100));
  const outerHeight = Math.max(400, screenH - 120);
  const padTop = 24;
  const padBottom = 24;
  return {
    outerWidth,
    outerHeight,
    padX,
    padY: 24,
    padTop,
    padBottom,
    width: Math.max(240, outerWidth - padX * 2),
    height: Math.max(320, outerHeight - padTop - padBottom),
  };
}
