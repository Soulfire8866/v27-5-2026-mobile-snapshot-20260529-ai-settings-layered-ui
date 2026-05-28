import type { TranslationSettings } from "../types";

/** Chiều cao hàng nút (khớp Tailwind h-14). */
export const READER_TOOLBAR_HEIGHT_PX = 56;

/** Fallback khi WebView không báo safe-area (một số máy Android). */
export const READER_SAFE_TOP_FALLBACK_PX = 28;

export type ReaderThemeTokens = {
  surfaceBg: string;
  surfaceHex: string;
  chromeBarBg: string;
  borderClass: string;
  borderHex: string;
  textClass: string;
  mutedTextClass: string;
  btnSurfaceClass: string;
  settingsPanelClass: string;
  lightBarIcons: boolean;
};

const VALID_READER_THEMES = [
  "light",
  "dark",
  "cream",
  "pure-white",
  "contrast-black",
] as const satisfies readonly TranslationSettings["theme"][];

const LEGACY_READER_THEME: Record<string, TranslationSettings["theme"]> = {
  fluent: "light",
};

const TOKENS: Record<TranslationSettings["theme"], ReaderThemeTokens> = {
  light: {
    surfaceBg: "bg-[#f4f8ff]",
    surfaceHex: "#f4f8ff",
    chromeBarBg: "bg-[#f4f8ff]/92",
    borderClass: "border-sky-200/80",
    borderHex: "#bae6fd",
    textClass: "text-zinc-900",
    mutedTextClass: "text-zinc-600",
    btnSurfaceClass: "border-sky-200/80 bg-[#f4f8ff]/80 hover:bg-sky-50",
    settingsPanelClass: "bg-[#f4f8ff]/96 text-zinc-900 border-sky-200",
    lightBarIcons: true,
  },
  dark: {
    surfaceBg: "bg-zinc-950",
    surfaceHex: "#09090b",
    chromeBarBg: "bg-zinc-950/92",
    borderClass: "border-zinc-800/90",
    borderHex: "#27272a",
    textClass: "text-zinc-300",
    mutedTextClass: "text-zinc-400",
    btnSurfaceClass: "border-zinc-800/90 bg-zinc-950/80 hover:bg-zinc-900",
    settingsPanelClass: "bg-zinc-900/96 text-zinc-100 border-zinc-800",
    lightBarIcons: false,
  },
  cream: {
    surfaceBg: "bg-[#fcf8f2]",
    surfaceHex: "#fcf8f2",
    chromeBarBg: "bg-[#fcf8f2]/92",
    borderClass: "border-[#e4d3b2]/90",
    borderHex: "#e4d3b2",
    textClass: "text-[#2c3e50]",
    mutedTextClass: "text-[#5a6c7d]",
    btnSurfaceClass: "border-[#e4d3b2]/90 bg-[#fcf8f2]/80 hover:bg-[#f5efe4]",
    settingsPanelClass: "bg-[#fcf8f2]/96 text-[#2c3e50] border-[#e4d3b2]",
    lightBarIcons: true,
  },
  "pure-white": {
    surfaceBg: "bg-white",
    surfaceHex: "#ffffff",
    chromeBarBg: "bg-white/92",
    borderClass: "border-zinc-300/90",
    borderHex: "#d4d4d8",
    textClass: "text-black",
    mutedTextClass: "text-zinc-600",
    btnSurfaceClass: "border-zinc-300/90 bg-white/80 hover:bg-zinc-50",
    settingsPanelClass: "bg-white/96 text-black border-zinc-300",
    lightBarIcons: true,
  },
  "contrast-black": {
    surfaceBg: "bg-black",
    surfaceHex: "#000000",
    chromeBarBg: "bg-black/92",
    borderClass: "border-zinc-900/90",
    borderHex: "#18181b",
    textClass: "text-white",
    mutedTextClass: "text-zinc-400",
    btnSurfaceClass: "border-zinc-800/90 bg-black/80 hover:bg-zinc-950",
    settingsPanelClass: "bg-zinc-950/96 text-white border-zinc-800",
    lightBarIcons: false,
  },
};

export function normalizeReaderTheme(raw: unknown): TranslationSettings["theme"] {
  if (typeof raw !== "string") return "light";
  const mapped = LEGACY_READER_THEME[raw] ?? raw;
  if ((VALID_READER_THEMES as readonly string[]).includes(mapped)) {
    return mapped as TranslationSettings["theme"];
  }
  return "light";
}

export function getReaderThemeTokens(theme: TranslationSettings["theme"]): ReaderThemeTokens {
  return TOKENS[normalizeReaderTheme(theme)] ?? TOKENS.light;
}

/** Vị trí top (px) của panel «Cấu hình Trang Sách». */
export function computeReaderSettingsPanelTopPx(
  safeTopPx: number,
  toolbarHeightPx: number = READER_TOOLBAR_HEIGHT_PX
): number {
  return Math.max(0, safeTopPx) + toolbarHeightPx;
}

/** CSS value cho biến --reader-safe-top (env + fallback Android). */
export function readerSafeTopCss(): string {
  return `max(env(safe-area-inset-top, 0px), ${READER_SAFE_TOP_FALLBACK_PX}px)`;
}

export function readerSafeBottomCss(): string {
  return `env(safe-area-inset-bottom, 0px)`;
}
