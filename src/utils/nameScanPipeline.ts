/**
 * Quét & lọc tên riêng: 5B (khớp Lab), 6BC (lọc nhiễu), 7B (0 token API).
 */

import type { Chapter, DictItem, PronounMapping } from "../types";
import { extractVietnameseNameLikePhrases } from "./nameConsistency";
import { isProperNamePhrase } from "./labSelectionPipeline";
import { getHanVietOffline } from "./hanVietOffline";
import { COMMON_CHINESE_WORDS_BLACKLIST } from "./dictScanConstants";

export type ScanChapterSlice = {
  sourceText: string;
  translatedText: string;
};

export type NameScanRow = {
  chinese: string;
  hanViet: string;
  vietnamese: string;
  translationSource: "vietphrase" | "lab" | "hv" | "none";
  /** 10B: phân loại thực thể (gợi ý) */
  entityKind?: "character" | "place" | "sect" | "title" | "skill" | "other";
  count: number;
  category: DictItem["category"];
  selected: boolean;
};

const VI_SUFFIX_TOKENS = new Set([
  // sect / place / title
  "tông",
  "môn",
  "phái",
  "giáo",
  "cung",
  "điện",
  "các",
  "cốc",
  "động",
  "sơn",
  "thành",
  "quận",
  "châu",
  "trấn",
  "quan",
  "giang",
  "hà",
  "hồ",
  "hải",
  "đảo",
  "quốc",
  "đế",
  "vương",
  "hầu",
  "công",
  "hoàng",
  // skill
  "công",
  "pháp",
  "tâm",
  "kiếm",
  "đao",
  "quyền",
  "chưởng",
  "chỉ",
  "thân",
  "bộ",
  "bí",
  "tuyệt",
  "kỹ",
  "học",
  "thông",
  // fiction-ish modifiers
  "ma",
  "thần",
  "tiên",
  "linh",
]);

/** Từ chức năng / cụm thường — không phải tên riêng (PA-3 nới lọc). */
const VP_REJECT_WORDS = new Set([
  "trong", "vòng", "phút", "giây", "giờ", "ngày", "tháng", "năm", "một", "hai", "ba", "bốn", "năm",
  "cái", "con", "người", "này", "đó", "kia", "ấy", "khi", "nếu", "thì", "mà", "và", "hoặc", "hay",
  "đi", "lại", "đến", "về", "là", "có", "không", "chưa", "rất", "quá", "như", "theo", "từ", "để",
  "cho", "với", "của", "các", "những", "một", "được", "bị", "sẽ", "đã", "đang", "vẫn", "còn", "phải",
  "cũng", "chỉ", "hơn", "nhất", "lên", "xuống", "ra", "vào", "nói", "hỏi", "đáp", "nhìn", "nghe",
  "thấy", "biết", "nghĩ", "làm", "bắt", "đầu", "kết", "thúc", "bên", "trên", "dưới", "giữa", "sau",
  "trước", "ngoài", "trong", "đây", "đó", "nơi", "chỗ", "lúc", "lần", "cách", "thế", "gì", "sao",
  "tại", "vì", "do", "bởi", "mà", "nên", "song", "nhưng", "tuy", "dù", "mặc", "dù",
]);

/** 10A: mở rộng cụm viết hoa bằng các token thường theo sau (vd. Thanh Vân tông). */
export function expandVietnameseSuffixAfterPhrase(phrase: string, line: string): string {
  const p = phrase.trim();
  const src = line || "";
  if (!p || !src) return p;

  const idx = src.indexOf(p);
  if (idx < 0) return p;

  const after = src.slice(idx + p.length).trimStart();
  if (!after) return p;

  const tokens = after.match(/^[\p{L}\p{M}'-]+(?:\s+[\p{L}\p{M}'-]+){0,3}/u)?.[0];
  if (!tokens) return p;

  const parts = tokens.split(/\s+/).filter(Boolean);
  const take: string[] = [];
  for (const t of parts) {
    const lower = t.toLowerCase();
    if (!VI_SUFFIX_TOKENS.has(lower)) break;
    take.push(t);
  }
  if (take.length === 0) return p;
  return `${p} ${take.join(" ")}`.replace(/\s+/g, " ").trim();
}

/** PA-3: lọc kết quả Vietphrase — chặn câu dài, chấp nhận Title Case và tên viết thường. */
export function isLikelyNameFromVietphrase(val: string): boolean {
  const v = (val || "").trim();
  if (!v) return false;
  if (v.length > 40) return false;
  if (v.length < 2) return false;
  if (/[0-9]/.test(v)) return false;
  if (/[.!,;:?()“”"[\]{}]/.test(v)) return false;

  const tokens = v.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 6) return false;

  for (const t of tokens) {
    if (!/^[\p{L}\p{M}'-]+$/u.test(t)) return false;
    if (VP_REJECT_WORDS.has(t.toLowerCase())) return false;
  }

  const hasTitle = tokens.some((t) => /^[A-ZÀ-Ỵ]/.test(t));

  if (hasTitle) {
    let lowerTailCount = 0;
    for (const t of tokens) {
      if (/^[A-ZÀ-Ỵ]/.test(t)) continue;
      const lower = t.toLowerCase();
      if (VI_SUFFIX_TOKENS.has(lower)) {
        lowerTailCount++;
        continue;
      }
      // âm tiết tên viết thường sau token viết hoa (vd. Hầu tuấn cát)
      continue;
    }
    if (lowerTailCount > 3) return false;
    return true;
  }

  // Toàn viết thường: 1–5 token, mỗi token ≥ 2 ký tự (vd. hầu tuấn cát)
  if (tokens.length > 5) return false;
  if (tokens.length === 1 && tokens[0].length < 2) return false;
  if (tokens.every((t) => t === t.toLowerCase())) return true;

  return false;
}

/** Nhãn hiển thị 10B trên UI quét tên. */
export function entityKindLabel(kind?: NameScanRow["entityKind"]): string {
  switch (kind) {
    case "character":
      return "Nhân vật";
    case "place":
      return "Địa danh";
    case "sect":
      return "Tông môn";
    case "title":
      return "Tước vị";
    case "skill":
      return "Võ công";
    case "other":
      return "Khác";
    default:
      return "—";
  }
}

/** Class badge theo loại thực thể (popup quét). */
export function entityKindBadgeClass(kind?: NameScanRow["entityKind"]): string {
  const base =
    "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border shrink-0 tracking-wide";
  switch (kind) {
    case "character":
      return `${base} text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 border-indigo-500/20`;
    case "place":
      return `${base} text-teal-600 dark:text-teal-400 bg-teal-500/10 border-teal-500/20`;
    case "sect":
      return `${base} text-violet-600 dark:text-violet-400 bg-violet-500/10 border-violet-500/20`;
    case "title":
      return `${base} text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20`;
    case "skill":
      return `${base} text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/20`;
    default:
      return `${base} text-app-text-muted bg-app-surface-muted border-app-border`;
  }
}

export function resolveTranslationFromVietphraseDict(
  chinese: string,
  refDict: Record<string, string> | null | undefined
): string {
  const zh = chinese.trim();
  if (!zh || !refDict) return "";
  const hit = refDict[zh] || "";
  return (hit || "").trim().replace(/\s+/g, " ");
}

/** 10B: phân loại thực thể theo hậu tố Hán + hậu tố Việt. */
export function inferEntityKind(chinese: string, vietnamese: string): NameScanRow["entityKind"] {
  const zh = chinese.trim();
  if (isScanNoiseChinesePhrase(zh)) return "other";

  const viLower = vietnamese.trim().toLowerCase();

  if (/[宗门派谷阁殿峰]$/.test(zh)) return "sect";
  if (/[帝王侯公]$/.test(zh)) return "title";
  if (/[山峰岭谷江河湖海城关州郡国]$/.test(zh)) return "place";
  if (/[诀法功掌拳指剑刀枪阵经书谱步]$/.test(zh)) return "skill";

  if (/(^|[\s])(?:tông|môn|phái|giáo|cung|điện|các|động|cốc|sơn môn)$/.test(viLower)) return "sect";
  if (/(^|[\s])(?:đế|vương|hoàng|hầu|công|quận công|thân vương|vương gia)$/.test(viLower)) return "title";
  if (/(^|[\s])(?:sơn|thành|quận|châu|trấn|quan|cốc|động|giang|hà|hồ|hải|đảo|quốc)$/.test(viLower)) return "place";
  if (/(^|[\s])(?:công pháp|tâm pháp|kiếm pháp|đao pháp|quyền pháp|chưởng|kiếm|đao|thân pháp|bộ pháp|bí pháp|tuyệt kỹ|tuyệt học|thần thông)$/.test(viLower)) return "skill";

  return "character";
}

/** 6BC — cụm Hán nhiễu / không phải tên riêng. */
const SCAN_NOISE_EXACT = new Set([
  ...COMMON_CHINESE_WORDS_BLACKLIST,
  "如此", "一声", "一下", "一点", "一切", "一直", "一定", "一些", "一种",
  "这个", "那个", "什么", "怎么", "为什么", "可以", "已经", "不是", "没有",
  "自己", "他们", "我们", "你们", "她们", "它们", "时候", "地方", "东西",
  "知道", "觉得", "看着", "听到", "说道", "问道", "答道", "开口", "话音",
  "只见", "忽然", "顿时", "瞬间", "片刻", "良久", "随即", "随后", "于是",
  "不过", "然而", "因此", "所以", "如果", "虽然", "但是", "而且", "或者",
  "为了", "因为", "通过", "关于", "对于", "按照", "根据", "由于", "为了",
  "之中", "之后", "之前", "之上", "之下", "之内", "之外", "之间", "之际",
  "之人", "之事", "之物", "之地", "之时", "之日", "之年", "之月",
  "十分", "身体", "却已经", "但是", "然而", "因为", "所以", "虽然", "尽管",
  "可能", "应该", "必须", "需要", "开始", "结束", "继续", "突然", "慢慢",
  "今天", "明天", "昨天", "后天", "上午", "下午", "傍晚", "早上", "晚上", "现在", "当时",
]);

const SCAN_NOISE_SUFFIXES = ["之人", "之事", "之物", "之地", "之时", "之日", "之年"];
const SCAN_NOISE_PREFIXES = ["如此", "一声", "一下", "一点"];

const SINGLE_CHAR_SCAN_NOISE = new Set([
  "的", "了", "呢", "吧", "呀", "吗", "么", "我", "你", "他", "她", "它", "们",
  "这", "那", "是", "在", "不", "有", "个", "和", "与", "之", "而", "以", "于",
  "并", "得", "着", "过", "里", "外", "上", "下", "去", "来", "都", "也", "就",
  "说", "道", "听", "见", "只", "要", "会", "能", "可", "好", "没", "多", "少",
  "大", "小", "头", "作", "自", "向", "从", "其", "为", "对", "把", "被", "让",
  "给", "还", "又", "再", "更", "最", "很", "非", "常", "十", "分", "相", "当",
]);

export function isScanNoiseChinesePhrase(word: string): boolean {
  const w = word.trim();
  if (!w || !/^[\u4e00-\u9fff]+$/.test(w)) return true;
  if (SCAN_NOISE_EXACT.has(w)) return true;
  if (w.length === 1 && SINGLE_CHAR_SCAN_NOISE.has(w)) return true;

  for (const suf of SCAN_NOISE_SUFFIXES) {
    if (w.endsWith(suf) && w.length <= suf.length + 1) return true;
  }
  for (const pre of SCAN_NOISE_PREFIXES) {
    if (w.startsWith(pre)) return true;
  }

  const uniqueChars = new Set([...w]);
  if (w.length >= 2 && uniqueChars.size === 1) return true;

  return false;
}

function splitBilingualLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** Khớp Lab có hợp lý với số chữ Hán không (tránh «Sở Hoan» cho 十分, «Lục» cho 琳琅). */
export function isLabMatchPlausible(chinese: string, vietnamese: string): boolean {
  const zh = chinese.trim();
  const vi = vietnamese.trim();
  if (!zh || !vi) return false;
  // Loại cụm Hán nhiễu (vd. 十分), tránh khớp nhầm số liệu/tiểu từ.
  if (isScanNoiseChinesePhrase(zh)) return false;
  if (!isLikelyNameFromVietphrase(vi)) return false;

  const hanLen = [...zh].length;
  const viWords = vi.split(/\s+/).filter(Boolean).length;
  if (hanLen === 1) return viWords >= 1 && viWords <= 2;
  if (hanLen === 2) return viWords >= 2 && viWords <= 3;
  if (hanLen <= 4) return viWords >= hanLen - 1 && viWords <= hanLen + 1;
  return viWords >= 2 && viWords <= hanLen + 2;
}

/**
 * 5B — Tìm tên tiếng Việt trong bản dịch Lab cùng dòng với cụm Hán.
 */
export function resolveTranslationFromLabCorpus(
  chinese: string,
  chapters: ScanChapterSlice[]
): { vietnamese: string; confidence: number } | null {
  const zh = chinese.trim();
  if (!zh || isScanNoiseChinesePhrase(zh)) return null;

  const hanLen = [...zh].length;
  const scores = new Map<string, number>();

  for (const ch of chapters) {
    const src = ch.sourceText?.trim();
    const tr = ch.translatedText?.trim();
    if (!src || !tr) continue;

    const srcLines = splitBilingualLines(src);
    const trLines = splitBilingualLines(tr);
    const max = Math.max(srcLines.length, trLines.length);

    for (let i = 0; i < max; i++) {
      const lineZh = srcLines[i] || "";
      const lineVi = trLines[i] || "";
      if (!lineZh.includes(zh) || !lineVi.trim()) continue;

      const phrases = extractVietnameseNameLikePhrases(lineVi)
        .map((p) => expandVietnameseSuffixAfterPhrase(p, lineVi))
        .filter(Boolean);

      for (const phrase of phrases) {
        if (!isProperNamePhrase(phrase)) continue;
        if (!isLabMatchPlausible(zh, phrase)) continue;

        let score = 4;
        const viWords = phrase.split(/\s+/).filter(Boolean).length;
        if (viWords === hanLen) score += 6;
        else if (viWords === hanLen + 1) score += 3;
        if (lineVi.includes(phrase)) score += 2;
        scores.set(phrase, (scores.get(phrase) || 0) + score);
      }
    }
  }

  let best = "";
  let bestScore = 0;
  for (const [phrase, score] of scores) {
    if (score > bestScore) {
      bestScore = score;
      best = phrase;
    }
  }

  if (!best || bestScore < 6) return null;
  if (!isLabMatchPlausible(zh, best)) return null;
  return { vietnamese: best, confidence: Math.min(100, bestScore * 8) };
}

const LAB_LINE_MATCH_MIN_SCORE = 6;

function scoreLabPhraseOnLine(chinese: string, phrase: string, lineVi: string): number {
  const zh = chinese.trim();
  const hanLen = [...zh].length;
  let score = 4;
  const viWords = phrase.split(/\s+/).filter(Boolean).length;
  if (viWords === hanLen) score += 6;
  else if (viWords === hanLen + 1) score += 3;
  if (lineVi.includes(phrase)) score += 2;
  return score;
}

/** 3A — Tối đa một cụm Việt khớp nhất trên từng dòng Hán–Việt (tránh «Giả Hành» lẫn sang cụm Hán khác). */
export function pickBestLabPhraseForChineseOnLine(
  chinese: string,
  lineZh: string,
  lineVi: string
): string | null {
  const zh = chinese.trim();
  if (!zh || !lineZh.includes(zh) || !lineVi.trim()) return null;
  if (isScanNoiseChinesePhrase(zh)) return null;

  let best = "";
  let bestScore = 0;

  const phrases = extractVietnameseNameLikePhrases(lineVi)
    .map((p) => expandVietnameseSuffixAfterPhrase(p, lineVi))
    .filter(Boolean);

  for (const phrase of phrases) {
    if (!isProperNamePhrase(phrase)) continue;
    if (!isLabMatchPlausible(zh, phrase)) continue;

    const score = scoreLabPhraseOnLine(zh, phrase, lineVi);
    if (score > bestScore) {
      bestScore = score;
      best = phrase;
    }
  }

  if (!best || bestScore < LAB_LINE_MATCH_MIN_SCORE) return null;
  if (!isLabMatchPlausible(zh, best)) return null;
  return best;
}

/** Thu thập biến thể Việt đã gán cho cụm Hán theo từng dòng căn chỉnh (import từ điển riêng). */
export function collectAlignedLabVariantsForChinese(
  chinese: string,
  chapters: ScanChapterSlice[]
): string[] {
  const zh = chinese.trim();
  if (!zh || isScanNoiseChinesePhrase(zh)) return [];

  const variants = new Set<string>();

  const labBest = resolveTranslationFromLabCorpus(zh, chapters);
  if (labBest?.vietnamese?.trim()) {
    variants.add(labBest.vietnamese.trim());
  }

  for (const ch of chapters) {
    const src = ch.sourceText?.trim();
    const tr = ch.translatedText?.trim();
    if (!src || !tr) continue;

    const srcLines = splitBilingualLines(src);
    const trLines = splitBilingualLines(tr);
    const max = Math.max(srcLines.length, trLines.length);

    for (let i = 0; i < max; i++) {
      const lineZh = srcLines[i] || "";
      const lineVi = trLines[i] || "";
      const pick = pickBestLabPhraseForChineseOnLine(zh, lineZh, lineVi);
      if (pick) variants.add(pick);
    }
  }

  return [...variants];
}

/** @deprecated Dùng collectAlignedLabVariantsForChinese */
export const collectLabVietnameseVariantsForChinese = collectAlignedLabVariantsForChinese;

/** 10C: map thực thể -> category của dict. */
export function inferScanCategory(
  chinese: string,
  entityKind?: NameScanRow["entityKind"]
): DictItem["category"] {
  const kind = entityKind;
  if (kind === "sect") return "sect";
  if (kind === "skill") return "item";
  if (kind === "place") return "other";
  if (kind === "title") return "history";

  // fallback theo hậu tố Hán (trường hợp chưa có Việt)
  if (
    chinese.endsWith("宗") ||
    chinese.endsWith("门") ||
    chinese.endsWith("派") ||
    chinese.endsWith("谷") ||
    chinese.endsWith("阁") ||
    chinese.endsWith("殿") ||
    chinese.endsWith("峰")
  ) {
    return "sect";
  }
  if (
    chinese.endsWith("剑") ||
    chinese.endsWith("刀") ||
    chinese.endsWith("法") ||
    chinese.endsWith("丹") ||
    chinese.endsWith("气")
  ) {
    return "item";
  }
  return "name";
}

export function buildNameScanRow(
  chinese: string,
  count: number,
  chapters: ScanChapterSlice[],
  dictItems: DictItem[],
  pronounMappings: PronounMapping[],
  refDict?: Record<string, string>
): NameScanRow {
  const vietphrase = resolveTranslationFromVietphraseDict(chinese, refDict);
  const vietphraseOk = !!vietphrase && isLikelyNameFromVietphrase(vietphrase);
  const labHit = vietphraseOk ? null : resolveTranslationFromLabCorpus(chinese, chapters);
  const hanViet = getHanVietOffline(chinese, "", dictItems, pronounMappings);

  // PA-3: Vietphrase -> Lab -> HV offline (fallback có lọc)
  let vietnamese = "";
  let translationSource: NameScanRow["translationSource"] = "none";
  if (vietphraseOk) {
    vietnamese = vietphrase;
    translationSource = "vietphrase";
  } else if (labHit?.vietnamese && isLabMatchPlausible(chinese, labHit.vietnamese)) {
    vietnamese = labHit.vietnamese;
    translationSource = "lab";
  } else if (hanViet && isLikelyNameFromVietphrase(hanViet)) {
    vietnamese = hanViet;
    translationSource = "hv";
  }

  const entityKind = vietnamese ? inferEntityKind(chinese, vietnamese) : "other";
  const category = inferScanCategory(chinese, entityKind);

  return {
    chinese,
    hanViet: hanViet || chinese,
    vietnamese,
    translationSource,
    entityKind,
    count,
    category,
    selected: true,
  };
}

/** PA-3: không cần preload tài nguyên mạng/token. */
export async function prepareNameScanResources(): Promise<void> {
  return;
}

export function chaptersToScanSlices(chapters: Chapter[]): ScanChapterSlice[] {
  return chapters.map((ch) => ({
    sourceText: ch.sourceText || "",
    translatedText: ch.translatedText || "",
  }));
}
