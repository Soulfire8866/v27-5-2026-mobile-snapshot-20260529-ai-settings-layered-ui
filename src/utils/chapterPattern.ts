/**
 * Biên dịch mẫu tiêu đề chương do người dùng nhập thành RegExp (theo dòng).
 *
 * Ký hiệu:
 * - <num> hoặc <n> — số chương (Ả Rập / Hán số)
 * - <...> hoặc <*> — nội dung giữa hai phần cố định (linh hoạt hơn)
 */

const CN_NUM =
  "0-9０-９一二三四五六七八九十百千万零两〇壹贰叁肆伍陆柒捌玖拾佰仟";

export type ChapterPatternPresetGroup = "cn" | "en" | "extra";

export interface ChapterPatternPreset {
  id: string;
  label: string;
  pattern: string;
  group: ChapterPatternPresetGroup;
  hint?: string;
}

export const CHAPTER_PATTERN_PRESET_GROUPS: { id: ChapterPatternPresetGroup; label: string }[] = [
  { id: "cn", label: "Hán văn" },
  { id: "en", label: "Anh văn" },
  { id: "extra", label: "Ngoại truyện / khác" },
];

/** Preset phổ biến trên web novel Trung / dịch */
export const CHAPTER_PATTERN_PRESETS: ChapterPatternPreset[] = [
  { id: "di-num-zhang", label: "第<num>章", pattern: "第<num>章", group: "cn", hint: "Phổ biến nhất" },
  { id: "di-any-zhang", label: "第<...>章", pattern: "第<...>章", group: "cn" },
  { id: "bracket-cn", label: "【第<num>章】", pattern: "【第<num>章】", group: "cn" },
  { id: "paren-cn", label: "（第<num>章）", pattern: "（第<num>章）", group: "cn" },
  { id: "square-cn", label: "[第<num>章]", pattern: "[第<num>章]", group: "cn" },
  { id: "no-di-zhang", label: "<num>章", pattern: "<num>章", group: "cn" },
  { id: "di-jie", label: "第<num>节", pattern: "第<num>节", group: "cn" },
  { id: "di-hui", label: "第<num>回", pattern: "第<num>回", group: "cn" },
  { id: "di-pian", label: "第<num>篇", pattern: "第<num>篇", group: "cn" },
  { id: "di-ji", label: "第<num>集", pattern: "第<num>集", group: "cn" },
  { id: "di-juan", label: "第<num>卷", pattern: "第<num>卷", group: "cn" },
  { id: "di-mu", label: "第<num>幕", pattern: "第<num>幕", group: "cn" },
  { id: "di-zhe", label: "第<num>折", pattern: "第<num>折", group: "cn" },
  { id: "juan-zhang", label: "第<num>卷 第<num>章", pattern: "第<num>卷 第<num>章", group: "cn" },
  { id: "chapter-en", label: "Chapter <num>", pattern: "Chapter <num>", group: "en" },
  { id: "chap-en", label: "Chap.<num>", pattern: "Chap.<num>", group: "en" },
  { id: "ch-en", label: "Ch.<num>", pattern: "Ch.<num>", group: "en" },
  { id: "vol-en", label: "Vol.<num>", pattern: "Vol.<num>", group: "en" },
  { id: "volume-en", label: "Volume <num>", pattern: "Volume <num>", group: "en" },
  { id: "extra-en", label: "Extra <num>", pattern: "Extra <num>", group: "en" },
  { id: "fanwai", label: "番外<num>", pattern: "番外<num>", group: "extra" },
  { id: "fanwai-any", label: "番外<...>", pattern: "番外<...>", group: "extra" },
  { id: "wai-zhuan", label: "外传<num>", pattern: "外传<num>", group: "extra" },
];

export const DEFAULT_CHAPTER_PATTERN = CHAPTER_PATTERN_PRESETS[0].pattern;

const PLACEHOLDER_SPLIT = /(<\.\.\.>|<\*>|<num>|<n>)/gi;

function escapeRegexLiteral(part: string): string {
  return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface CompiledChapterPattern {
  regex: RegExp;
  source: string;
}

export function compileChapterPattern(pattern: string): {
  compiled?: CompiledChapterPattern;
  error?: string;
} {
  const source = pattern.trim();
  if (!source) {
    return { error: "Mẫu không được để trống." };
  }
  if (!/<\.\.\.>|<\*>|<num>|<n>/i.test(source)) {
    return {
      error: "Mẫu cần có ít nhất một chỗ thay: <num>, <n>, <...> hoặc <*>.",
    };
  }

  const numGroup = `[${CN_NUM}]{1,14}`;
  const parts = source.split(PLACEHOLDER_SPLIT).filter((p) => p.length > 0);
  let regexStr = "^";

  for (const part of parts) {
    const token = part.toLowerCase();
    if (token === "<...>" || token === "<*>") {
      regexStr += "(.+?)";
    } else if (token === "<num>" || token === "<n>") {
      regexStr += `(${numGroup})`;
    } else {
      regexStr += escapeRegexLiteral(part);
    }
  }

  regexStr += "(?:\\s.*)?$";

  try {
    const regex = new RegExp(regexStr, "iu");
    return { compiled: { regex, source } };
  } catch {
    return { error: "Mẫu không hợp lệ — kiểm tra ký tự đặc biệt." };
  }
}

export function isCustomChapterHeader(line: string, compiled: CompiledChapterPattern): boolean {
  const t = line.trim();
  if (!t || t.length > 160) return false;
  return compiled.regex.test(t);
}

export function previewChapterPattern(pattern: string): string {
  const { compiled, error } = compileChapterPattern(pattern);
  if (error) return error;
  const preset = CHAPTER_PATTERN_PRESETS.find((p) => p.pattern === pattern);
  const example = preset?.hint ? ` (${preset.hint})` : "";
  return `Khớp dòng tiêu đề kiểu: 第一章, 第1089章 标题…${example}`;
}

export function presetsByGroup(group: ChapterPatternPresetGroup): ChapterPatternPreset[] {
  return CHAPTER_PATTERN_PRESETS.filter((p) => p.group === group);
}
