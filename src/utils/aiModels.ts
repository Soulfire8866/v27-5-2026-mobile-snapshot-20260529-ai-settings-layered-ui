/**
 * Danh mục model AI (Cấu hình) — id trùng tên gọi API của nhà cung cấp.
 */

export type AiModelProvider = "google" | "openai" | "claude" | "deepseek" | "qwen";

export interface AiModelDetails {
  id: string;
  name: string;
  provider: AiModelProvider;
  strength: string;
  plan: string;
  cost: string;
  description: string;
  recommended: boolean;
}

/** Thứ tự nhóm trên giao diện: Gemini → Claude → DeepSeek → Qwen → OpenAI */
export const MODEL_GROUP_ORDER: AiModelProvider[] = [
  "google",
  "claude",
  "deepseek",
  "qwen",
  "openai",
];

export const MODELS_DATABASE: AiModelDetails[] = [
  // —— Google Gemini ——
  {
    id: "gemini-3.5-flash",
    name: "Gemini 3.5 Flash",
    provider: "google",
    strength: "Mô hình siêu tốc mới nhất, dịch thuật tự nhiên, thông minh vượt bậc.",
    plan: "Yêu cầu khóa API từ Google AI Studio (Free tier hoặc Pay-as-you-go).",
    cost: "FREE thử nghiệm (tiết kiệm token)",
    description:
      "Thế hệ mới của Google, nhạy ngữ cảnh Hán Việt tiên hiệp, hạn chế trợ từ ngữ khí thừa.",
    recommended: true,
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    provider: "google",
    strength: "Suy luận đa ngôn ngữ cao, xử lý xưng hô cổ phong sắc bén.",
    plan: "Google AI Studio / Vertex AI (trả phí theo lưu lượng).",
    cost: "Trả phí (~$1.25 / triệu token đầu vào)",
    description: "Pro thế hệ 3.1 — bám sát ngữ cảnh câu dài, phân vai nhân vật ổn định.",
    recommended: true,
  },
  {
    id: "gemini-3-flash",
    name: "Gemini 3 Flash",
    provider: "google",
    strength: "Cân bằng tốc độ và chất lượng dịch văn học.",
    plan: "Google AI Studio Developer API.",
    cost: "FREE / Pay-as-you-go",
    description: "Flash thế hệ 3 — phù hợp dịch khối lượng chương lớn hàng ngày.",
    recommended: false,
  },
  {
    id: "gemini-3.1-flash-lite",
    name: "Gemini 3.1 Flash Lite",
    provider: "google",
    strength: "Siêu nhẹ, phản hồi nhanh, chi phí thấp.",
    plan: "Google AI Studio.",
    cost: "Tiết kiệm token tối đa",
    description: "Bản Lite — khi cần dịch nhanh, ít tốn quota.",
    recommended: false,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    provider: "google",
    strength: "Dịch siêu tốc, phản hồi ngay lập tức.",
    plan: "Google AI Studio Free tier hoặc Pay-as-you-go.",
    cost: "FREE hoặc ~$0.075 / triệu token",
    description: "Hiệu năng tốc độ cao, thích hợp batch nhiều chương.",
    recommended: false,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    strength: "Đỉnh cao dịch văn học cổ trang, gỡ nghĩa kiếm hiệp & tiên hiệp.",
    plan: "Google AI Studio / Vertex AI.",
    cost: "Trả phí (~$1.25 / triệu token)",
    description: "Pro 2.5 — phân tích ngữ cảnh đa tầng, giữ văn phong nghiêm trang.",
    recommended: true,
  },

  // —— Anthropic Claude ——
  {
    id: "claude-4-5-sonnet",
    name: "Claude 4.5 Sonnet",
    provider: "claude",
    strength: "Văn học mềm mại, lôi cuốn, giữ nhịp tiên hiệp xuất sắc.",
    plan: "Anthropic Console API (thẻ quốc tế).",
    cost: "Cao cấp (~$3 / triệu token đầu vào)",
    description: "Sonnet 4.5 — dịch có hồn, giọng điệu tự nhiên.",
    recommended: true,
  },
  {
    id: "claude-4-5-haiku",
    name: "Claude 4.5 Haiku",
    provider: "claude",
    strength: "Tốc độ cao, ngữ thể gọn, chi phí vừa phải.",
    plan: "Anthropic Console API.",
    cost: "Kinh tế (~$0.80 / triệu token)",
    description: "Haiku 4.5 — dịch hàng loạt chương nhanh.",
    recommended: false,
  },

  // —— DeepSeek ——
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    provider: "deepseek",
    strength: "Dịch nghĩa Việt chuẩn, giọng cổ trang; chi phí thấp so với Claude.",
    plan: "DeepSeek API Platform.",
    cost: "Rẻ (~$0.14 / triệu token trở lên)",
    description: "V4 Pro — chất lượng dịch truyện cao, tiết kiệm.",
    recommended: true,
  },
  {
    id: "deepseek-v4-flash",
    name: "DeepSeek V4 Flash",
    provider: "deepseek",
    strength: "Tốc độ V4, phù hợp batch song song nhiều chương.",
    plan: "DeepSeek API Platform.",
    cost: "Rẻ, ưu tiên throughput",
    description: "V4 Flash — cân bằng tốc độ và độ chính xác.",
    recommended: false,
  },

  // —— Alibaba Qwen ——
  {
    id: "qwen3-max",
    name: "Qwen 3-Max",
    provider: "qwen",
    strength: "Đỉnh hệ Qwen, hiểu điển tích và văn phong nội địa Trung.",
    plan: "Alibaba DashScope API.",
    cost: "Theo biểu giá DashScope",
    description: "Qwen3 Max — khi cần chất lượng tối đa.",
    recommended: false,
  },
  {
    id: "qwen-3.5-plus",
    name: "Qwen 3.5 Plus",
    provider: "qwen",
    strength: "Cân bằng chất lượng và tốc độ.",
    plan: "DashScope API Key.",
    cost: "Tiết kiệm",
    description: "Qwen 3.5 Plus — lựa chọn đa dụng hàng ngày.",
    recommended: true,
  },
  {
    id: "qwen-3.5-flash",
    name: "Qwen 3.5 Flash",
    provider: "qwen",
    strength: "Siêu nhanh, chi phí thấp cho truyện dài.",
    plan: "DashScope API Key.",
    cost: "Siêu rẻ",
    description: "Qwen 3.5 Flash — dịch khối lượng lớn.",
    recommended: false,
  },

  // —— OpenAI GPT-5.x (Chat Completions — khớp translationClient hiện tại) ——
  {
    id: "gpt-5.4",
    name: "GPT-5.4",
    provider: "openai",
    strength: "Frontier OpenAI, dịch văn học dài, tương thích API Chat Completions của app.",
    plan: "OpenAI API Platform (Pay-as-you-go hoặc Tier).",
    cost: "Theo bảng giá OpenAI (thường tiết kiệm token hơn 5.2 nhờ hiệu suất mới)",
    description:
      "Khuyên dùng cho dịch chương truyện — cân bằng chất lượng và ổn định với luồng /v1/chat/completions.",
    recommended: true,
  },
  {
    id: "gpt-5.4-2026-03-05",
    name: "GPT-5.4 (snapshot 2026-03-05)",
    provider: "openai",
    strength: "Khóa phiên bản ổn định, hành vi dịch nhất quán theo thời gian.",
    plan: "OpenAI API — chọn snapshot khi cần tái lập kết quả.",
    cost: "Giống GPT-5.4",
    description: "Bản snapshot — phù hợp production và so sánh chất lượng dịch.",
    recommended: false,
  },
  {
    id: "gpt-5.5",
    name: "GPT-5.5",
    provider: "openai",
    strength: "Mới nhất; tối ưu khi dùng Responses API (suy luận/agent).",
    plan: "OpenAI API — một số tính năng 5.5 ưu tiên Responses API.",
    cost: "Theo bảng giá OpenAI",
    description:
      "App hiện gọi Chat Completions; thử được nếu tài khoản bật, nếu lỗi hãy chọn GPT-5.4.",
    recommended: false,
  },
];

const VALID_IDS = new Set(MODELS_DATABASE.map((m) => m.id));

/** Model đã gỡ khỏi danh sách → thay bằng model mặc định tương đương */
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  "gemini-1.5-pro": "gemini-3.5-flash",
  "gemini-1.5-flash": "gemini-3.5-flash",
  "gemini-2.0-flash": "gemini-3-flash",
  "gemini-2.0-pro-exp-02-05": "gemini-3.1-pro",
  "deepseek-chat": "deepseek-v4-pro",
  "deepseek-reasoner": "deepseek-v4-pro",
  "claude-3-7-sonnet-latest": "claude-4-5-sonnet",
  "claude-3-5-haiku-20241022": "claude-4-5-haiku",
  "qwen-max": "qwen3-max",
  "qwen-plus": "qwen-3.5-plus",
  "qwen-turbo": "qwen-3.5-flash",
  "gpt-4o": "gpt-5.4",
  "gpt-4o-mini": "gpt-5.4",
  "o3-mini": "gpt-5.4",
};

export const DEFAULT_MODEL_ID = "gemini-3.5-flash";

export function resolveSelectedModel(modelId?: string): string {
  if (!modelId) return DEFAULT_MODEL_ID;
  if (VALID_IDS.has(modelId)) return modelId;
  if (LEGACY_MODEL_ALIASES[modelId]) return LEGACY_MODEL_ALIASES[modelId];
  return DEFAULT_MODEL_ID;
}

export function getModelsByProvider(provider: AiModelProvider): AiModelDetails[] {
  return MODELS_DATABASE.filter((m) => m.provider === provider);
}
