const normalize = (text: string): string => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

export const CHUNK_CONTINUITY_TAIL_LINES = 4;

export const takeTailLines = (text: string, lineCount = CHUNK_CONTINUITY_TAIL_LINES): string => {
  const lines = normalize(text).split("\n").filter((l) => l.trim());
  if (lines.length === 0) return "";
  return lines.slice(-lineCount).join("\n");
};

/** Nhắc model giữ tên/xưng hô giống đoạn vừa dịch (chỉ khi bật dịch tuần tự). */
export const buildChunkContinuityPrefix = (
  prevSourceTail: string,
  prevTranslatedTail: string
): string => {
  const src = prevSourceTail.trim();
  const tr = prevTranslatedTail.trim();
  if (!src || !tr) return "";
  return (
    `Đoạn trước trong cùng chương kết thúc như sau. ` +
    `BẮT BUỘC giữ nhất quán tên riêng, địa danh, xưng hô và cách viết đã dùng — không đổi phiên âm tên (vd. không đổi "Hy Phượng" thành "Hi Phong").\n` +
    `--- Gốc cuối ---\n${src}\n\n` +
    `--- Dịch cuối ---\n${tr}\n\n`
  );
};
