import type { Chapter } from "../types";
import { countContentChars } from "./chapterParser";

/** Số chữ nội dung chương (ưu tiên charCount đã lưu, không thì đếm từ sourceText). */
export function getChapterCharCount(ch: Pick<Chapter, "charCount" | "sourceText">): number {
  if (typeof ch.charCount === "number" && ch.charCount > 0) {
    return ch.charCount;
  }
  return countContentChars(ch.sourceText || "");
}

export function formatChapterCharCountLabel(ch: Pick<Chapter, "charCount" | "sourceText">): string {
  const n = getChapterCharCount(ch);
  return `${n.toLocaleString("vi-VN")} chữ`;
}
