import React from "react";
import {
  ChapterReadiness,
  PageTranslationProgress,
  READINESS_BADGE,
} from "../utils/chapterTranslationBridge";

interface ChapterReadinessBadgeProps {
  readiness: ChapterReadiness;
  progress?: PageTranslationProgress | null;
  size?: "xs" | "sm";
  className?: string;
}

export default function ChapterReadinessBadge({
  readiness,
  progress,
  size = "xs",
  className = "",
}: ChapterReadinessBadgeProps) {
  const cfg = READINESS_BADGE[readiness];
  let label = cfg.label;
  if (readiness === "reader_partial" && progress && progress.total > 0) {
    label = `${progress.filled}/${progress.total}`;
  }

  const sizeClass =
    size === "sm"
      ? "text-[10px] px-2 py-0.5"
      : "text-[9px] px-1.5 py-0.5";

  return (
    <span
      title={cfg.title}
      className={`inline-flex items-center font-medium uppercase tracking-wide rounded-md border shrink-0 ${sizeClass} ${cfg.className} ${className}`}
    >
      {label}
    </span>
  );
}
