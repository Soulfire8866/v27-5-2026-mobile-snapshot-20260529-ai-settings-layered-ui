import React from "react";
import { AlertCircle } from "lucide-react";

interface TranslationErrorPanelProps {
  title?: string;
  message: string;
  className?: string;
}

/** Khung lỗi dịch AI — cuộn được, hiển thị đủ nội dung */
export default function TranslationErrorPanel({
  title = "Lỗi dịch AI",
  message,
  className = "",
}: TranslationErrorPanelProps) {
  return (
    <div
      className={`w-full shrink-0 rounded-xl border border-red-600/30 bg-red-600/10 p-3.5 sm:p-4 app-elevated-surface max-h-[min(50vh,360px)] overflow-y-auto custom-scrollbar ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-2.5">
        <AlertCircle className="w-5 h-5 shrink-0 text-red-600 dark:text-red-400 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-red-800 dark:text-red-300">{title}</p>
          <pre className="mt-2 text-xs sm:text-sm text-red-900 dark:text-red-200 whitespace-pre-wrap break-words font-sans leading-relaxed">
            {message}
          </pre>
        </div>
      </div>
    </div>
  );
}
