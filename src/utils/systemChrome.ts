import { Capacitor } from "@capacitor/core";
import type { AppColorScheme, TranslationSettings } from "../types";
import { SystemChrome } from "../plugins/systemChrome";
import { getReaderThemeTokens } from "./readerChromeLayout";

const APP_FRAME_CHROME: Record<"light" | "dark", { bg: string; lightBarIcons: boolean }> = {
  light: { bg: "#f4f1ea", lightBarIcons: true },
  dark: { bg: "#121212", lightBarIcons: false },
};

export function readerThemeChromeBg(theme: TranslationSettings["theme"]): string {
  return getReaderThemeTokens(theme).surfaceHex;
}

/** ~1 cm mép trên/dưới tới dòng chữ (ước lượng theo chiều cao màn hình). */
export function readerEdgeMarginPx(screenHeight: number): number {
  return Math.round(Math.min(48, Math.max(34, screenHeight * 0.042)));
}

export function resolveAppColorMode(scheme: AppColorScheme): "light" | "dark" {
  if (scheme === "light") return "light";
  if (scheme === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

function paintDocumentChrome(bg: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--reader-chrome-bg", bg);
  document.body.style.backgroundColor = bg;
  document.documentElement.style.backgroundColor = bg;
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", bg);
}

async function ensureWebViewNotUnderSystemBars(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch (err) {
    console.warn("[system-chrome] StatusBar overlay:", err);
  }
}

/** Status bar (Capacitor) + navigation/gesture bar (plugin Android). */
async function applyNativeSystemBars(bg: string, lightBarIcons: boolean): Promise<void> {
  await ensureWebViewNotUnderSystemBars();

  if (Capacitor.getPlatform() === "android") {
    try {
      await SystemChrome.setSystemBars({ color: bg, lightBarIcons });
    } catch (err) {
      console.warn("[system-chrome] SystemChrome plugin:", err);
    }
  }

  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setBackgroundColor({ color: bg });
    await StatusBar.setStyle({
      style: lightBarIcons ? Style.Light : Style.Dark,
    });
  } catch (err) {
    console.warn("[system-chrome] StatusBar color:", err);
  }
}

/** Tab app: Cấu hình, Thư viện, Lab… — theo «Giao diện khung ứng dụng». */
export async function applyAppSystemChrome(scheme: AppColorScheme = "system"): Promise<void> {
  const mode = resolveAppColorMode(scheme);
  const chrome = APP_FRAME_CHROME[mode];
  paintDocumentChrome(chrome.bg);
  await applyNativeSystemBars(chrome.bg, chrome.lightBarIcons);
}

/** Phòng Đọc — theo «Màu giấy», không đè status bar. */
export async function applyReaderSystemChrome(theme: TranslationSettings["theme"]): Promise<void> {
  const tokens = getReaderThemeTokens(theme);
  paintDocumentChrome(tokens.surfaceHex);
  await applyNativeSystemBars(tokens.surfaceHex, tokens.lightBarIcons);
}

/** @deprecated dùng applyAppSystemChrome */
export async function resetAppSystemChrome(): Promise<void> {
  await applyAppSystemChrome("system");
}
