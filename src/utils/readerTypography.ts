import type { TranslationSettings } from "../types";

/** Thụt dòng đầu đoạn — phải khớp Phòng Đọc + hộp đo DOM. */
export const READER_TEXT_INDENT_EM = 2.3;

export function getReaderFontClass(font: TranslationSettings["readerFont"]): string {
  switch (font) {
    case "serif":
    case "times":
      return "serif-reading-font";
    case "mono":
      return "font-mono";
    case "calibri":
      return "font-sans font-['Calibri']";
    case "segoe":
      return "font-sans font-['Segoe_UI']";
    case "verdana":
      return "font-sans font-['Verdana']";
    default:
      return "font-sans";
  }
}

export function getReaderAlignmentClass(
  alignment: TranslationSettings["readerAlignment"]
): string {
  switch (alignment) {
    case "right":
      return "text-right";
    case "justify":
      return "text-justify";
    default:
      return "text-left";
  }
}

export function getReaderLineHeightPx(settings: TranslationSettings): number {
  const fontSize = settings.readerFontSize || 16;
  const lineHeight = settings.readerLineHeight || 1.6;
  return fontSize * lineHeight;
}

export function getReaderParagraphStyle(
  settings: TranslationSettings,
  options?: { marginBottom?: number }
): { marginBottom: string; textIndent: string } {
  return {
    marginBottom: `${options?.marginBottom ?? settings.readerParagraphSpacing ?? 18}px`,
    textIndent: `${READER_TEXT_INDENT_EM}em`,
  };
}
