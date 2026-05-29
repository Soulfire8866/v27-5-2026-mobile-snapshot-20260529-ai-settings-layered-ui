export type ChapterTranslationResult = {
  translatedTitle: string;
  translatedText: string;
};

const normalizeChapterText = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const splitChapterLines = (text: string): string[] =>
  normalizeChapterText(text).split("\n");

const joinChapterLines = (lines: string[]): string => lines.join("\n");

const countChapterLines = (text: string): number => splitChapterLines(text).length;

const buildChapterSourceWithTitle = (
  chapterTitle: string | undefined,
  sourceText: string
): { combined: string; hasTitleLine: boolean } => {
  const body = normalizeChapterText(sourceText);
  const title = (chapterTitle ?? "").trim();
  if (!title) {
    return { combined: body, hasTitleLine: false };
  }
  if (!body.trim()) {
    return { combined: title, hasTitleLine: true };
  }
  return { combined: `${title}\n${body}`, hasTitleLine: true };
};

export const buildCompareBilingualTexts = (
  chapterTitle: string,
  sourceText: string,
  translatedTitle: string | undefined,
  translatedText: string
): { sourceCombined: string; translatedCombined: string; hasTitleLine: boolean } => {
  const { combined: sourceCombined, hasTitleLine } = buildChapterSourceWithTitle(
    chapterTitle,
    sourceText
  );
  if (!hasTitleLine) {
    return {
      sourceCombined,
      translatedCombined: normalizeChapterText(translatedText),
      hasTitleLine: false,
    };
  }
  const viTitle = (translatedTitle ?? "").trim();
  const viBody = normalizeChapterText(translatedText);
  const translatedCombined = viTitle
    ? viBody.trim()
      ? `${viTitle}\n${viBody}`
      : viTitle
    : viBody;
  return { sourceCombined, translatedCombined, hasTitleLine: true };
};

export const parseCompareTranslationSave = (
  translatedLines: string[],
  hasTitleLine: boolean
): ChapterTranslationResult => {
  if (!hasTitleLine) {
    return { translatedTitle: "", translatedText: joinChapterLines(translatedLines) };
  }
  if (translatedLines.length === 0) {
    return { translatedTitle: "", translatedText: "" };
  }
  const [first, ...rest] = translatedLines;
  return { translatedTitle: first, translatedText: joinChapterLines(rest) };
};

export const formatLineMismatchWarning = (
  chapterTitle: string,
  sourceText: string,
  translatedTitle: string | undefined,
  translatedText: string
): string | null => {
  const { sourceCombined, translatedCombined } = buildCompareBilingualTexts(
    chapterTitle,
    sourceText,
    translatedTitle,
    translatedText
  );
  const sourceLines = countChapterLines(sourceCombined);
  const translatedLines = countChapterLines(translatedCombined);
  if (sourceLines === translatedLines || !translatedCombined.trim()) return null;
  return `Số dòng Hán (${sourceLines}) và Việt (${translatedLines}) không khớp — đối chiếu có thể lệch. Dịch lại chương trong Lab hoặc hiệu đính từng dòng.`;
};
