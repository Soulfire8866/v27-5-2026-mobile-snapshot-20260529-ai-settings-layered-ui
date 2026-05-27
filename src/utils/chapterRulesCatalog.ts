/**
 * Quy tắc nhận diện tiêu đề chương (tham khảo app đọc truyện — regex theo dòng).
 * Mặc định bật các rule giống app mẫu (ảnh user cung cấp).
 */

export interface ChapterRuleDefinition {
  id: string;
  /** Tên hiển thị (giữ nguyên tiếng Trung/Anh như app mẫu khi có) */
  name: string;
  regex: string;
  example: string;
  enabledByDefault: boolean;
  /** Rule tích hợp — không xóa, có thể khôi phục mặc định */
  builtIn: boolean;
}

const N =
  "0-9０-９\\d〇零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟";

/** Tiền tố 第…章/节/卷… dùng chung */
const DI_HEAD =
  `(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\\s{0,4}[${N}]+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|篇(?!张)|回|话))`;

export const CHAPTER_RULES_CATALOG: ChapterRuleDefinition[] = [
  {
    id: "toc-no-space",
    name: "目录(去空白)",
    regex: `(?<=[ \\s])${DI_HEAD}.{0,30}$`,
    example: "第一章 假装第一章前面有空白但我不要",
    enabledByDefault: true,
    builtIn: true,
  },
  {
    id: "toc",
    name: "目录",
    regex: `^[ \\t]{0,4}${DI_HEAD}.{0,30}$`,
    example: "第一章 标准的粤语就是这样",
    enabledByDefault: true,
    builtIn: true,
  },
  {
    id: "toc-intro",
    name: "目录(匹配简介)",
    regex: `(?<=[ \\s])(?:(?:内容|文章)?简介|文案|前言|序言|序|引子|引|楔子|后记|尾声|番外).{0,40}$`,
    example: "简介 老夫诸葛村夫",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "toc-classical",
    name: "目录(古典、轻小说备用)",
    regex: `^[ \\t]{0,4}(?:序章|楔子|正文(?!完|结)|终章|后记|尾声|番外|第\\s{0,4}[${N}]+?\\s{0,4}(?:章|节(?!课)|卷|集(?![合和])|部(?![分赛游])|篇(?!张)|回|话)).{0,30}$`,
    example: "第一章 比上面只多了回和话",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "num-pure",
    name: "数字(纯数字标题)",
    regex: `(?<=[ \\s])(?:\\d+\\.?|[零一二两三四五六七八九十百千万]+)$`,
    example: "12",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "num-cn-pure",
    name: "大写数字(纯数字标题)",
    regex: `(?<=[ \\s])[零一二两三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟]+$`,
    example: "一百七十",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "num-separator-title",
    name: "数字 分隔符 标题名称",
    regex: `^[ \\t]{0,4}\\d{1,5}[:：,.，、_—\\-].{1,30}$`,
    example: "1、这个就是标题",
    enabledByDefault: true,
    builtIn: true,
  },
  {
    id: "zhengwen-title",
    name: "正文 标题/序号",
    regex: `^[ \\t]{0,4}正文[ ]{1,4}.{0,20}$`,
    example: "正文 我奶常山赵子龙",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "chapter-en",
    name: "Chapter/Section/Part/Episode",
    regex: `^[ \\t]{0,4}(?:[Cc]hapter|[Ss]ection|[Pp]art|[Ee]pisode)\\s{0,4}[\\d０-９]{1,5}(?:\\s*[:：.\\-—–—]?\\s*.{0,80})?$`,
    example: "Chapter 1 MyGrandmaIsNB",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "chapter-num-en",
    name: "Chapter(Number)",
    regex: `^[ \\t]{0,4}(?:[Cc]hapter|[Cc]hap\\.?)\\s{0,4}[\\d０-９]{1,5}(?:\\s*[-–—.]\\s*.{0,80})?$`,
    example: "Chapter 1 MyGrandmaIsNB",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "special-symbol-num-title",
    name: "特殊符号 序号 标题",
    regex: `(?<=[ \\s])[【《『「\\[\\(](?:第|[Cc]hapter)[${N}]{1,10}[章节回话].{0,20}$`,
    example: "【第一章 后面的符号可以没有",
    enabledByDefault: true,
    builtIn: true,
  },
  {
    id: "special-symbol-single",
    name: "特殊符号 标题(单个)",
    regex: `(?<=[ \\s]{0,4})(?:[☆★◆◇◎●].{1,30})$`,
    example: "☆、晋江作者最喜欢的格式",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "zhang-juan-num",
    name: "章/卷 序号 标题",
    regex: `^[ \\t]{0,4}(?:卷\\s{0,4}[${N}]{1,8}|第\\s{0,4}[${N}]{1,12}\\s{0,4}(?:章|节|卷|部|篇|回|话)).{0,30}$`,
    example: "卷五 开源盛世",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "dingge-title",
    name: "顶格标题",
    regex: `^\\S.{1,20}$`,
    example: "20字以内顶格写的都是标题",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "book-title-paren-num",
    name: "书名 括号 序号",
    regex: `^[一-龥]{1,20}[ \\t]{0,4}[(（\\[\\[]?[${N}]{1,8}[)）\\]\\]]?[ \\t]{0,4}.{0,20}$`,
    example: "标题后面数字有括号 (12)",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "book-title-num",
    name: "书名 序号",
    regex: `^[一-龥&&[^第\\s]]{1,14}[ \\t]{0,4}(?:第\\s{0,4}[${N}]{1,8}\\s{0,4}(?:章|节|卷|回|话)|[(（][${N}]{1,6}[)）]|[${N}]{1,6})[ \\t]{0,4}[^。！？…]{0,24}$`,
    example: "标题后面数字没有括号 124",
    enabledByDefault: true,
    builtIn: true,
  },
  {
    id: "equals-wrap-title",
    name: "特定字符 标题 特定符号",
    regex: `(?<=\\={3,6}).{1,40}?(?=\\={3,6})`,
    example: "===起这种标题干什么===",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "general-aggressive",
    name: "通用规则",
    regex: `^(?:.{0,6})(?:[引楔]子|正文(?!完|结)|[引序前]言|楔子|序章|序|番外|终章|后记|尾声).{0,40}$`,
    example: "激进规则, 适配更多非常用格式",
    enabledByDefault: false,
    builtIn: true,
  },
  {
    id: "vi-chuong-phan",
    name: "Tiếng Việt: Chương/Phần",
    regex: `^[ \\t]{0,4}(?:(?:[Cc]hương|[Cc]huong|[Pp]hần|[Pp]han|[Qq]uyển|[Qq]uyen|[Hh]ồi|[Hh]oi)\\s{0,4}(?:\\d{1,5}|[IVXLCDMivxlcdm]{1,10})|(?:Lời\\s{1,3}(?:mở\\s{1,3}đầu|nói\\s{1,3}đầu)|Mở\\s{1,3}đầu|Kết\\s{1,3}thúc|Ngoại\\s{1,3}truyện|Phụ\\s{1,3}lục)).{0,150}$`,
    example: "Chương 12: Khởi đầu",
    enabledByDefault: true,
    builtIn: true,
  },
];

export const CHAPTER_RULES_CATALOG_BY_ID = Object.fromEntries(
  CHAPTER_RULES_CATALOG.map((r) => [r.id, r])
) as Record<string, ChapterRuleDefinition>;
