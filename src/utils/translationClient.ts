import { TranslationSettings } from "../types";
import { DEFAULT_MODEL_ID, resolveSelectedModel } from "./aiModels";
import { normalizeDictContextForPrompt } from "./dictContextBuilder";
import {
  orderAttemptsByQuota,
  recordApiRateLimit,
  recordApiRequest,
  recordApiSuccess,
} from "./apiQuotaTracker";
import { runInTranslationQueue, TranslationPriority } from "./translationQueue";

export interface TranslateParams {
  text: string;
  model: string;
  temperature?: number;
  apiKeys?: {
    google?: string;
    openai?: string;
    claude?: string;
    deepseek?: string;
    qwen?: string;
  };
  prompt1?: string;
  prompt2?: string;
  dictContext?: string;
  /** Ưu tiên hàng đợi API — trang đang đọc: high; prefetch: low */
  priority?: TranslationPriority;
  /** Bỏ hàng đợi 1.4s — chỉ dùng cho các đoạn trong cùng một chương (song song). */
  directApi?: boolean;
}

type Provider = "google" | "openai" | "deepseek" | "qwen" | "claude";

export interface TranslationAttempt {
  provider: Provider;
  key: string;
  model: string;
}

export class TranslationApiError extends Error {
  status: number;
  retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.status = status;
    this.retryable = retryable;
  }
}

export const isEmptyTranslationApiError = (err: unknown): boolean =>
  err instanceof Error && err.message.includes("API trả về rỗng");

/** Lỗi đoạn DeepSeek có thể hồi bằng cách chia nhỏ (rỗng, timeout, mạng). */
export const isDeepSeekChunkSplitError = (err: unknown): boolean => {
  if (!(err instanceof Error)) return false;
  const m = err.message.toLowerCase();
  return (
    m.includes("api trả về rỗng") ||
    m.includes("failed to fetch") ||
    m.includes("hết thời gian chờ") ||
    m.includes("abort") ||
    m.includes("lỗi mạng") ||
    m.includes("network")
  );
};

/** Timeout mỗi request DeepSeek (ms) — tránh Failed to fetch trên APK khi đoạn dài. */
export const DEEPSEEK_FETCH_TIMEOUT_MS = 240_000;

const fetchWithTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Global cached phrases for lightning fast lookups
const clientTranslateCache = new Map<string, string>();

const PROVIDER_KEY_FIELD: Record<Provider, keyof NonNullable<TranslateParams["apiKeys"]>> = {
  google: "google",
  openai: "openai",
  deepseek: "deepseek",
  qwen: "qwen",
  claude: "claude",
};

/** Luôn gửi kèm — không thay chỉ thị người dùng; bổ sung định dạng đầu ra Lab. */
export const BUILTIN_LAB_OUTPUT_RULE = `QUY TẮC ĐẦU RA LAB (luôn áp dụng cùng chỉ thị người dùng):
- Dịch theo NGHĨA: câu tiếng Việt tự nhiên, đọc trôi chảy như văn Việt hiện đại.
- KHÔNG phiên âm máy móc từng chữ Hán sang Hán-Việt thuần (SAI: "thiên hồng nhất khốc", "hồn xuyên thế giới trung", "tại Ninh Quốc viễn thân chi thượng").
- Được dùng âm Hán-Việt cho tên riêng, địa danh, thuật ngữ (ví dụ: Hầu Tuấn Cát, Ninh Quốc) như trong ví dụ mẫu của bạn.
- Mỗi dòng gốc = đúng một dòng dịch; không gộp/tách dòng.`;

/** Khi người dùng đã có chỉ thị: chỉ giữ ràng buộc dòng, không lặp bảng đại từ. */
export const BUILTIN_LINE_STRUCTURE_ONLY = `RÀNG BUỘC KỸ THUẬT LAB:
1. TRUNG THÀNH NỘI DUNG: Dịch đúng, đủ, không thêm thắt bớt xén tình tiết.
2. CẤU TRÚC DÒNG: 1 dòng gốc tiếng Trung = 1 dòng tiếng Việt; không gộp hai dòng, không tách thêm.`;

/** Khi cả hai ô Cấu hình trống: core đầy đủ kèm bảng đại từ. */
export const BUILTIN_TRANSLATION_CORE = `Nhiệm vụ: Dịch văn bản tiếng Trung sang tiếng Việt, trung thành nội dung, bảo toàn cấu trúc dòng gốc.

BẮT BUỘC TUÂN THỦ NGHIÊM NGẶT CÁC ÁNH XẠ ĐẠI TỪ NHÂN XƯNG SAU ĐÂY:
- 我 -> ta
- 你 -> ngươi
- 您 -> ngài
- 他 -> hắn (luôn là "hắn", tuyệt đối không đổi đại từ này!)
- 她 -> nàng
- 它 -> nó
- 我们 -> chúng ta | 咱们 -> chúng ta
- ท่าน -> các vị
- 你们 -> các ngươi
- 您们 -> các ngài
- 她们 -> các nàng
- 它们 -> bọn họ
- 诸位 -> chư vị
- 同学 -> bạn học | 同学們 -> các bạn học
- 老师 -> lão sư | 老师们 -> các lão sư
- 哥 -> ca | 弟 -> đệ
- 叔 -> thúc | 舅 -> cữu
- 姨 -> di | 阿姨 -> a di
- 奶奶 -> bà bà | 妈妈 -> mụ mụ | 爷爷 -> gia gia
- 老板 -> lão bản | 女士 -> nữ sĩ | 这女人 -> nữ nhân này

RÀNG BUỘC KỸ THUẬT (luôn áp dụng):
1. TRUNG THÀNH TUYỆT ĐỐI: Dịch đúng, đủ, không thêm thắt bớt xén tình tiết nào.
2. CẤU TRÚC DÒNG: Giữ nguyên vẹn số hàng và ngắt đoạn, 1 dòng gốc tiếng Trung tương ứng với đúng 1 dòng tiếng Việt đã dịch. KHÔNG được phép gộp hai dòng hoặc tự ý tách rời đoạn gốc.`;

/** Chỉ dùng khi cả Mệnh lệnh 1 và 2 trong Cấu hình đều để trống. */
export const BUILTIN_TRANSLATION_STYLE = `Bạn là một DỊCH GIẢ CHUYÊN NGHIỆP 25 tuổi, chuyên dịch văn học Trung-Việt dồi dào kinh nghiệm cổ phong.

HƯỚNG DẪN BIÊN DỊCH (mặc định hệ thống):
3. Liên từ "和" nên được dịch là "cùng" thay vì "và".
4. Giữ nguyên các đơn vị tiền tệ, đơn vị đo lường trong bản gốc.
5. Tuyệt đối KHÔNG sử dụng các Trợ từ ngữ khí dư thừa hằng ngày (như nha, nga, đi, ba, nột, bỉ, hử, nhé) trong câu kết quả dịch văn học.
6. Dịch theo NGHĨA sang tiếng Việt chuẩn: câu văn tự nhiên, đọc trôi chảy như văn Việt. Chỉ dùng từ Hán Việt có chọn lọc cho danh từ riêng, tên võ học, địa danh khi cần — KHÔNG phiên âm máy móc từng chữ Hán (tránh kiểu「hồn xuyên thế giới trung, tại Ninh Quốc viễn thân chi thượng」).`;

export const hasUserTranslationPrompts = (prompt1?: string, prompt2?: string): boolean =>
  Boolean(prompt1?.trim() || prompt2?.trim());

const flattenJsonPromptValue = (value: unknown, indent = 0): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((item) => flattenJsonPromptValue(item, indent + 1))
      .filter(Boolean)
      .join("\n");
  }
  if (typeof value === "object") {
    const pad = "  ".repeat(indent);
    return Object.entries(value as Record<string, unknown>)
      .map(([key, child]) => {
        const body = flattenJsonPromptValue(child, indent + 1);
        if (!body) return "";
        if (body.includes("\n")) {
          return `${pad}${key}:\n${body}`;
        }
        return `${pad}${key}: ${body}`;
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
};

/** Chuyển prompt JSON trong Cấu hình sang văn bản dễ đọc cho model (Flash đôi khi bỏ qua JSON dài). */
export const normalizePromptForApi = (raw?: string): string => {
  const trimmed = raw?.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const flat = flattenJsonPromptValue(parsed).trim();
      if (flat) return flat;
    } catch {
      /* giữ nguyên chuỗi thô */
    }
  }
  return trimmed;
};

/** Ghép prompt Cấu hình: chỉ thị 1 trước, chỉ thị 2 sau. */
export const formatUserTranslationPrompts = (prompt1?: string, prompt2?: string): string => {
  const parts: string[] = [];
  const t1 = normalizePromptForApi(prompt1);
  const t2 = normalizePromptForApi(prompt2);
  if (t1) parts.push(`HƯỚNG DẪN DỊCH 1 (ưu tiên — do người dùng cấu hình):\n${t1}`);
  if (t2) parts.push(`HƯỚNG DẪN DỊCH 2 (do người dùng cấu hình):\n${t2}`);
  return parts.join("\n\n");
};

const normalizeSystemInstructionText = (text: string): string =>
  text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/**
 * System prompt Lab Dịch:
 * - Luôn: core kỹ thuật + từ điển (nếu có).
 * - Có nhập Mệnh lệnh 1 và/hoặc 2 → chỉ prompt người dùng (1 trước, 2 sau), không gửi BUILTIN_TRANSLATION_STYLE.
 * - Cả hai ô trống → thêm BUILTIN_TRANSLATION_STYLE.
 */
export const buildSystemInstruction = (prompt1?: string, prompt2?: string, dictContext?: string): string => {
  const hasUser = hasUserTranslationPrompts(prompt1, prompt2);
  const technical = hasUser ? BUILTIN_LINE_STRUCTURE_ONLY : BUILTIN_TRANSLATION_CORE;
  const guidance = hasUser
    ? formatUserTranslationPrompts(prompt1, prompt2)
    : BUILTIN_TRANSLATION_STYLE;
  const normalizedDict = normalizeDictContextForPrompt(dictContext);

  const dictBlock = normalizedDict
    ? `\n\nDANH MỤC THUẬT NGỮ BẮT BUỘC ÁP DỤNG:\n${normalizedDict}`
    : "";

  return normalizeSystemInstructionText(
    `${technical}\n\n${guidance}\n\n${BUILTIN_LAB_OUTPUT_RULE}${dictBlock}`
  );
};

/** Tách nhiều API key trong một ô (phân cách bằng dấu phẩy) */
export const parseApiKeys = (keyString?: string): string[] => {
  if (!keyString) return [];
  return keyString.split(",").map((k) => k.trim()).filter(Boolean);
};

/** Chọn ngẫu nhiên một key — chỉ dùng khi không cần retry tuần tự */
export const getActiveKey = (keyString?: string): string => {
  const keys = parseApiKeys(keyString);
  if (keys.length === 0) return "";
  return keys[Math.floor(Math.random() * keys.length)];
};

/** Rút gọn JSON lỗi API (DeepSeek/OpenAI…) thành câu đọc được */
export const formatHttpApiError = (
  providerLabel: string,
  status: number,
  detail: string,
  statusText?: string
): string => {
  let body = detail?.trim() || statusText || "Unknown error";
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; type?: string; code?: string };
      message?: string;
    };
    const inner = parsed.error?.message || parsed.message;
    if (inner) {
      const code = parsed.error?.code || parsed.error?.type;
      body = code ? `${inner} (${code})` : inner;
    }
  } catch {
    /* giữ nguyên chuỗi thô */
  }
  if (body.length > 4000) {
    body = `${body.slice(0, 4000)}… [cắt bớt — xem console nếu cần]`;
  }
  const statusPart = status > 0 ? `HTTP ${status}` : "mạng/CORS";
  return `[${providerLabel}] ${statusPart}: ${body}`;
};

/** Trích nội dung từ phản hồi OpenAI-compatible (DeepSeek, Qwen, …). */
export const extractChatCompletionContent = (data: unknown): string => {
  if (!data || typeof data !== "object") return "";
  const choice = (data as { choices?: unknown[] }).choices?.[0];
  if (!choice || typeof choice !== "object") return "";
  const message = (choice as { message?: Record<string, unknown> }).message;
  if (!message) return "";

  const content = message.content;
  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const text = content
      .filter((part): part is { type?: string; text?: string } => typeof part === "object" && part !== null)
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("")
      .trim();
    if (text) return text;
  }

  return "";
};

export const extractChatCompletionFinishReason = (data: unknown): string => {
  if (!data || typeof data !== "object") return "";
  const choice = (data as { choices?: unknown[] }).choices?.[0];
  if (!choice || typeof choice !== "object") return "";
  const reason = (choice as { finish_reason?: unknown }).finish_reason;
  return typeof reason === "string" ? reason : "";
};

/** Chỉ gọi đúng model DeepSeek người dùng chọn — không tự đổi sang Pro/Chat (tránh phí cao hơn). */
export const resolveDeepSeekApiModel = (model: string): string =>
  model.startsWith("deepseek-") ? model : "deepseek-v4-flash";

export const isRateLimitError = (status: number, detail: string): boolean => {
  if (status === 429 || status === 503) return true;
  const lower = detail.toLowerCase();
  return (
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("resource_exhausted") ||
    lower.includes("resource exhausted") ||
    lower.includes("quota") ||
    lower.includes("too many requests") ||
    lower.includes("overloaded") ||
    lower.includes("capacity") ||
    lower.includes("throttle")
  );
};

const getProviderForModel = (model: string): Provider | null => {
  if (model.startsWith("gemini-")) return "google";
  if (
    model.startsWith("gpt-") ||
    model.startsWith("o1-") ||
    model.startsWith("o3-") ||
    model.startsWith("chatgpt-")
  ) {
    return "openai";
  }
  if (model.startsWith("deepseek-")) return "deepseek";
  if (model.startsWith("qwen-") || model.includes("qwen")) return "qwen";
  if (model.startsWith("claude-")) return "claude";
  return null;
};

const defaultModelForProvider = (provider: Provider, preferredModel: string): string => {
  switch (provider) {
    case "google":
      return preferredModel.startsWith("gemini-") ? preferredModel : "gemini-3.5-flash";
    case "openai":
      return preferredModel.startsWith("gpt-") ||
        preferredModel.startsWith("o1-") ||
        preferredModel.startsWith("o3-")
        ? preferredModel
        : "gpt-5.4";
    case "deepseek":
      return preferredModel.startsWith("deepseek-") ? preferredModel : "deepseek-v4-flash";
    case "qwen":
      return preferredModel.startsWith("qwen-") || preferredModel.includes("qwen")
        ? preferredModel
        : "qwen-3.5-flash";
    case "claude":
      return preferredModel.startsWith("claude-") ? preferredModel : "claude-4-5-haiku";
    default:
      return preferredModel;
  }
};

/**
 * Danh sách lần gọi API theo thứ tự ưu tiên:
 * 1) Tất cả key của nhà cung cấp trùng model đã chọn
 * 2) (Nếu bật xoay chéo) các key nhà cung cấp khác với model fallback tương ứng
 */
export const buildTranslationAttempts = (
  selectModel: string,
  apiKeys: TranslateParams["apiKeys"] = {},
  enableCrossRotation = false
): TranslationAttempt[] => {
  const attempts: TranslationAttempt[] = [];
  const seen = new Set<string>();

  const push = (provider: Provider, key: string, model: string) => {
    const fingerprint = `${provider}::${key}`;
    if (!key || seen.has(fingerprint)) return;
    seen.add(fingerprint);
    attempts.push({ provider, key, model: defaultModelForProvider(provider, model) });
  };

  const primary = getProviderForModel(selectModel);
  if (primary) {
    for (const key of parseApiKeys(apiKeys[PROVIDER_KEY_FIELD[primary]])) {
      push(primary, key, selectModel);
    }
  }

  if (enableCrossRotation) {
    const crossOrder: Provider[] = ["google", "deepseek", "openai", "qwen", "claude"];
    for (const provider of crossOrder) {
      if (provider === primary) continue;
      for (const key of parseApiKeys(apiKeys[PROVIDER_KEY_FIELD[provider]])) {
        push(provider, key, selectModel);
      }
    }
  }

  // Không nhận diện model: thử mọi key đã nhập (theo thứ tự nhà cung cấp)
  if (attempts.length === 0) {
    const fallbackOrder: Provider[] = ["google", "deepseek", "openai", "qwen", "claude"];
    for (const provider of fallbackOrder) {
      for (const key of parseApiKeys(apiKeys[PROVIDER_KEY_FIELD[provider]])) {
        push(provider, key, selectModel);
      }
    }
  }

  return attempts;
};

// Routing utility for proxy server endpoint - Kept for general compliance but unused in direct local translation mode
export const getApiUrl = (endpoint: string, settings: TranslationSettings): string => {
  const customUrl = settings.remoteServerUrl?.trim();
  if (customUrl) {
    return `${customUrl.replace(/\/+$/, "")}${endpoint}`;
  }

  if (typeof window !== "undefined") {
    const origin = window.location.origin || "";
    const hostname = window.location.hostname || "";
    const protocol = window.location.protocol || "";

    if (
      protocol === "file:" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "" ||
      origin.startsWith("file://") ||
      origin.startsWith("app://") ||
      origin.startsWith("vscode-webview://")
    ) {
      const fallbackBase = "https://ais-pre-t22he6oun62wtyeg52lyym-376607593324.asia-southeast1.run.app";
      return `${fallbackBase}${endpoint}`;
    }
  }

  return endpoint;
};

const callTranslationApi = async (
  attempt: TranslationAttempt,
  text: string,
  systemInstruction: string,
  activeTemp: number
): Promise<string> => {
  const { provider, key, model } = attempt;

  if (provider === "google") {
    const modelId = model.startsWith("gemini-") ? model : "gemini-3.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        systemInstruction: { parts: [{ text: systemInstruction }] },
        generationConfig: { temperature: activeTemp },
      }),
    });

    const detail = res.ok ? "" : await res.text();
    if (!res.ok) {
      throw new TranslationApiError(
        formatHttpApiError("Google Gemini", res.status, detail, res.statusText),
        res.status,
        isRateLimitError(res.status, detail)
      );
    }

    const data = await res.json();
    const outputText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!outputText) {
      throw new TranslationApiError(
        "Không nhận được nội dung phản hồi dịch thuật từ máy chủ Google.",
        res.status,
        false
      );
    }
    return outputText;
  }

  if (provider === "openai") {
    const isReasoningModel = model.startsWith("o3-") || model.startsWith("o1-");
    const payload: Record<string, unknown> = {
      model: model.startsWith("gpt-") || model.startsWith("o3-") || model.startsWith("o1-") ? model : "gpt-5.4",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: text },
      ],
    };
    if (!isReasoningModel) {
      payload.temperature = activeTemp;
    }

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    });

    const detail = res.ok ? "" : await res.text();
    if (!res.ok) {
      throw new TranslationApiError(
        formatHttpApiError("OpenAI", res.status, detail, res.statusText),
        res.status,
        isRateLimitError(res.status, detail)
      );
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  if (provider === "deepseek") {
    if (!key.startsWith("sk-")) {
      throw new TranslationApiError(
        formatHttpApiError(
          "DeepSeek",
          401,
          "API key không đúng định dạng (thường bắt đầu bằng sk-). Kiểm tra lại ô DeepSeek trong Cấu hình."
        ),
        401,
        false
      );
    }

    const modelId = resolveDeepSeekApiModel(model);
    const payload: Record<string, unknown> = {
      model: modelId,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: text },
      ],
      max_tokens: 8192,
      temperature: activeTemp,
    };

    const requestInit: RequestInit = {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(payload),
    };

    let res: Response | null = null;
    let lastNetworkErr: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        res = await fetchWithTimeout(
          "https://api.deepseek.com/chat/completions",
          requestInit,
          DEEPSEEK_FETCH_TIMEOUT_MS
        );
        lastNetworkErr = null;
        break;
      } catch (networkErr: unknown) {
        lastNetworkErr = networkErr;
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    if (!res) {
      const isAbort =
        lastNetworkErr instanceof Error && lastNetworkErr.name === "AbortError";
      const hint = isAbort
        ? ` Hết thời gian chờ ${Math.round(DEEPSEEK_FETCH_TIMEOUT_MS / 1000)}s — đoạn có thể quá dài; app sẽ thử chia nhỏ.`
        : " Lỗi mạng (Failed to fetch): Wi‑Fi/4G không ổn định hoặc request quá dài. Giữ 1 luồng khi dịch chương dài, thử lại.";
      throw new TranslationApiError(
        formatHttpApiError("DeepSeek", 0, `${String(lastNetworkErr)}${hint}`),
        0,
        false
      );
    }

    const detail = res.ok ? "" : await res.text();
    if (res.ok) {
      const data = await res.json();
      const output = extractChatCompletionContent(data);
      if (!output.trim()) {
        const finishReason = extractChatCompletionFinishReason(data);
        const reasonHint = finishReason ? ` (finish_reason=${finishReason})` : "";
        throw new TranslationApiError(
          formatHttpApiError(
            "DeepSeek",
            res.status,
            `API trả về rỗng${reasonHint} — model ${modelId}; app sẽ tự chia nhỏ đoạn và thử lại.`
          ),
          res.status,
          false
        );
      }
      return output;
    }

    const formatted = formatHttpApiError("DeepSeek", res.status, detail, res.statusText);
    throw new TranslationApiError(
      `${formatted} (model: ${modelId})`,
      res.status,
      isRateLimitError(res.status, detail)
    );
  }

  if (provider === "qwen") {
    const res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: text },
        ],
        temperature: activeTemp,
      }),
    });

    const detail = res.ok ? "" : await res.text();
    if (!res.ok) {
      throw new TranslationApiError(
        `Qwen API returned error: ${detail || res.statusText}`,
        res.status,
        isRateLimitError(res.status, detail)
      );
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || "";
  }

  if (provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-out-of-band-cors": "true",
      },
      body: JSON.stringify({
        model: model.startsWith("claude-") ? model : "claude-4-5-haiku",
        max_tokens: 4000,
        system: systemInstruction,
        messages: [{ role: "user", content: text }],
        temperature: activeTemp,
      }),
    });

    const detail = res.ok ? "" : await res.text();
    if (!res.ok) {
      throw new TranslationApiError(
        `Claude API returned error: ${detail || res.statusText}`,
        res.status,
        isRateLimitError(res.status, detail)
      );
    }

    const data = await res.json();
    return data.content?.[0]?.text || "";
  }

  throw new TranslationApiError("Mô hình được chọn chưa hỗ trợ cuộc gọi cục bộ.", 0, false);
};

/**
 * Giai đoạn 0: sau 429 chỉ xoay key cùng nhà cung cấp — không spam cross-provider.
 */
const orderAttemptsForExecution = (
  attempts: TranslationAttempt[],
  selectModel: string,
  enableCrossRotation: boolean
): TranslationAttempt[] => {
  const primary = getProviderForModel(selectModel);
  const byQuota = orderAttemptsByQuota(attempts);

  if (!primary) return byQuota;

  const primaryAttempts = byQuota.filter((a) => a.provider === primary);
  const crossAttempts = enableCrossRotation
    ? byQuota.filter((a) => a.provider !== primary)
    : [];

  return [...primaryAttempts, ...crossAttempts];
};

const executeWithKeyRotation = async (
  attempts: TranslationAttempt[],
  text: string,
  systemInstruction: string,
  activeTemp: number,
  selectModel: string,
  enableCrossRotation: boolean
): Promise<string> => {
  if (attempts.length === 0) {
    throw new Error(
      "Vui lòng vào tab Cài đặt để nhập API Key (Gemini/DeepSeek) của riêng bạn để bắt đầu dịch miễn phí/giá rẻ"
    );
  }

  const ordered = orderAttemptsForExecution(attempts, selectModel, enableCrossRotation);
  const primary = getProviderForModel(selectModel);

  let lastRateLimitMessage = "";
  let primaryExhaustedByRateLimit = false;
  const rateLimitedProviders = new Set<Provider>();

  for (const attempt of ordered) {
    if (primaryExhaustedByRateLimit && primary && attempt.provider !== primary) {
      break;
    }

    recordApiRequest(attempt.provider, attempt.key, text);

    try {
      const output = await callTranslationApi(attempt, text, systemInstruction, activeTemp);
      recordApiSuccess(attempt.provider, attempt.key);
      return output;
    } catch (err: unknown) {
      if (err instanceof TranslationApiError && err.retryable) {
        recordApiRateLimit(attempt.provider, attempt.key);
        rateLimitedProviders.add(attempt.provider);
        lastRateLimitMessage = err.message;
        if (primary && attempt.provider === primary) {
          primaryExhaustedByRateLimit = true;
        }
        console.warn(
          `[translation] Rate limit (${attempt.provider}), thử key cùng nhà cung cấp...`
        );
        continue;
      }
      throw err instanceof Error ? err : new Error(String(err));
    }
  }

  const providerList = [...rateLimitedProviders].join(", ") || "đã cấu hình";
  throw new Error(
    lastRateLimitMessage ||
      `Tất cả API key (${providerList}) đều bị giới hạn tần suất (rate limit). Vui lòng đợi vài phút hoặc thêm key dự phòng trong Cấu Hình.`
  );
};

// Smart fallback selection to any available key entered by the client/user
const getAvailableKeyForLookup = (settings: TranslationSettings): { provider: string; key: string } => {
  const attempts = buildTranslationAttempts(
    resolveSelectedModel(settings.selectedModel),
    settings.apiKeys || {},
    settings.enableCrossRotation ?? false
  );
  if (attempts.length === 0) {
    return { provider: "", key: "" };
  }
  const first = attempts[0];
  return { provider: first.provider, key: first.key };
};

const translateTextImmediate = async (
  params: TranslateParams,
  settings: TranslationSettings
): Promise<string> => {
  const { text, model, temperature, apiKeys = {}, prompt1, prompt2, dictContext } = params;

  const selectModel = resolveSelectedModel(model || settings.selectedModel);
  const activeTemp = typeof temperature === "number" ? temperature : settings.temperature ?? 0.3;
  const systemInstruction = buildSystemInstruction(prompt1, prompt2, dictContext);

  const attempts = buildTranslationAttempts(
    selectModel,
    apiKeys,
    settings.enableCrossRotation ?? false
  );

  const outputText = await executeWithKeyRotation(
    attempts,
    text,
    systemInstruction,
    activeTemp,
    selectModel,
    settings.enableCrossRotation ?? false
  );
  return outputText;
};

// Unified translation function: running completely offline/locally inside WebView or device, calling LLM endpoints directly
export const translateText = async (params: TranslateParams, settings: TranslationSettings): Promise<string> => {
  const { text, priority = "normal" } = params;

  if (!text || !text.trim()) {
    return "";
  }

  const selectModel = resolveSelectedModel(params.model || settings.selectedModel);
  const activeTemp =
    typeof params.temperature === "number" ? params.temperature : settings.temperature ?? 0.3;
  const normalizedPrompt1 = normalizePromptForApi(params.prompt1);
  const normalizedPrompt2 = normalizePromptForApi(params.prompt2);
  const normalizedDict = normalizeDictContextForPrompt(params.dictContext);
  const cacheKey = `${selectModel}_${activeTemp}_${normalizedPrompt1}_${normalizedPrompt2}_${normalizedDict}_${text.trim().substring(0, 100)}`;
  const skipChapterCache =
    text.length > 400 || text.includes("Văn bản tiếng Trung bên dưới có đúng");
  if (!skipChapterCache && clientTranslateCache.has(cacheKey)) {
    return clientTranslateCache.get(cacheKey) || "";
  }

  try {
    const runTranslate = () => translateTextImmediate(params, settings);
    const outputText = params.directApi
      ? await runTranslate()
      : await runInTranslationQueue(runTranslate, { priority, label: "translateText" });
    if (outputText && !skipChapterCache) {
      clientTranslateCache.set(cacheKey, outputText);
    }
    return outputText;
  } catch (err: unknown) {
    if (err instanceof TranslationApiError) {
      throw err;
    }
    let message =
      err instanceof Error ? err.message : "Xảy ra lỗi kết nối cục bộ đến máy chủ AI.";
    if (err instanceof TypeError && /fetch|network/i.test(String(err))) {
      message +=
        "\n\nGợi ý: Kiểm tra mạng trên điện thoại; với chương dài hãy để 1 luồng và thử lại (app sẽ tự chia nhỏ đoạn). Trên trình duyệt PC có thể thêm lỗi CORS.";
    }
    throw new Error(message);
  }
};

const callLookupApi = async (
  attempt: TranslationAttempt,
  prompt: string,
  maxTokens: number,
  systemMessage: string
): Promise<string> => {
  const { provider, key } = attempt;

  if (provider === "google") {
    const modelId = attempt.model.startsWith("gemini-") ? attempt.model : DEFAULT_MODEL_ID;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: maxTokens },
      }),
    });
    const detail = res.ok ? "" : await res.text();
    if (!res.ok) {
      throw new TranslationApiError(
        `Google lookup error: ${detail || res.statusText}`,
        res.status,
        isRateLimitError(res.status, detail)
      );
    }
    const data = await res.json();
    return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
  }

  if (provider === "openai" || provider === "deepseek" || provider === "qwen") {
    const endpoint =
      provider === "openai"
        ? "https://api.openai.com/v1/chat/completions"
        : provider === "deepseek"
          ? "https://api.deepseek.com/chat/completions"
          : "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions";

    const lookupModel = attempt.model;

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: lookupModel,
        messages: [
          { role: "system", content: systemMessage },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        max_tokens: maxTokens,
      }),
    });

    const detail = res.ok ? "" : await res.text();
    if (!res.ok) {
      throw new TranslationApiError(
        `${provider} lookup error: ${detail || res.statusText}`,
        res.status,
        isRateLimitError(res.status, detail)
      );
    }
    const data = await res.json();
    return (data.choices?.[0]?.message?.content || "").trim();
  }

  if (provider === "claude") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-out-of-band-cors": "true",
      },
      body: JSON.stringify({
        model: attempt.model.startsWith("claude-") ? attempt.model : "claude-4-5-haiku",
        max_tokens: maxTokens,
        system: systemMessage,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    const detail = res.ok ? "" : await res.text();
    if (!res.ok) {
      throw new TranslationApiError(
        `Claude lookup error: ${detail || res.statusText}`,
        res.status,
        isRateLimitError(res.status, detail)
      );
    }
    const data = await res.json();
    return (data.content?.[0]?.text || "").trim();
  }

  throw new TranslationApiError("Provider không hỗ trợ tra cứu.", 0, false);
};

const executeLookupWithRotation = async (
  settings: TranslationSettings,
  prompt: string,
  maxTokens: number,
  systemMessage: string,
  normalize?: (value: string) => string
): Promise<string> => {
  const selectModel = resolveSelectedModel(settings.selectedModel);
  const attempts = orderAttemptsForExecution(
    buildTranslationAttempts(
      selectModel,
      settings.apiKeys || {},
      settings.enableCrossRotation ?? false
    ),
    selectModel,
    settings.enableCrossRotation ?? false
  );

  if (attempts.length === 0) {
    return "thiếu_api_key";
  }

  const primary = getProviderForModel(selectModel);
  let primaryExhaustedByRateLimit = false;
  let lastNonRetryable: Error | null = null;

  for (const attempt of attempts) {
    if (primaryExhaustedByRateLimit && primary && attempt.provider !== primary) {
      break;
    }

    recordApiRequest(attempt.provider, attempt.key, prompt);

    try {
      const raw = await callLookupApi(attempt, prompt, maxTokens, systemMessage);
      if (!raw) continue;
      recordApiSuccess(attempt.provider, attempt.key);
      return normalize ? normalize(raw) : raw;
    } catch (err) {
      if (err instanceof TranslationApiError && err.retryable) {
        recordApiRateLimit(attempt.provider, attempt.key);
        if (primary && attempt.provider === primary) {
          primaryExhaustedByRateLimit = true;
        }
        console.warn(`[lookup] Rate limit (${attempt.provider}), thử key cùng nhà cung cấp...`);
        continue;
      }
      lastNonRetryable = err instanceof Error ? err : new Error(String(err));
      console.warn("Direct lookup err:", err);
      break;
    }
  }

  if (lastNonRetryable) {
    console.warn("Lookup dừng sau lỗi không phải rate limit:", lastNonRetryable.message);
  }

  return "";
};

// Direct client side translate individual phrase lookups
export const translatePhrase = async (
  phrase: string,
  settings: TranslationSettings,
  options?: { priority?: TranslationPriority }
): Promise<string> => {
  if (!phrase || !phrase.trim()) {
    return "";
  }

  const prompt = `Bạn là từ điển Hán Việt chuyên ngành tiên hiệp kiếm hiệp văn học. Hãy dịch từ/cụm từ dưới đây sang tiếng Việt nghĩa phù hợp dứt khoát chỉ trả về đúng cụm từ/chữ kết quả dịch Việt, không thêm dấu cách thừa, không giải thích hay đóng mở ngoặc kép gì thêm:\nHán tự: ${phrase}`;

  return runInTranslationQueue(
    () =>
      executeLookupWithRotation(
        settings,
        prompt,
        100,
        "Dịch từ Hán Việt ngắn gọn dứt khoát không giải thích.",
        (v) => v.toLowerCase()
      ),
    { priority: options?.priority ?? "low", label: "translatePhrase" }
  );
};

// Direct client side Align Vietnamese back to Chinese in original paragraph
export const alignPhrase = async (
  paragraph: string,
  vietnamese: string,
  settings: TranslationSettings,
  options?: { priority?: TranslationPriority }
): Promise<string> => {
  if (!paragraph || !vietnamese) {
    return "";
  }

  const prompt = `Từ đoạn văn tiếng Trung sau: "${paragraph}"\nHãy tìm và trích xuất đúng chữ/cụm từ tiếng Trung tương ứng với cụm từ bản dịch tiếng Việt sau: "${vietnamese}".\nLưu ý: Chỉ trả về duy nhất chữ hoặc cụm chữ gốc tìm thấy bên trong đoạn tiếng Trung đó, KHÔNG giải thích dông dài, KHÔNG thêm dấu ngoặc hay ký hiệu thừa nào.`;

  return runInTranslationQueue(
    () =>
      executeLookupWithRotation(
        settings,
        prompt,
        100,
        "Hãy trả về duy nhất cụm chữ Hán phù ứng."
      ),
    { priority: options?.priority ?? "normal", label: "alignPhrase" }
  );
};
