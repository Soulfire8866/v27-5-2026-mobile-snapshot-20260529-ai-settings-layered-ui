const normalizeLines = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

const splitLines = (text: string): string[] => normalizeLines(text).split("\n");

const joinLines = (lines: string[]): string => lines.join("\n");

/** Ghép dòng dịch thừa / thiếu về đúng số dòng gốc (không gọi thêm API). */
export const realignTranslationToSourceLineCount = (
  sourceText: string,
  translatedText: string
): string => {
  const src = splitLines(sourceText);
  const tr = splitLines(translatedText);
  if (src.length === tr.length) {
    return joinLines(tr);
  }
  if (src.length === 0) {
    return "";
  }
  if (tr.length === 0) {
    return joinLines(src.map(() => ""));
  }

  if (tr.length > src.length) {
    const out: string[] = [];
    for (let i = 0; i < src.length; i++) {
      if (!src[i].trim()) {
        out.push("");
        continue;
      }
      const start = Math.floor((i * tr.length) / src.length);
      const end = Math.floor(((i + 1) * tr.length) / src.length);
      const slice = tr.slice(start, Math.max(start + 1, end));
      out.push(
        slice
          .map((s) => s.trim())
          .filter(Boolean)
          .join(" ")
          .trim()
      );
    }
    return joinLines(out);
  }

  const out: string[] = [];
  for (let i = 0; i < src.length; i++) {
    if (!src[i].trim()) {
      out.push("");
      continue;
    }
    const trIdx = Math.min(tr.length - 1, Math.floor((i * tr.length) / src.length));
    let line = tr[trIdx] ?? "";
    const nextIdx = Math.min(tr.length - 1, Math.floor(((i + 1) * tr.length) / src.length));
    if (nextIdx > trIdx && tr[nextIdx]?.trim()) {
      line = `${line} ${tr[nextIdx].trim()}`.trim();
    }
    out.push(line);
  }
  return joinLines(out);
};

export const buildNumberedSourcePayload = (
  sourceChunk: string
): { payload: string; lineCount: number } => {
  const lines = splitLines(sourceChunk);
  const payload = lines
    .map((line, index) => `[L${String(index + 1).padStart(3, "0")}] ${line}`)
    .join("\n");
  return { payload, lineCount: lines.length };
};

export const parseNumberedTranslationResponse = (
  translatedText: string,
  expectedLines: number
): string | null => {
  const lines = splitLines(translatedText);
  const out = new Array<string>(expectedLines).fill("");
  let tagged = 0;

  for (const line of lines) {
    const match = line.match(/^\[L(\d{1,4})\]\s*(.*)$/i);
    if (!match) continue;
    const index = parseInt(match[1], 10) - 1;
    if (index < 0 || index >= expectedLines) continue;
    out[index] = match[2];
    tagged++;
  }

  if (tagged < Math.max(1, Math.floor(expectedLines * 0.6))) {
    return null;
  }

  return joinLines(out);
};

export const buildNumberedLineUserPrefix = (opts: {
  lineCount: number;
  chunkIndex?: number;
  totalChunks?: number;
  startLine?: number;
  endLine?: number;
}): string => {
  const { lineCount, chunkIndex, totalChunks, startLine, endLine } = opts;
  const chunkHint =
    totalChunks && totalChunks > 1 && chunkIndex !== undefined && startLine !== undefined && endLine !== undefined
      ? `Đây là đoạn ${chunkIndex + 1}/${totalChunks} của chương (dòng gốc ${startLine}–${endLine}). `
      : "";
  const titleHint =
    startLine === 1 ? "Dòng L001 là tiêu đề chương; các dòng sau là nội dung. " : "";

  return (
    `${chunkHint}${titleHint}` +
    `Dịch theo NGHĨA tiếng Việt tự nhiên. Mỗi dòng có mã [Lnnn] — trả về đúng ${lineCount} dòng, ` +
    `giữ nguyên mã [L001]…[L${String(lineCount).padStart(3, "0")}], không gộp hai mã, không thêm dòng không có mã.\n\n`
  );
};

export const countNumberedLineCoverage = (
  translatedText: string,
  expectedLines: number
): number => {
  const parsed = parseNumberedTranslationResponse(translatedText, expectedLines);
  if (!parsed) return 0;
  const filled = splitLines(parsed).filter((l) => l.trim()).length;
  return filled / Math.max(1, expectedLines);
};
