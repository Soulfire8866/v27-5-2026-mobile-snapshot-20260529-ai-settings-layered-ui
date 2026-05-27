import { useEffect } from "react";
import type { AppColorScheme } from "../types";

/**
 * Áp class `dark` trên <html> cho shell (Tailwind dark:).
 * `theme` trong settings vẫn chỉ dùng cho Phòng Đọc (ReaderView).
 */
export function useAppColorScheme(mode: AppColorScheme = "system"): void {
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const apply = () => {
      const useDark =
        mode === "dark" ? true : mode === "light" ? false : mq.matches;
      document.documentElement.classList.toggle("dark", useDark);
    };

    apply();

    if (mode !== "system") {
      return;
    }

    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [mode]);
}
