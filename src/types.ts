import type { ChapterRuleState } from "./utils/chapterRulesEngine";

export interface Chapter {
  id: string;
  title: string;
  sourceText: string;
  /** Tiêu đề chương đã dịch (dòng 0 khi gộp với translateChapter) */
  translatedTitle?: string;
  translatedText: string;
  createdAt: string;
  charCount: number;
  wordCount: number;
  isCompleted?: boolean;
}

export interface Novel {
  id: string;
  title: string;
  author: string;
  sourceUrl?: string;
  createdAt: string;
  chapters: Chapter[];
  lastReadChapterId?: string;
  lastReadScrollOffset?: number;
  lastReadPercentage?: number;
  lastReadPageIndex?: number;
  lastReadMode?: "scroll" | "page";
  rawTextSource?: string; // Cache the originally uploaded raw text
  /** Mẫu tách chương tùy chỉnh, ví dụ 第<num>章 */
  chapterHeaderPattern?: string;
  deletedFromLibrary?: boolean;
}

export interface DictItem {
  id: string;
  chinese: string;
  vietnamese: string;
  category: "name" | "sect" | "item" | "custom" | "military" | "history" | "other";
  description?: string;
  novelId?: string;
}

export interface PronounMapping {
  id: string;
  chinese: string;
  vietnamese: string;
  pinyin: string;
  note?: string;
}

export interface PresetDictionary {
  name: string;
  category: string;
  description: string;
  items: Record<string, string>;
}

/** Giao diện khung app (menu, Lab, Thư viện…) — tách khỏi theme Phòng Đọc */
export type AppColorScheme = "system" | "light" | "dark";

export interface TranslationSettings {
  selectedModel: string;
  /** Shell: menu / Lab / Cài đặt. Không ảnh hưởng theme đọc trong Phòng Đọc. */
  appColorScheme?: AppColorScheme;
  theme: "light" | "dark" | "cream" | "pure-white" | "contrast-black";
  readerFont: "sans" | "serif" | "mono" | "times" | "calibri" | "segoe" | "verdana";
  readerFontSize: number;
  readerLineHeight: number; // e.g. 1.4 to 2.4
  readerParagraphSpacing: number; // e.g. 8 to 40 px
  readerAlignment: "left" | "right" | "justify";
  readerLayout: "vertical" | "horizontal"; // layout scrolling vs horizontal page-flipping
  readerWidth: number; // container width scale, % between 92 and 96 (page mode)
  readerPaddingX?: number; // horizontal padding in px
  /** Mức fill theo chiều cao khung đọc, phần trăm 87..93 */
  readerFillPercent?: number;
  readerSwipeDirection?: "horizontal" | "vertical"; // swipe directions for turning page on mobile
  apiKeys?: {
    google?: string;
    openai?: string;
    claude?: string;
    deepseek?: string;
    qwen?: string;
  };
  temperature?: number;
  topK?: number;
  maxThreads?: number;
  enableCrossRotation?: boolean;
  prompt1?: string;
  prompt2?: string;
  directClientTranslation?: boolean;
  remoteServerUrl?: string;
  /** Bật/tắt & thứ tự quy tắc regex tách chương khi tải .txt */
  chapterRuleStates?: ChapterRuleState[];
  /** Phòng Đọc: tự dịch chương kế (Lab) sau khi đọc tuần tự đủ x giây — mặc định tắt */
  readerAutoTranslateNextEnabled?: boolean;
  /** Số giây tối thiểu 10 — chỉ áp dụng khi bật readerAutoTranslateNextEnabled */
  readerAutoTranslateNextDelaySec?: number;
  /**
   * Lab Dịch: dịch tuần tự từng đoạn trong chương dài, kèm ngữ cảnh đoạn trước.
   * Đồng nhất tên/xưng hô hơn; chậm hơn song song. Mặc định tắt.
   */
  translationSequentialChunks?: boolean;
  /** Trần ký tự DictContext gửi cho mỗi đoạn khi dịch chunked */
  translationChunkDictMaxChars?: number;
  /** Bật cảnh báo ngân sách token trước khi chạy dịch */
  translationBudgetGuardEnabled?: boolean;
  /** Ngưỡng token ước tính/chương để bật cảnh báo xác nhận */
  translationBudgetPerChapter?: number;
}
