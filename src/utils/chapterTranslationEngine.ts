import { TranslationSettings } from "../types";
import { clampThreadCount, mapWithConcurrency } from "./concurrency";
import {
  buildSystemInstruction,
  isDeepSeekChunkSplitError,
  translateText,
  TranslateParams,
} from "./translationClient";
import type { TranslationPriority } from "./translationQueue";
import {
  buildNumberedLineUserPrefix,
  buildNumberedSourcePayload,
  parseNumberedTranslationResponse,
  realignTranslationToSourceLineCount,
} from "./translationLineProtocol";
import {
  buildChunkContinuityPrefix,
  takeTailLines,
} from "./chunkContinuity";
import {
  normalizeDictContextForPrompt,
  selectDictContextForChunk,
} from "./dictContextBuilder";
import { logTranslationTelemetry } from "./translationTelemetry";

/** Chương ngắn/vừa: một request */
export const TIER_A_MAX_CHARS = 7000;
export const TIER_A_MAX_LINES = 150;

/** Chương dài: chia khối theo dòng */
export const TIER_B_LINES_PER_CHUNK = 100;

/**
 * DeepSeek V4 (context ~1M token theo nhà cung cấp): vẫn chia khối vừa phải vì
 * phản hồi rỗng thường do đoạn quá nặng / max_tokens đầu ra — không phải hết context.
 */
/** Khối vừa + căn dòng cục bộ / mã [Lnnn] — ít request hơn chia 24 dòng. */
export const TIER_B_LINES_PER_CHUNK_DEEPSEEK = 42;

export const TIER_A_MAX_CHARS_DEEPSEEK = 6500;

export const CHUNK_MAX_CHARS_DEEPSEEK = 4200;

export const DEEPSEEK_FORCE_CHUNK_CHARS = 9000;
export const DEEPSEEK_FORCE_CHUNK_LINES = 120;

/**
 * Song song tối đa các đoạn trong cùng một chương (tách khỏi batch nhiều chương).
 * Trần thấp hơn maxThreads để giảm burst RPM khi vừa dịch nhiều chương vừa nhiều đoạn.
 */
export const CHAPTER_CHUNK_MAX_CONCURRENCY = 3;
export const CHAPTER_RESUME_CACHE_MAX_ENTRIES = 20;

/** Khi API trả rỗng: chia đôi đoạn và gọi lại cùng model (không đổi sang Pro). */
export const DEEPSEEK_EMPTY_SPLIT_MIN_LINES = 3;
export const DEEPSEEK_EMPTY_SPLIT_MAX_DEPTH = 6;

/** Bỏ qua thử 1 shot, vào chia khối ngay */
export const FORCE_CHUNK_CHARS = 12000;
export const FORCE_CHUNK_LINES = 250;

const AVG_INPUT_CHARS_PER_TOKEN = 3.5;
const AVG_OUTPUT_CHARS_PER_TOKEN = 2.0;

type ChunkResumeState = {
  totalChunks: number;
  parts: Map<number, string>;
  updatedAt: number;
};

const chapterChunkResumeCache = new Map<string, ChunkResumeState>();

const fastHash = (value: string): string => {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
};

const buildChunkResumeKey = (
  sourceText: string,
  model: string,
  temperature: number | undefined,
  prompt1: string | undefined,
  prompt2: string | undefined,
  dictContext: string | undefined,
  chunkLineCount: number
): string => {
  const normalizedDict = normalizeDictContextForPrompt(dictContext);
  return [
    model,
    String(temperature ?? ""),
    fastHash(prompt1 ?? ""),
    fastHash(prompt2 ?? ""),
    fastHash(normalizedDict),
    chunkLineCount,
    fastHash(sourceText),
  ].join("::");
};

const getOrInitChunkResumeState = (
  key: string,
  totalChunks: number
): ChunkResumeState => {
  const existing = chapterChunkResumeCache.get(key);
  if (existing && existing.totalChunks === totalChunks) {
    existing.updatedAt = Date.now();
    return existing;
  }
  const next: ChunkResumeState = {
    totalChunks,
    parts: new Map<number, string>(),
    updatedAt: Date.now(),
  };
  chapterChunkResumeCache.set(key, next);
  while (chapterChunkResumeCache.size > CHAPTER_RESUME_CACHE_MAX_ENTRIES) {
    const oldestKey = chapterChunkResumeCache.keys().next().value;
    if (!oldestKey) break;
    chapterChunkResumeCache.delete(oldestKey);
  }
  return next;
};

const isAdaptiveConcurrencyError = (err: unknown): boolean => {
  if (isDeepSeekChunkSplitError(err)) return true;
  if (!(err instanceof Error)) return false;
  const message = err.message.toLowerCase();
  return (
    message.includes("rate limit") ||
    message.includes("429") ||
    message.includes("too many requests") ||
    message.includes("overloaded") ||
    message.includes("capacity") ||
    message.includes("throttle") ||
    message.includes("timeout") ||
    message.includes("hết thời gian chờ") ||
    message.includes("failed to fetch") ||
    message.includes("lỗi mạng") ||
    message.includes("api trả về rỗng") ||
    message.includes("resource_exhausted")
  );
};

export type ChapterTranslationTier = "single" | "chunked";

export type ChapterTranslationPlan = {
  tier: ChapterTranslationTier;
  charCount: number;
  lineCount: number;
  chunkLineCount: number;
};

export type LineCountValidation = {
  ok: boolean;
  sourceLines: number;
  translatedLines: number;
};

export const normalizeChapterText = (text: string): string =>
  text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

export const splitChapterLines = (text: string): string[] =>
  normalizeChapterText(text).split("\n");

export const joinChapterLines = (lines: string[]): string => lines.join("\n");

export const countChapterLines = (text: string): number => splitChapterLines(text).length;

export type ChapterTranslationResult = {
  translatedTitle: string;
  translatedText: string;
};

export type ChapterTokenBudgetEstimate = {
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedTotalTokens: number;
  chunkCount: number;
  dictChars: number;
  systemChars: number;
  warnings: string[];
};

/** Gộp tiêu đề + thân để dịch một request (dòng 1 = tiêu đề). */
export const buildChapterSourceWithTitle = (
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

/** Tách kết quả dịch: dòng đầu → translatedTitle, phần còn lại → translatedText. */
export const splitChapterTranslationResult = (
  translatedCombined: string,
  hasTitleLine: boolean
): ChapterTranslationResult => {
  const normalized = normalizeChapterText(translatedCombined);
  if (!normalized.trim()) {
    return { translatedTitle: "", translatedText: "" };
  }
  if (!hasTitleLine) {
    return { translatedTitle: "", translatedText: normalized };
  }
  const lines = splitChapterLines(normalized);
  if (lines.length === 0) {
    return { translatedTitle: "", translatedText: "" };
  }
  const [first, ...rest] = lines;
  return {
    translatedTitle: first,
    translatedText: joinChapterLines(rest),
  };
};

/** Chuỗi Hán/Việt cho CompareView (dòng 0 = tiêu đề khi có). */
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

export const resolveChunkLineCountForModel = (modelId: string): number => {
  if (modelId.startsWith("deepseek-")) return TIER_B_LINES_PER_CHUNK_DEEPSEEK;
  return TIER_B_LINES_PER_CHUNK;
};

export const resolveTierAMaxCharsForModel = (modelId: string): number => {
  if (modelId.startsWith("deepseek-")) return TIER_A_MAX_CHARS_DEEPSEEK;
  return TIER_A_MAX_CHARS;
};

export const resolveChapterTranslationPlan = (
  sourceText: string,
  modelId = ""
): ChapterTranslationPlan => {
  const normalized = normalizeChapterText(sourceText);
  const charCount = normalized.length;
  const lineCount = countChapterLines(normalized);
  const chunkLineCount = resolveChunkLineCountForModel(modelId);
  const tierAMaxChars = resolveTierAMaxCharsForModel(modelId);
  const isDeepSeek = modelId.startsWith("deepseek-");
  const forceChars = isDeepSeek ? DEEPSEEK_FORCE_CHUNK_CHARS : FORCE_CHUNK_CHARS;
  const forceLines = isDeepSeek ? DEEPSEEK_FORCE_CHUNK_LINES : FORCE_CHUNK_LINES;

  if (charCount > forceChars || lineCount > forceLines) {
    return { tier: "chunked", charCount, lineCount, chunkLineCount };
  }
  if (charCount > tierAMaxChars || lineCount > TIER_A_MAX_LINES) {
    return { tier: "chunked", charCount, lineCount, chunkLineCount };
  }
  return { tier: "single", charCount, lineCount, chunkLineCount };
};

export type LineChunkRange = {
  startLine: number;
  endLine: number;
  lineCount: number;
};

export const splitLinesIntoChunks = (
  lines: string[],
  chunkSize: number
): { chunks: string[]; ranges: LineChunkRange[] } => {
  if (lines.length === 0) {
    return { chunks: [""], ranges: [{ startLine: 1, endLine: 1, lineCount: 1 }] };
  }

  const chunks: string[] = [];
  const ranges: LineChunkRange[] = [];

  for (let i = 0; i < lines.length; i += chunkSize) {
    const slice = lines.slice(i, i + chunkSize);
    chunks.push(joinChapterLines(slice));
    ranges.push({
      startLine: i + 1,
      endLine: i + slice.length,
      lineCount: slice.length,
    });
  }

  return { chunks, ranges };
};

export const buildLineCountUserPrefix = (opts: {
  lineCount: number;
  chunkIndex?: number;
  totalChunks?: number;
  startLine?: number;
  endLine?: number;
  prompt1?: string;
  prompt2?: string;
}): string => {
  const { lineCount, chunkIndex, totalChunks, startLine, endLine, prompt1, prompt2 } = opts;
  const styleHint =
    "Dịch theo NGHĨA tiếng Việt tự nhiên (không phiên âm Hán-Việt từng chữ; tên riêng có thể giữ âm Hán-Việt). ";
  const chunkHint =
    totalChunks && totalChunks > 1 && chunkIndex !== undefined && startLine !== undefined && endLine !== undefined
      ? `Đây là đoạn ${chunkIndex + 1}/${totalChunks} của chương (dòng gốc ${startLine}–${endLine}). `
      : "";
  const titleHint =
    startLine === 1
      ? "Dòng 1 là tiêu đề chương; các dòng sau là nội dung chương. "
      : "";
  return (
    `${chunkHint}${titleHint}${styleHint}` +
    `Văn bản tiếng Trung bên dưới có đúng ${lineCount} dòng (phân tách bằng ký tự xuống dòng). ` +
    `Bạn PHẢI trả về bản dịch tiếng Việt với đúng ${lineCount} dòng: mỗi dòng đầu vào tương ứng đúng một dòng đầu ra, ` +
    `không gộp hai dòng, không tách thêm, không thêm tiêu đề hay giải thích. Giữ dòng trống nếu dòng gốc trống.\n\n`
  );
};

export const buildLineCorrectionUserText = (
  sourceChunk: string,
  badTranslation: string,
  expectedLines: number,
  actualLines: number
): string => {
  return (
    `Bản dịch trước có ${actualLines} dòng nhưng bản gốc có đúng ${expectedLines} dòng. ` +
    `Bạn PHẢI trả về đúng ${expectedLines} dòng tiếng Việt: chỉ gộp hoặc tách dòng cho khớp số lượng, giữ nguyên nghĩa từng dòng, không thêm giải thích.\n\n` +
    `--- GỐC (${expectedLines} dòng) ---\n${sourceChunk}\n\n` +
    `--- BẢN LỖI (${actualLines} dòng) ---\n${badTranslation}`
  );
};

export const isLineCountMismatchError = (err: unknown): boolean =>
  err instanceof Error && err.message.includes("Số dòng dịch không khớp");

/** Chỉ chia đôi khi rỗng / mạng — lệch dòng xử lý bằng căn cục bộ trước. */
export const isDeepSeekRecoverableChunkError = (err: unknown): boolean =>
  isDeepSeekChunkSplitError(err);

/** Đoạn trong cùng chương: song song khi maxThreads > 1 và không bật dịch tuần tự. */
export const resolveChapterChunkConcurrency = (
  _modelId: string,
  settings: TranslationSettings
): number => {
  if (settings.translationSequentialChunks) return 1;
  const threads = clampThreadCount(settings.maxThreads, 5);
  if (threads <= 1) return 1;
  return Math.min(CHAPTER_CHUNK_MAX_CONCURRENCY, threads);
};

export const validateTranslationLineCount = (
  sourceText: string,
  translatedText: string
): LineCountValidation => {
  const sourceLines = countChapterLines(sourceText);
  const translatedLines = countChapterLines(translatedText);
  return {
    ok: sourceLines === translatedLines,
    sourceLines,
    translatedLines,
  };
};

export type TranslateChapterParams = Omit<TranslateParams, "text"> & {
  sourceText: string;
  chapterTitle?: string;
  settings: TranslationSettings;
  priority?: TranslationPriority;
};

const callTranslate = async (
  text: string,
  base: Omit<TranslateChapterParams, "sourceText" | "settings">,
  settings: TranslationSettings,
  priority?: TranslationPriority
): Promise<string> => {
  const output = await translateText(
    {
      text,
      model: base.model,
      temperature: base.temperature,
      apiKeys: base.apiKeys,
      prompt1: base.prompt1,
      prompt2: base.prompt2,
      dictContext: base.dictContext,
      priority,
      directApi: true,
    },
    settings
  );
  return output.trimEnd();
};

const isDeepSeekTranslationModel = (modelId: string): boolean =>
  modelId.startsWith("deepseek-");

const resolveTranslatedWithLineSync = (
  sourceChunk: string,
  rawTranslated: string
): { text: string; validation: LineCountValidation } => {
  const numbered = parseNumberedTranslationResponse(rawTranslated, countChapterLines(sourceChunk));
  let candidate = numbered ?? rawTranslated;
  let validation = validateTranslationLineCount(sourceChunk, candidate);
  if (validation.ok) {
    return { text: candidate, validation };
  }

  candidate = realignTranslationToSourceLineCount(sourceChunk, candidate);
  validation = validateTranslationLineCount(sourceChunk, candidate);
  return { text: candidate, validation };
};

const translateAndValidateLines = async (
  sourceChunk: string,
  base: Omit<TranslateChapterParams, "sourceText" | "settings">,
  settings: TranslationSettings,
  meta: {
    lineCount: number;
    chunkIndex?: number;
    totalChunks?: number;
    startLine?: number;
    endLine?: number;
  },
  priority?: TranslationPriority,
  continuityPrefix?: string
): Promise<string> => {
  const numbered = buildNumberedSourcePayload(sourceChunk);
  const prefix = buildNumberedLineUserPrefix({
    lineCount: numbered.lineCount,
    chunkIndex: meta.chunkIndex,
    totalChunks: meta.totalChunks,
    startLine: meta.startLine,
    endLine: meta.endLine,
  });
  const userPayload = `${continuityPrefix ?? ""}${prefix}${numbered.payload}`;

  let raw = await callTranslate(userPayload, base, settings, priority);
  let resolved = resolveTranslatedWithLineSync(sourceChunk, raw);
  if (resolved.validation.ok) {
    return resolved.text;
  }

  const correctionText = buildLineCorrectionUserText(
    sourceChunk,
    resolved.text,
    resolved.validation.sourceLines,
    resolved.validation.translatedLines
  );
  raw = await callTranslate(correctionText, base, settings, priority);
  resolved = resolveTranslatedWithLineSync(sourceChunk, raw);
  if (resolved.validation.ok) {
    return resolved.text;
  }

  throw new Error(
    `[${base.model}] Số dòng dịch không khớp (${resolved.validation.translatedLines}/${resolved.validation.sourceLines}). ` +
      (meta.startLine !== undefined ? `Đoạn dòng ${meta.startLine}–${meta.endLine}. ` : "") +
      "Thử lại hoặc chia nhỏ chương trong Lab."
  );
};

const translateChunkWithValidation = async (
  sourceChunk: string,
  base: Omit<TranslateChapterParams, "sourceText" | "settings">,
  settings: TranslationSettings,
  meta: {
    lineCount: number;
    chunkIndex?: number;
    totalChunks?: number;
    startLine?: number;
    endLine?: number;
  },
  priority?: TranslationPriority,
  splitDepth = 0,
  continuityPrefix?: string
): Promise<string> => {
  try {
    return await translateAndValidateLines(
      sourceChunk,
      base,
      settings,
      meta,
      priority,
      continuityPrefix
    );
  } catch (err) {
    const canSplit =
      isDeepSeekTranslationModel(base.model) &&
      isDeepSeekRecoverableChunkError(err) &&
      splitDepth < DEEPSEEK_EMPTY_SPLIT_MAX_DEPTH &&
      meta.lineCount >= DEEPSEEK_EMPTY_SPLIT_MIN_LINES;

    if (!canSplit) {
      throw err;
    }

    const lines = splitChapterLines(sourceChunk);
    const halfSize = Math.max(1, Math.ceil(lines.length / 2));
    const { chunks, ranges } = splitLinesIntoChunks(lines, halfSize);
    const parts: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const subRange = ranges[i];
      const globalStart =
        meta.startLine !== undefined ? meta.startLine + subRange.startLine - 1 : undefined;
      const globalEnd =
        meta.startLine !== undefined ? meta.startLine + subRange.endLine - 1 : undefined;

      parts.push(
        await translateChunkWithValidation(
          chunks[i],
          base,
          settings,
          {
            lineCount: subRange.lineCount,
            chunkIndex: meta.chunkIndex,
            totalChunks: meta.totalChunks,
            startLine: globalStart,
            endLine: globalEnd,
          },
          priority,
          splitDepth + 1,
          continuityPrefix
        )
      );
    }

    return parts.join("\n");
  }
};

const translateSingleShot = async (
  sourceText: string,
  base: Omit<TranslateChapterParams, "sourceText" | "settings">,
  settings: TranslationSettings,
  lineCount: number,
  priority?: TranslationPriority
): Promise<string> =>
  translateChunkWithValidation(
    sourceText,
    base,
    settings,
    { lineCount },
    priority
  );

export const splitLinesIntoChunksWithCharCap = (
  lines: string[],
  chunkLineCount: number,
  maxCharsPerChunk: number | null
): { chunks: string[]; ranges: LineChunkRange[] } => {
  const { chunks, ranges } = splitLinesIntoChunks(lines, chunkLineCount);
  if (!maxCharsPerChunk || maxCharsPerChunk <= 0) {
    return { chunks, ranges };
  }

  const outChunks: string[] = [];
  const outRanges: LineChunkRange[] = [];

  for (let i = 0; i < chunks.length; i++) {
    if (chunks[i].length <= maxCharsPerChunk) {
      outChunks.push(chunks[i]);
      outRanges.push(ranges[i]);
      continue;
    }

    const subLines = splitChapterLines(chunks[i]);
    const subLineSize = Math.max(
      5,
      Math.floor((subLines.length * maxCharsPerChunk) / chunks[i].length)
    );
    const sub = splitLinesIntoChunks(subLines, subLineSize);
    const baseStart = ranges[i].startLine;

    for (let j = 0; j < sub.chunks.length; j++) {
      outChunks.push(sub.chunks[j]);
      outRanges.push({
        startLine: baseStart + sub.ranges[j].startLine - 1,
        endLine: baseStart + sub.ranges[j].endLine - 1,
        lineCount: sub.ranges[j].lineCount,
      });
    }
  }

  return { chunks: outChunks, ranges: outRanges };
};

const translateChunked = async (
  sourceText: string,
  base: Omit<TranslateChapterParams, "sourceText" | "settings">,
  settings: TranslationSettings,
  chunkLineCount: number,
  priority?: TranslationPriority
): Promise<string> => {
  const lines = splitChapterLines(sourceText);
  const maxChars = base.model.startsWith("deepseek-") ? CHUNK_MAX_CHARS_DEEPSEEK : null;
  const { chunks, ranges } = splitLinesIntoChunksWithCharCap(lines, chunkLineCount, maxChars);
  const sequential = !!settings.translationSequentialChunks;
  const concurrency = sequential ? 1 : resolveChapterChunkConcurrency(base.model, settings);
  const resumeKey = buildChunkResumeKey(
    sourceText,
    base.model,
    base.temperature,
    base.prompt1,
    base.prompt2,
    base.dictContext,
    chunkLineCount
  );
  const resumeState = getOrInitChunkResumeState(resumeKey, chunks.length);
  const parts: string[] = new Array(chunks.length).fill("");

  const resolveChunkBase = (chunkText: string) => ({
    ...base,
    dictContext: selectDictContextForChunk(
      base.dictContext,
      chunkText,
      settings.translationChunkDictMaxChars
    ),
  });

  if (sequential && chunks.length > 1) {
    let prevSourceTail = "";
    let prevTranslatedTail = "";
    for (let i = 0; i < chunks.length; i++) {
      const resumed = resumeState.parts.get(i);
      if (resumed) {
        parts[i] = resumed;
        prevSourceTail = takeTailLines(chunks[i]);
        prevTranslatedTail = takeTailLines(resumed);
        continue;
      }
      const continuity = buildChunkContinuityPrefix(prevSourceTail, prevTranslatedTail);
      const part = await translateChunkWithValidation(
        chunks[i],
        resolveChunkBase(chunks[i]),
        settings,
        {
          lineCount: ranges[i].lineCount,
          chunkIndex: i,
          totalChunks: chunks.length,
          startLine: ranges[i].startLine,
          endLine: ranges[i].endLine,
        },
        priority,
        0,
        continuity
      );
      parts[i] = part;
      resumeState.parts.set(i, part);
      prevSourceTail = takeTailLines(chunks[i]);
      prevTranslatedTail = takeTailLines(part);
    }
    return parts.join("\n");
  }

  let pendingIndexes = chunks
    .map((_, index) => index)
    .filter((index) => {
      const resumed = resumeState.parts.get(index);
      if (!resumed) return true;
      parts[index] = resumed;
      return false;
    });
  let activeConcurrency = Math.max(1, concurrency);

  while (pendingIndexes.length > 0) {
    const passResults = await mapWithConcurrency(
      pendingIndexes,
      Math.min(activeConcurrency, pendingIndexes.length),
      async (index) => {
        const chunk = chunks[index];
        const range = ranges[index];
        try {
          const part = await translateChunkWithValidation(
            chunk,
            resolveChunkBase(chunk),
            settings,
            {
              lineCount: range.lineCount,
              chunkIndex: index,
              totalChunks: chunks.length,
              startLine: range.startLine,
              endLine: range.endLine,
            },
            priority
          );
          return { ok: true as const, index, part };
        } catch (err) {
          return { ok: false as const, index, err };
        }
      }
    );

    const failed = passResults.filter((item) => !item.ok);
    for (const item of passResults) {
      if (!item.ok) continue;
      parts[item.index] = item.part;
      resumeState.parts.set(item.index, item.part);
    }
    if (failed.length === 0) {
      break;
    }

    const adaptive = failed.every((item) => isAdaptiveConcurrencyError(item.err));
    if (adaptive && activeConcurrency > 1) {
      const nextConcurrency = activeConcurrency - 1;
      console.warn(
        `[translation] Hạ song song đoạn ${activeConcurrency} -> ${nextConcurrency} do lỗi tạm thời (${failed.length} đoạn).`
      );
      activeConcurrency = nextConcurrency;
      pendingIndexes = failed.map((item) => item.index);
      continue;
    }

    const hardFailure = failed[0].err;
    throw hardFailure instanceof Error ? hardFailure : new Error(String(hardFailure));
  }

  return parts.join("\n");
};

const estimateTokensFromChars = (chars: number, charsPerToken: number): number =>
  Math.max(1, Math.round(chars / charsPerToken));

export const estimateChapterTokenBudget = (params: {
  sourceText: string;
  chapterTitle?: string;
  model: string;
  prompt1?: string;
  prompt2?: string;
  dictContext?: string;
  settings: TranslationSettings;
}): ChapterTokenBudgetEstimate => {
  const { sourceText, chapterTitle, model, prompt1, prompt2, dictContext, settings } = params;
  const { combined } = buildChapterSourceWithTitle(chapterTitle, sourceText);
  const plan = resolveChapterTranslationPlan(combined, model);
  const normalizedDict = normalizeDictContextForPrompt(dictContext);
  const systemInstruction = buildSystemInstruction(prompt1, prompt2, normalizedDict);
  const warnings: string[] = [];

  if (!combined.trim()) {
    return {
      estimatedInputTokens: 0,
      estimatedOutputTokens: 0,
      estimatedTotalTokens: 0,
      chunkCount: 0,
      dictChars: normalizedDict.length,
      systemChars: systemInstruction.length,
      warnings,
    };
  }

  if (plan.tier === "single") {
    const inputChars = systemInstruction.length + combined.length;
    const outputChars = Math.round(combined.length * 1.12);
    const estimatedInputTokens = estimateTokensFromChars(inputChars, AVG_INPUT_CHARS_PER_TOKEN);
    const estimatedOutputTokens = estimateTokensFromChars(outputChars, AVG_OUTPUT_CHARS_PER_TOKEN);
    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
      chunkCount: 1,
      dictChars: normalizedDict.length,
      systemChars: systemInstruction.length,
      warnings,
    };
  }

  const lines = splitChapterLines(combined);
  const maxChars = model.startsWith("deepseek-") ? CHUNK_MAX_CHARS_DEEPSEEK : null;
  const { chunks, ranges } = splitLinesIntoChunksWithCharCap(lines, plan.chunkLineCount, maxChars);
  const sequential = !!settings.translationSequentialChunks;

  let inputChars = 0;
  let outputChars = 0;
  let maxDictChars = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const range = ranges[i];
    const chunkDict = selectDictContextForChunk(
      normalizedDict,
      chunk,
      settings.translationChunkDictMaxChars
    );
    const chunkSystem = buildSystemInstruction(prompt1, prompt2, chunkDict);
    maxDictChars = Math.max(maxDictChars, chunkDict.length);
    const numbered = buildNumberedSourcePayload(chunk);
    const prefix = buildNumberedLineUserPrefix({
      lineCount: numbered.lineCount,
      chunkIndex: i,
      totalChunks: chunks.length,
      startLine: range.startLine,
      endLine: range.endLine,
    });
    const continuityChars = sequential && i > 0 ? 500 : 0;
    inputChars += chunkSystem.length + prefix.length + numbered.payload.length + continuityChars;
    outputChars += Math.round(chunk.length * 1.12);
  }

  if (normalizedDict.length > 3000) {
    warnings.push("DictContext lớn; nên bật lọc theo chunk để giảm token.");
  }
  if (chunks.length >= 10) {
    warnings.push("Chương dài nhiều chunk; cân nhắc giới hạn ngân sách trước khi chạy.");
  }

  const estimatedInputTokens = estimateTokensFromChars(inputChars, AVG_INPUT_CHARS_PER_TOKEN);
  const estimatedOutputTokens = estimateTokensFromChars(outputChars, AVG_OUTPUT_CHARS_PER_TOKEN);
  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
    chunkCount: chunks.length,
    dictChars: maxDictChars,
    systemChars: systemInstruction.length,
    warnings,
  };
};

/**
 * Dịch cả chương: 1 request nếu ngắn/vừa; chia khối ~100 dòng nếu dài.
 * Luôn validate số dòng; retry chỉnh cấu trúc tối đa 1 lần mỗi đoạn.
 */
export const translateChapter = async (
  params: TranslateChapterParams
): Promise<ChapterTranslationResult> => {
  const { sourceText, chapterTitle, settings, priority, ...base } = params;
  const { combined, hasTitleLine } = buildChapterSourceWithTitle(chapterTitle, sourceText);
  if (!combined.trim()) {
    return { translatedTitle: "", translatedText: "" };
  }

  const plan = resolveChapterTranslationPlan(combined, base.model);

  logTranslationTelemetry("chapter_start", {
    chapterTitle: chapterTitle ?? "",
    tier: plan.tier,
    charCount: plan.charCount,
    lineCount: plan.lineCount,
    chunkLineCount: plan.chunkLineCount,
    model: base.model,
    priority: priority ?? "normal",
  });

  try {
    const translateBase = {
      model: base.model,
      temperature: base.temperature,
      apiKeys: base.apiKeys,
      prompt1: base.prompt1,
      prompt2: base.prompt2,
      dictContext: base.dictContext,
    };

    let translatedCombined: string;
    if (plan.tier === "chunked") {
      translatedCombined = await translateChunked(
        combined,
        translateBase,
        settings,
        plan.chunkLineCount,
        priority
      );
    } else {
      try {
        translatedCombined = await translateSingleShot(
          combined,
          translateBase,
          settings,
          plan.lineCount,
          priority
        );
      } catch (firstErr) {
        try {
          translatedCombined = await translateChunked(
            combined,
            translateBase,
            settings,
            plan.chunkLineCount,
            priority
          );
        } catch {
          throw firstErr;
        }
      }
    }

    const result = splitChapterTranslationResult(translatedCombined, hasTitleLine);

    logTranslationTelemetry("chapter_done", {
      chapterTitle: chapterTitle ?? "",
      tier: plan.tier,
      translatedChars: result.translatedText?.length ?? 0,
      model: base.model,
    });

    return result;
  } catch (err: unknown) {
    logTranslationTelemetry("chapter_error", {
      chapterTitle: chapterTitle ?? "",
      tier: plan.tier,
      model: base.model,
      message: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
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
  const v = validateTranslationLineCount(sourceCombined, translatedCombined);
  if (v.ok || !translatedCombined.trim()) return null;
  return `Số dòng Hán (${v.sourceLines}) và Việt (${v.translatedLines}) không khớp — đối chiếu có thể lệch. Dịch lại chương trong Lab hoặc hiệu đính từng dòng.`;
};
