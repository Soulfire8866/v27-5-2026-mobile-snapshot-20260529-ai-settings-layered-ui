import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Cpu,
  Eye,
  EyeOff,
  Check,
  Shield,
  HelpCircle,
  Sparkles,
  Plus,
  Trash2,
  Sun,
  Moon,
  Monitor,
  RefreshCw,
  Boxes
} from "lucide-react";
import { AppColorScheme, TranslationSettings } from "../types";
import {
  uiPanel,
  uiTitle,
  uiLabel,
  uiCaption,
  uiBannerHero,
  uiToggleTrack,
  uiToggleTrackOn,
  uiToggleTrackOff,
  uiToggleThumb,
  uiInput,
  uiBtnPrimary,
  uiBtnGhost,
  uiBtnSecondary,
  uiCardInset,
  uiFieldLabel,
  uiSegmentedTrack,
  uiSegmentedBtnActive,
  uiSegmentedBtnIdle,
  uiInlineFeedbackInfo,
  uiInlineFeedbackSuccess,
  uiInlineFeedbackWarning,
} from "../lib/ui";
import {
  MODELS_DATABASE,
  getModelsByProvider,
  resolveSelectedModel,
  type AiModelDetails,
  type RefreshableProvider,
  fetchLatestProviderModelIds,
  buildDynamicModelsForProvider,
} from "../utils/aiModels";

interface SettingsTabProps {
  settings: TranslationSettings;
  onUpdateApiKey: (
    platform: "google" | "openai" | "claude" | "deepseek" | "qwen" | "custom",
    value: string
  ) => void;
  onSelectModel: (modelId: string) => void;
  onUpdateSetting?: (key: keyof TranslationSettings, val: any) => void;
}

const PROVIDER_SAVE_SUCCESS_LABELS: Record<string, string> = {
  google: "Đã lưu khóa Google Gemini.",
  openai: "Đã lưu khóa OpenAI.",
  claude: "Đã lưu khóa Anthropic Claude.",
  deepseek: "Đã lưu khóa DeepSeek.",
  qwen: "Đã lưu khóa Alibaba Qwen.",
  custom: "Đã lưu khóa nhà cung cấp khác.",
};

const MODEL_PROVIDER_ORDER: RefreshableProvider[] = [
  "google",
  "claude",
  "deepseek",
  "qwen",
  "openai",
];

const MODEL_PROVIDER_TITLES: Record<RefreshableProvider, string> = {
  google: "Google Gemini",
  claude: "Anthropic Claude",
  deepseek: "DeepSeek",
  qwen: "Alibaba Qwen",
  openai: "OpenAI ChatGPT",
};

const OTHER_PROVIDER_PRESETS = [
  { id: "xai", label: "xAI Grok", base: "https://api.x.ai/v1", model: "grok-3-mini" },
  { id: "mistral", label: "Mistral AI", base: "https://api.mistral.ai/v1", model: "mistral-small-latest" },
  { id: "cohere", label: "Cohere Command", base: "https://api.cohere.ai/compatibility/v1", model: "command-r-plus" },
  { id: "meta", label: "Meta Llama (compat)", base: "https://api.together.xyz/v1", model: "meta-llama/Llama-3.3-70B-Instruct-Turbo" },
  { id: "moonshot", label: "Moonshot Kimi", base: "https://api.moonshot.ai/v1", model: "kimi-k2-0905-preview" },
  { id: "zai", label: "Z.ai GLM", base: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4.5-flash" },
] as const;

type AiSettingsLayer = "catalog" | "detail";
type AiSettingsEntry = RefreshableProvider | "otherPopular";

const providerFromModelId = (modelId: string): AiSettingsEntry => {
  if (modelId.startsWith("custom::")) return "otherPopular";
  if (modelId.startsWith("gemini-")) return "google";
  if (modelId.startsWith("claude-")) return "claude";
  if (modelId.startsWith("deepseek-")) return "deepseek";
  if (modelId.startsWith("qwen-") || modelId.includes("qwen")) return "qwen";
  if (modelId.startsWith("gpt-") || modelId.startsWith("o1-") || modelId.startsWith("o3-")) return "openai";
  return "google";
};

const detectModelTier = (modelId: string): string => {
  const lower = modelId.toLowerCase();
  if (lower.includes("pro")) return "Pro";
  if (lower.includes("flash")) return "Flash";
  if (lower.includes("sonnet")) return "Sonnet";
  if (lower.includes("haiku")) return "Haiku";
  if (lower.includes("max")) return "Max";
  if (lower.includes("plus")) return "Plus";
  if (lower.includes("turbo")) return "Turbo";
  return "Khác";
};

const scoreModelId = (modelId: string): number => {
  const lower = modelId.toLowerCase();
  const numbers = lower.match(/\d+(?:\.\d+)?/g) || [];
  let score = 0;
  numbers.forEach((v, idx) => {
    score += Number.parseFloat(v) * (100 / (idx + 1));
  });
  if (lower.includes("latest")) score += 500;
  if (lower.includes("preview")) score += 120;
  return score;
};

const sortModelsByRecency = (models: AiModelDetails[]): AiModelDetails[] =>
  [...models].sort((a, b) => scoreModelId(b.id) - scoreModelId(a.id) || a.id.localeCompare(b.id));

export default function SettingsTab({ settings, onUpdateApiKey, onSelectModel, onUpdateSetting }: SettingsTabProps) {
  const [showKeys, setShowKeys] = useState({
    google: false,
    openai: false,
    claude: false,
    deepseek: false,
    qwen: false,
    custom: false,
  });

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [showBudgetTips, setShowBudgetTips] = useState(false);
  const [showStrategyTips, setShowStrategyTips] = useState(false);
  const [showModelSettingsCenter, setShowModelSettingsCenter] = useState(false);
  const [aiSettingsLayer, setAiSettingsLayer] = useState<AiSettingsLayer>("catalog");
  const [aiSettingsEntry, setAiSettingsEntry] = useState<AiSettingsEntry>("google");
  const [activeProviderTab, setActiveProviderTab] = useState<RefreshableProvider>("google");
  const [providerModelCatalogs, setProviderModelCatalogs] = useState<Record<RefreshableProvider, AiModelDetails[]>>({
    google: sortModelsByRecency(getModelsByProvider("google")),
    claude: sortModelsByRecency(getModelsByProvider("claude")),
    deepseek: sortModelsByRecency(getModelsByProvider("deepseek")),
    qwen: sortModelsByRecency(getModelsByProvider("qwen")),
    openai: sortModelsByRecency(getModelsByProvider("openai")),
  });
  const [providerRefreshLoading, setProviderRefreshLoading] = useState<Record<RefreshableProvider, boolean>>({
    google: false,
    claude: false,
    deepseek: false,
    qwen: false,
    openai: false,
  });
  const [providerRefreshStatus, setProviderRefreshStatus] = useState<Record<RefreshableProvider, string>>({
    google: "",
    claude: "",
    deepseek: "",
    qwen: "",
    openai: "",
  });
  const [otherProviderPreset, setOtherProviderPreset] = useState("");
  const [providerTierPick, setProviderTierPick] = useState<Record<RefreshableProvider, string>>({
    google: "Flash",
    claude: "Sonnet",
    deepseek: "Pro",
    qwen: "Plus",
    openai: "Khác",
  });
  const aiLayerScrollRef = useRef<HTMLDivElement | null>(null);

  const resolvedModelId = resolveSelectedModel(settings.selectedModel);
  const activeModel =
    MODELS_DATABASE.find((m) => m.id === resolvedModelId) || MODELS_DATABASE[0];

  const handleToggleKeyVisibility = (platform: keyof typeof showKeys) => {
    setShowKeys(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  const applyTokenPreset = (budgetPerChapter: number, dictChunkMaxChars: number) => {
    onUpdateSetting?.("translationBudgetPerChapter", budgetPerChapter);
    onUpdateSetting?.("translationChunkDictMaxChars", dictChunkMaxChars);
  };

  const applyTranslationStrategyPreset = (mode: "safe" | "balanced" | "quality") => {
    if (mode === "safe") {
      onUpdateSetting?.("maxThreads", 1);
      onUpdateSetting?.("translationSequentialChunks", false);
      onUpdateSetting?.("translationBudgetPerChapter", 80000);
      onUpdateSetting?.("translationChunkDictMaxChars", 1600);
      return;
    }
    if (mode === "balanced") {
      onUpdateSetting?.("maxThreads", 2);
      onUpdateSetting?.("translationSequentialChunks", false);
      onUpdateSetting?.("translationBudgetPerChapter", 100000);
      onUpdateSetting?.("translationChunkDictMaxChars", 2600);
      return;
    }
    onUpdateSetting?.("maxThreads", 1);
    onUpdateSetting?.("translationSequentialChunks", true);
    onUpdateSetting?.("translationBudgetPerChapter", 140000);
    onUpdateSetting?.("translationChunkDictMaxChars", 3400);
  };

  const handleRefreshProviderModels = async (provider: RefreshableProvider) => {
    const firstKey = (settings.apiKeys?.[provider] || "")
      .split(",")
      .map((k) => k.trim())
      .find(Boolean);
    if (!firstKey) {
      setProviderRefreshStatus((prev) => ({
        ...prev,
        [provider]: "Bạn chưa nhập API key cho nhánh này.",
      }));
      return;
    }
    setProviderRefreshLoading((prev) => ({ ...prev, [provider]: true }));
    setProviderRefreshStatus((prev) => ({ ...prev, [provider]: "Đang làm mới danh sách model..." }));
    try {
      const ids = await fetchLatestProviderModelIds(provider, firstKey);
      if (!ids.length) {
        setProviderRefreshStatus((prev) => ({
          ...prev,
          [provider]: "API phản hồi rỗng. Giữ danh sách local hiện tại.",
        }));
        return;
      }
      const onlineModels = buildDynamicModelsForProvider(provider, ids);
      const localModels = getModelsByProvider(provider);
      const merged = sortModelsByRecency(
        [...onlineModels, ...localModels].filter(
          (model, idx, arr) => arr.findIndex((x) => x.id === model.id) === idx
        )
      );
      setProviderModelCatalogs((prev) => ({ ...prev, [provider]: merged }));
      setProviderRefreshStatus((prev) => ({
        ...prev,
        [provider]: `Đã cập nhật ${ids.length} model mới nhất.`,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setProviderRefreshStatus((prev) => ({
        ...prev,
        [provider]: `Không làm mới được: ${message}. App dùng fallback local.`,
      }));
    } finally {
      setProviderRefreshLoading((prev) => ({ ...prev, [provider]: false }));
    }
  };

  const activeProviderModels = providerModelCatalogs[activeProviderTab] || [];
  const activeProviderTiers = Array.from(new Set(activeProviderModels.map((m) => detectModelTier(m.id))));
  const pickedTier = providerTierPick[activeProviderTab];
  const filteredTierModels = sortModelsByRecency(
    activeProviderModels.filter((m) => detectModelTier(m.id) === pickedTier)
  ).slice(0, 3);
  const preferredModels = filteredTierModels;
  const activeProviderSelectedModel = activeProviderModels.find((m) => m.id === settings.selectedModel);
  const detailModelOptions = preferredModels;
  const activePickedModel =
    detailModelOptions.find((m) => m.id === settings.selectedModel) || detailModelOptions[0];

  const applyOtherProviderPreset = (presetId: string) => {
    setOtherProviderPreset(presetId);
    const preset = OTHER_PROVIDER_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    onUpdateSetting?.("customProviderEnabled", true);
    onUpdateSetting?.("customProviderLabel", preset.label);
    onUpdateSetting?.("customProviderApiBase", preset.base);
    onUpdateSetting?.("customProviderModel", preset.model);
  };

  const openAiSettingsCenter = () => {
    setAiSettingsLayer("catalog");
    setAiSettingsEntry("google");
    setActiveProviderTab("google");
    setShowModelSettingsCenter(true);
  };

  useEffect(() => {
    if (!showModelSettingsCenter || typeof document === "undefined") return;
    const prevBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevBodyOverflow;
    };
  }, [showModelSettingsCenter]);

  useEffect(() => {
    if (!showModelSettingsCenter) return;
    requestAnimationFrame(() => {
      if (aiLayerScrollRef.current) aiLayerScrollRef.current.scrollTop = 0;
    });
  }, [showModelSettingsCenter, aiSettingsLayer, aiSettingsEntry]);

  const activeEntry = providerFromModelId(settings.selectedModel || "");

  useEffect(() => {
    if (activeEntry === "otherPopular") return;
    if (activeEntry !== activeProviderTab) return;
    const selectedTier = detectModelTier(settings.selectedModel || "");
    setProviderTierPick((prev) =>
      prev[activeProviderTab] === selectedTier
        ? prev
        : {
            ...prev,
            [activeProviderTab]: selectedTier,
          }
    );
  }, [activeEntry, activeProviderTab, settings.selectedModel]);

  const activateProviderEntry = (entry: AiSettingsEntry) => {
    if (entry === "otherPopular") {
      const customModel = (settings.customProviderModel || "").trim();
      if (customModel) {
        onSelectModel(`custom::${customModel}`);
      } else {
        setAiSettingsLayer("detail");
        setAiSettingsEntry("otherPopular");
      }
      return;
    }

    const catalog = sortModelsByRecency(providerModelCatalogs[entry] || []);
    const currentStillInProvider = catalog.find((m) => m.id === settings.selectedModel);
    const modelToActivate = currentStillInProvider?.id || catalog.find((m) => m.recommended)?.id || catalog[0]?.id;
    if (modelToActivate) {
      setProviderTierPick((prev) => ({
        ...prev,
        [entry]: detectModelTier(modelToActivate),
      }));
      onSelectModel(modelToActivate);
    }
  };

  const currentKeys = settings.apiKeys || {};
  const hasAnyApiKey = Object.values(currentKeys).some((v) => (v || "").trim().length > 0);

  const renderMultiKeyFields = (
    platform: "google" | "openai" | "claude" | "deepseek" | "qwen" | "custom",
    placeholder = "sk-..."
  ) => {
    const rawVal = currentKeys[platform] || "";
    const list = rawVal ? rawVal.split(",").map(k => k.trim()) : [""];

    const handleKeyChangeAtIndex = (index: number, val: string) => {
      const newList = [...list];
      newList[index] = val.trim();
      onUpdateApiKey(platform, newList.join(","));
      setSaveSuccess(platform);
      setTimeout(() => setSaveSuccess(null), 1500);
    };

    const handleAddKey = () => {
      const newList = [...list, ""];
      onUpdateApiKey(platform, newList.join(","));
    };

    const handleRemoveKey = (index: number) => {
      if (list.length <= 1) {
        onUpdateApiKey(platform, "");
        return;
      }
      const newList = list.filter((_, idx) => idx !== index);
      onUpdateApiKey(platform, newList.join(","));
    };

    return (
      <div className="space-y-3 mt-3">
        {list.map((keyVal, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-bold text-app-text-muted shrink-0 select-none min-w-[28px] text-right">
              #{idx + 1}:
            </span>
            <div className="relative flex-1 min-w-0">
              <input
                type={showKeys[platform] ? "text" : "password"}
                value={keyVal}
                onChange={(e) => handleKeyChangeAtIndex(idx, e.target.value)}
                placeholder={placeholder}
                className={`${uiInput} pr-10 pl-3 !min-h-11 !text-xs rounded-xl font-mono`}
              />
              <button
                type="button"
                onClick={() => handleToggleKeyVisibility(platform)}
                className={`absolute right-3 top-1/2 -translate-y-1/2 ${uiBtnGhost} !min-h-0 !h-auto !w-auto !p-0 !border-0 !bg-transparent text-app-text-muted hover:text-app-text`}
              >
                {showKeys[platform] ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            {list.length > 1 && (
              <button
                type="button"
                onClick={() => handleRemoveKey(idx)}
                className="h-11 w-11 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl flex items-center justify-center transition-colors shrink-0 cursor-pointer active:scale-95"
                title="Xóa khóa API này"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        {/* h-11 Add button */}
        <button
          type="button"
          onClick={handleAddKey}
          className={`${uiBtnSecondary} h-11 border-dashed rounded-xl !text-[10.5px] font-bold w-full select-none`}
        >
          <Plus className="w-4 h-4 text-emerald-500" />
          Thêm khóa API xoay vòng (Đa luồng/Load Balance)
        </button>
      </div>
    );
  };

  const appScheme = settings.appColorScheme ?? "system";
  const schemeOptions: {
    id: AppColorScheme;
    label: string;
    desc: string;
    Icon: typeof Sun;
  }[] = [
    { id: "system", label: "Theo hệ thống", desc: "Android/Windows quyết định sáng/tối", Icon: Monitor },
    { id: "light", label: "Sáng", desc: "Menu, Lab, Thư viện nền giấy", Icon: Sun },
    { id: "dark", label: "Tối", desc: "Khung app tối kiểu Kindle đêm", Icon: Moon },
  ];

  return (
    <div className="space-y-6 animate-fade-up-soft" id="settings-tab-panel">
      {onUpdateSetting && (
        <div className={`${uiPanel} space-y-3`} id="app-color-scheme-settings">
          <div>
            <h3 className={uiLabel}>Giao diện khung ứng dụng</h3>
            <p className={`${uiCaption} mt-1`}>
              Áp dụng cho menu, Lab Dịch, Thư viện, Cài đặt…{" "}
              <strong className="text-app-text font-medium">
                Không đổi màu giấy trong Phòng Đọc
              </strong>{" "}
              (chỉnh trong Phòng Đọc khi đang đọc).
            </p>
          </div>
          <div className={`${uiSegmentedTrack} !grid grid-cols-1 sm:grid-cols-3 gap-2 !p-1`}>
            {schemeOptions.map(({ id, label, desc, Icon }) => {
              const active = appScheme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onUpdateSetting("appColorScheme", id)}
                  className={`text-left p-3 rounded-lg transition-colors cursor-pointer min-h-[72px] !flex-col !items-stretch !justify-start ${
                    active
                      ? `${uiSegmentedBtnActive} border-app-accent bg-app-accent/10`
                      : `${uiSegmentedBtnIdle} border border-app-border bg-app-surface-muted hover:bg-app-surface`
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className={`w-4 h-4 shrink-0 ${active ? "text-app-accent" : "text-app-text-muted"}`} />
                    <span className="text-sm font-medium truncate">{label}</span>
                  </div>
                  <span className="text-[11px] text-app-text-muted leading-snug block">{desc}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Intro Banner */}
      <div className={`${uiBannerHero} relative overflow-hidden`}>
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.22),transparent_45%)]" />
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Shield className="w-5.5 h-5.5 text-amber-500 animate-pulse" />
            <h2 className="text-base font-bold tracking-tight whitespace-nowrap truncate">
              Model AI Dịch Thuật Được Lựa Chọn
            </h2>
          </div>
          <p className="text-xs text-white/75 max-w-2xl leading-relaxed">
            Áp đặt và tinh chỉnh các đầu API Key bảo mật. Hỗ trợ xoay vòng tải luân phiên để tránh lỗi rate limit của tài khoản.
          </p>
        </div>
        <div className="bg-white/10 backdrop-blur-sm p-3 px-4 rounded-xl border border-white/20 text-center shrink-0">
          <div className="text-[10px] text-white/70 uppercase font-bold tracking-wider">Model Khởi Động:</div>
          <div className="text-amber-300 font-mono font-semibold text-sm mt-0.5">{activeModel.name}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className={hasAnyApiKey ? uiInlineFeedbackSuccess : uiInlineFeedbackWarning}>
          {hasAnyApiKey
            ? "API key đã được cấu hình. Bạn có thể dịch ngay trong Lab."
            : "Chưa có API key nào. Hãy nhập ít nhất 1 key để kích hoạt dịch thuật."}
        </div>
        <div className={uiInlineFeedbackInfo}>
          Chế độ hiện tại: <strong>{settings.directClientTranslation ? "Direct Client API" : "Qua máy chủ trung gian"}</strong>.
        </div>
      </div>

      {/* Grid container responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: API KEYS FORM & CONFIG */}
        <div className="lg:col-span-12 xl:col-span-12 flex flex-col gap-6 w-full">
          <div className={`${uiPanel} !p-5 space-y-4`}>
            <div className="flex items-center gap-2 pb-3 border-b border-app-border">
              <Boxes className="w-5 h-5 text-app-accent" />
              <h3 className={`${uiLabel} !text-xs`}>Cài Đặt Model AI Dịch Thuật</h3>
            </div>
            <p className={uiCaption}>
              Gom toàn bộ API key, chọn model ưu tiên, bảng tóm tắt hiệu năng và nhà cung cấp mở rộng vào một giao diện phụ.
            </p>
            <div className={`${uiCardInset} p-4 space-y-2`}>
              <span className="text-[11px] font-bold text-app-text">
                Model hiện tại: <span className="text-app-accent">{activeModel.name}</span>
              </span>
              <p className={`${uiCaption} !text-[10px]`}>
                Thứ tự nhánh: Google Gemini → Anthropic Claude → DeepSeek → Alibaba Qwen (+ OpenAI và nhà cung cấp khác).
              </p>
            </div>
            <button
              type="button"
              onClick={openAiSettingsCenter}
              className={`${uiBtnPrimary} w-full !min-h-11`}
            >
              <Cpu className="w-4 h-4" />
              Mở Cài Đặt Model AI Dịch Thuật
            </button>
          </div>

          {/* AI QUALITY CARD */}
          <div className={`${uiPanel} !p-5 space-y-4`}>
            <div className="flex items-center gap-2 pb-3 border-b border-app-border">
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              <h3 className={`${uiLabel} !text-xs`}>Cấu hình lập luận dịch thuật</h3>
            </div>

            <div className="space-y-4">
              {/* Temperature */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-app-text-muted">
                  <span>Khả năng thoát nghĩa (Temperature)</span>
                  <span className="font-mono bg-amber-500/10 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                    {settings.temperature ?? 0.3}
                  </span>
                </div>
                <input
                  type="range"
                  min="0.0"
                  max="1.5"
                  step="0.05"
                  value={settings.temperature ?? 0.3}
                  onChange={(e) => onUpdateSetting?.("temperature", parseFloat(e.target.value))}
                  className="w-full h-1.5 rounded-lg appearance-none cursor-pointer bg-app-surface-muted accent-amber-500"
                />
                <p className={`${uiCaption} !text-[10px]`}>
                  Cài đặt thấp (0.1 - 0.3) dịch sát nghĩa từng chữ của truyện, giữ thăng bằng xưng hô tốt nhất. Đặt cao giúp bay bổng thanh thoát câu từ.
                </p>
              </div>

              {/* Max Threads */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-app-text-muted">
                  <span>Số luồng dịch song song (chương + đoạn trong chương dài)</span>
                  <span className="font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-lg text-[11px] font-bold">
                    {settings.maxThreads ?? 1} luồng
                  </span>
                </div>
                {/* h-11 height trigger */}
                <select
                  value={settings.maxThreads ?? 1}
                  onChange={(e) => onUpdateSetting?.("maxThreads", parseInt(e.target.value))}
                  className={`${uiInput} !min-h-11 rounded-xl !text-xs font-bold cursor-pointer`}
                >
                  <option value={1}>1 Chương tại một thời điểm (Khuyên dùng Free)</option>
                  <option value={2}>2 Chương song song</option>
                  <option value={3}>3 Chương song song</option>
                  <option value={4}>4 Chương song song</option>
                  <option value={5}>5 Chương song song (Yêu cầu tài khoản Paid)</option>
                </select>
              </div>

              <div className="bg-amber-500/5 border border-amber-500/25 rounded-lg p-4 text-[10.5px] leading-relaxed text-amber-900 dark:text-amber-400 space-y-1.5">
                <span className="font-bold flex items-center gap-1">Cài đặt an toàn tránh trào lưu rate limit:</span>
                <p>• <strong>Gói Google MIỄN PHÍ:</strong> Bắt buộc đặt <strong>1 Luồng</strong>. Hạn mức Free Tier của Google AI Studio chỉ cho phép gọi 15 yêu cầu trên một phút, gọi nhiều hơn sẽ bị block lỗi 429.</p>
                <p>• <strong>Gói Vertex / Studio PAY-AS-YOU-GO:</strong> Đặt <strong>2 - 3 Luồng</strong> để dịch song song nhiều chương trong Lab Dịch (Dịch toàn bộ / Dịch chương đã chọn).</p>
                <p>• <strong>Chương 15–30 nghìn chữ:</strong> Cùng cài đặt này còn cho phép dịch <strong>tối đa 3 đoạn trong cùng một chương</strong> song song (DeepSeek, GPT, Claude, Qwen…). Giữ <strong>1 luồng</strong> nếu dùng Gemini free hoặc ưu tiên đồng nhất tên/xưng hô hơn tốc độ.</p>
              </div>

              <div className="space-y-2 bg-app-surface-muted/70 border border-app-border rounded-lg p-3 relative">
                <button
                  type="button"
                  onClick={() => setShowStrategyTips((prev) => !prev)}
                  className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full border border-app-border bg-app-surface hover:bg-app-surface-muted text-app-text-muted"
                  aria-label="Xem preset chiến lược dịch"
                  title="Xem preset chiến lược dịch"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
                <span className="text-xs font-bold text-app-text block">Preset chiến lược dịch nhanh</span>
                <p className={`${uiCaption} !text-[10px]`}>
                  Bấm preset để auto-set luồng, chế độ tuần tự và ngân sách token theo mục tiêu.
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => applyTranslationStrategyPreset("safe")}
                    className={`${uiBtnGhost} !justify-start !min-h-10 !px-3 !py-2 !text-[10.5px] font-bold`}
                  >
                    Tiết kiệm an toàn: 1 luồng, tuần tự tắt, budget 80000, dict/chunk 1600
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTranslationStrategyPreset("balanced")}
                    className={`${uiBtnGhost} !justify-start !min-h-10 !px-3 !py-2 !text-[10.5px] font-bold`}
                  >
                    Cân bằng: 2 luồng, tuần tự tắt, budget 100000, dict/chunk 2600
                  </button>
                  <button
                    type="button"
                    onClick={() => applyTranslationStrategyPreset("quality")}
                    className={`${uiBtnGhost} !justify-start !min-h-10 !px-3 !py-2 !text-[10.5px] font-bold`}
                  >
                    Ưu tiên chất lượng: 1 luồng, tuần tự bật, budget 140000, dict/chunk 3400
                  </button>
                </div>
                {showStrategyTips && (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-2.5 text-[10px] leading-relaxed text-app-text space-y-1">
                    <p>
                      <strong>Mẹo:</strong> Dịch hàng loạt nên dùng preset Cân bằng. Chương khó tên/xưng hô, chuyển sang
                      preset Ưu tiên chất lượng trước khi bấm Dịch chương.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2 bg-app-surface-muted/70 border border-app-border rounded-lg p-3 relative">
                <button
                  type="button"
                  onClick={() => setShowBudgetTips((prev) => !prev)}
                  className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-full border border-app-border bg-app-surface hover:bg-app-surface-muted text-app-text-muted"
                  aria-label="Xem gợi ý preset token"
                  title="Xem gợi ý preset token"
                >
                  <HelpCircle className="w-4 h-4" />
                </button>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <span className="text-xs font-bold text-app-text block">Cảnh báo ngân sách token/chương</span>
                    <p className={`${uiCaption} !text-[10px] mt-1`}>
                      Bật để app ước tính token trước khi chạy, nếu vượt ngưỡng sẽ yêu cầu xác nhận lại (áp dụng cho mọi model AI).
                    </p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={settings.translationBudgetGuardEnabled !== false}
                    onClick={() =>
                      onUpdateSetting?.(
                        "translationBudgetGuardEnabled",
                        settings.translationBudgetGuardEnabled === false
                      )
                    }
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      settings.translationBudgetGuardEnabled === false ? "bg-app-border" : "bg-app-accent"
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                        settings.translationBudgetGuardEnabled === false ? "translate-x-0" : "translate-x-5"
                      }`}
                    />
                  </button>
                </div>
                {showBudgetTips && (
                  <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3 text-[10.5px] leading-relaxed text-app-text space-y-1.5">
                    <span className="font-bold text-sky-600 dark:text-sky-400">Gợi ý preset nhanh</span>
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => applyTokenPreset(80000, 1600)}
                        className={`${uiBtnGhost} !justify-start !min-h-10 !px-3 !py-2 !text-[10.5px]`}
                      >
                        1) Tiết kiệm token tối đa: Dict/chunk 1400-1800, budget/chương 70000-90000
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTokenPreset(100000, 2600)}
                        className={`${uiBtnGhost} !justify-start !min-h-10 !px-3 !py-2 !text-[10.5px]`}
                      >
                        2) Cân bằng: Dict/chunk 2200-2800, budget/chương 90000-120000
                      </button>
                      <button
                        type="button"
                        onClick={() => applyTokenPreset(140000, 3400)}
                        className={`${uiBtnGhost} !justify-start !min-h-10 !px-3 !py-2 !text-[10.5px]`}
                      >
                        3) Ưu tiên chất lượng thuật ngữ: Dict/chunk 3000-3800, budget/chương 120000-160000
                      </button>
                    </div>
                    <p className={`${uiCaption} !text-[10px]`}>
                      Bấm một preset để tự điền nhanh 2 ô cấu hình ngay bên dưới.
                    </p>
                  </div>
                )}
                <div className="space-y-1.5">
                  <span className={uiFieldLabel}>Ngưỡng cảnh báo (token/chương)</span>
                  <input
                    type="number"
                    min={10000}
                    step={5000}
                    value={settings.translationBudgetPerChapter ?? 120000}
                    onChange={(e) =>
                      onUpdateSetting?.(
                        "translationBudgetPerChapter",
                        Math.max(10000, Number.parseInt(e.target.value || "0", 10) || 120000)
                      )
                    }
                    className={`${uiInput} !min-h-11 rounded-xl !text-xs font-bold`}
                  />
                </div>
                <div className="space-y-1.5">
                  <span className={uiFieldLabel}>Trần ký tự thuật ngữ cho mỗi đoạn (Dict/chunk)</span>
                  <input
                    type="number"
                    min={800}
                    step={100}
                    value={settings.translationChunkDictMaxChars ?? 2600}
                    onChange={(e) =>
                      onUpdateSetting?.(
                        "translationChunkDictMaxChars",
                        Math.max(800, Number.parseInt(e.target.value || "0", 10) || 2600)
                      )
                    }
                    className={`${uiInput} !min-h-11 rounded-xl !text-xs font-bold`}
                  />
                  <p className={`${uiCaption} !text-[10px]`}>
                    Mức thấp giúp giảm token nhiều hơn; mức cao giữ nhiều thuật ngữ hơn trong mỗi đoạn.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 bg-app-surface-muted/80 border border-app-border rounded-lg px-3 py-3">
                <div className="min-w-0">
                  <span className="text-xs font-bold text-app-text block">Dịch tuần tự từng đoạn (chương dài)</span>
                  <p className={`${uiCaption} !text-[10px] mt-1 leading-relaxed`}>
                    Bật: mỗi đoạn nhận ngữ cảnh cuối đoạn trước — tên/xưng hô đồng nhất hơn, chậm hơn song song. Tắt (mặc định): ưu tiên tốc độ.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={!!settings.translationSequentialChunks}
                  onClick={() =>
                    onUpdateSetting?.(
                      "translationSequentialChunks",
                      !settings.translationSequentialChunks
                    )
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    settings.translationSequentialChunks ? "bg-app-accent" : "bg-app-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                      settings.translationSequentialChunks ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Directives prompts textareas */}
              <div className="space-y-4 pt-3 border-t border-app-border">
                <span className={`${uiLabel} block !text-xs`}>
                  Chỉ thị biên dịch (System Prompts)
                </span>
                <p className="text-[10px] text-app-text-muted leading-relaxed">
                  Để trống cả hai ô → hướng dẫn mặc định hệ thống. Có nhập ít nhất một ô → ưu tiên chỉ thị 1 rồi 2 (thay phần giọng văn mặc định). App luôn giữ quy tắc 1 dòng = 1 dòng và «dịch theo nghĩa, không phiên âm Hán-Việt thuần». Prompt JSON sẽ được chuyển sang dạng văn bản trước khi gửi API.
                </p>
                
                <div className="space-y-1.5">
                  <span className={uiFieldLabel}>Mệnh lệnh chỉ thị 1:</span>
                  <textarea
                    rows={4}
                    value={settings.prompt1 || ""}
                    onChange={(e) => onUpdateSetting?.("prompt1", e.target.value)}
                    placeholder="Ví dụ: Định hình giọng dịch lãng mạn nhẹ nhàng..."
                    className={`${uiInput} p-3 rounded-xl !text-xs resize-y`}
                  />
                </div>

                <div className="space-y-1.5">
                  <span className={uiFieldLabel}>Mệnh lệnh chỉ thị 2:</span>
                  <textarea
                    rows={4}
                    value={settings.prompt2 || ""}
                    onChange={(e) => onUpdateSetting?.("prompt2", e.target.value)}
                    placeholder="Ví dụ: Giữ nguyên vẹn sắc thái đại từ xưng hô sư đồ..."
                    className={`${uiInput} p-3 rounded-xl !text-xs resize-y`}
                  />
                </div>
              </div>

            </div>
          </div>

        </div>

      </div>

      {showModelSettingsCenter && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[53] bg-app-surface flex flex-col app-chrome-safe-top app-chrome-safe-bottom">
          <div className="sticky top-0 z-10 border-b border-app-border bg-app-surface px-3 sm:px-4 py-3 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h3 className={`${uiTitle} truncate`}>
                {aiSettingsLayer === "catalog"
                  ? "Danh Sách Model AI"
                  : aiSettingsEntry === "otherPopular"
                    ? "Bổ Sung Model Phổ Biến Khác"
                    : `Cài Đặt Chi Tiết: ${MODEL_PROVIDER_TITLES[activeProviderTab]}`}
              </h3>
              <p className={`${uiCaption} mt-1`}>
                {aiSettingsLayer === "catalog"
                  ? "Chọn nhánh model AI để mở lớp cài đặt chi tiết."
                  : "Thiết lập API key, model ưu tiên và tham số liên quan cho nhánh đã chọn."}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (aiSettingsLayer === "detail") {
                    setAiSettingsLayer("catalog");
                    return;
                  }
                  setShowModelSettingsCenter(false);
                }}
                className={`${uiBtnGhost} !min-h-10 !px-3`}
              >
                {aiSettingsLayer === "detail" ? "Quay lại danh sách" : "Quay lại"}
              </button>
            </div>
          </div>

          <div ref={aiLayerScrollRef} className="flex-1 p-3 sm:p-4 pb-6 sm:pb-8 overflow-y-auto custom-scrollbar">
            {aiSettingsLayer === "catalog" ? (
              <div className="h-full max-w-3xl mx-auto">
                <div className={`${uiPanel} !p-3 sm:!p-4 space-y-3`}>
                {MODEL_PROVIDER_ORDER.map((provider) => (
                  <div
                    key={provider}
                    className={`${uiCardInset} !p-2.5 flex items-center gap-2`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setActiveProviderTab(provider);
                        setAiSettingsEntry(provider);
                        setAiSettingsLayer("detail");
                      }}
                      className={`${uiBtnGhost} flex-1 !justify-between !min-h-11 text-[15px] sm:text-sm`}
                    >
                      <span className="text-left">{MODEL_PROVIDER_TITLES[provider]}</span>
                      <span className="text-app-text-muted whitespace-nowrap">Mở chi tiết</span>
                    </button>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={activeEntry === provider}
                      onClick={() => activateProviderEntry(provider)}
                      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                        activeEntry === provider ? "bg-app-accent" : "bg-app-border"
                      }`}
                      title={`Bật ${MODEL_PROVIDER_TITLES[provider]}`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                          activeEntry === provider ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </button>
                  </div>
                ))}
                <div className={`${uiCardInset} !p-2.5 flex items-center gap-2`}>
                  <button
                    type="button"
                    onClick={() => {
                      setAiSettingsEntry("otherPopular");
                      setAiSettingsLayer("detail");
                    }}
                    className={`${uiBtnGhost} flex-1 !justify-between !min-h-11 text-[15px] sm:text-sm`}
                  >
                    <span className="text-left">Bổ Sung Model Phổ Biến Khác</span>
                    <span className="text-app-text-muted whitespace-nowrap">Mở chi tiết</span>
                  </button>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={activeEntry === "otherPopular"}
                    onClick={() => activateProviderEntry("otherPopular")}
                    className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      activeEntry === "otherPopular" ? "bg-app-accent" : "bg-app-border"
                    }`}
                    title="Bật nhánh model bổ sung"
                  >
                    <span
                      className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                        activeEntry === "otherPopular" ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
              </div>
            ) : aiSettingsEntry === "otherPopular" ? (
              <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4 h-full overflow-y-auto custom-scrollbar pr-1">
                <div className={`${uiPanel} !p-4 space-y-3`}>
                  <div className="space-y-1.5">
                    <span className={uiFieldLabel}>Preset provider phổ biến</span>
                    <select
                      value={otherProviderPreset}
                      onChange={(e) => applyOtherProviderPreset(e.target.value)}
                      className={`${uiInput} !min-h-10 !text-xs`}
                    >
                      <option value="">Chọn nhanh một nhà cung cấp...</option>
                      {OTHER_PROVIDER_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <span className={uiFieldLabel}>Tên hiển thị</span>
                      <input
                        type="text"
                        value={settings.customProviderLabel || ""}
                        onChange={(e) => onUpdateSetting?.("customProviderLabel", e.target.value)}
                        placeholder="Ví dụ: Z.ai GLM"
                        className={`${uiInput} !min-h-10 !text-xs`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <span className={uiFieldLabel}>Model ID mặc định</span>
                      <input
                        type="text"
                        value={settings.customProviderModel || ""}
                        onChange={(e) => onUpdateSetting?.("customProviderModel", e.target.value)}
                        placeholder="glm-4.5-flash"
                        className={`${uiInput} !min-h-10 !text-xs font-mono`}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className={uiFieldLabel}>API Base URL</span>
                    <input
                      type="text"
                      value={settings.customProviderApiBase || ""}
                      onChange={(e) => onUpdateSetting?.("customProviderApiBase", e.target.value)}
                      placeholder="https://open.bigmodel.cn/api/paas/v4"
                      className={`${uiInput} !min-h-10 !text-xs font-mono`}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <span className={uiFieldLabel}>API key (custom)</span>
                    {renderMultiKeyFields("custom", "sk-...")}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const customModel = (settings.customProviderModel || "").trim();
                      if (!customModel) return;
                      onSelectModel(`custom::${customModel}`);
                    }}
                    className={`${uiBtnGhost} w-full !min-h-10`}
                  >
                    Dùng model custom cho bản dịch mới
                  </button>
                </div>
              </div>
            ) : (
              <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4 h-full overflow-y-auto custom-scrollbar pr-1">
                <div className={`${uiPanel} !p-4 space-y-3`}>
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <h4 className={uiLabel}>{MODEL_PROVIDER_TITLES[activeProviderTab]}</h4>
                    <button
                      type="button"
                      onClick={() => void handleRefreshProviderModels(activeProviderTab)}
                      disabled={providerRefreshLoading[activeProviderTab]}
                      className={`${uiBtnSecondary} !min-h-10 !px-3`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${providerRefreshLoading[activeProviderTab] ? "animate-spin" : ""}`} />
                      Refresh model
                    </button>
                  </div>
                  <p className={`${uiCaption} !text-[10px]`}>
                    {providerRefreshStatus[activeProviderTab] || "Dùng danh sách local; bấm Refresh để lấy model mới nhất theo API key của nhánh này."}
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className={`${uiCardInset} p-3 space-y-1.5`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-app-text">Xoay tua API key chéo nhánh</span>
                        <button
                          type="button"
                          onClick={() => onUpdateSetting?.("enableCrossRotation", !settings.enableCrossRotation)}
                          className={`${uiToggleTrack} ${settings.enableCrossRotation ? uiToggleTrackOn : uiToggleTrackOff}`}
                        >
                          <span className={`${uiToggleThumb} ${settings.enableCrossRotation ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>
                    <div className={`${uiCardInset} p-3 space-y-1.5`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-app-text">Direct Client API</span>
                        <button
                          type="button"
                          onClick={() => onUpdateSetting?.("directClientTranslation", !settings.directClientTranslation)}
                          className={`${uiToggleTrack} ${
                            settings.directClientTranslation ? "bg-emerald-500" : uiToggleTrackOff
                          }`}
                        >
                          <span className={`${uiToggleThumb} ${settings.directClientTranslation ? "translate-x-5" : "translate-x-0"}`} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <span className={uiFieldLabel}>Remote Proxy URL (tuỳ chọn)</span>
                    <input
                      type="text"
                      value={settings.remoteServerUrl || ""}
                      onChange={(e) => onUpdateSetting?.("remoteServerUrl", e.target.value)}
                      placeholder="https://ten-proxy.run.app"
                      className={`${uiInput} !min-h-10 !text-xs font-mono`}
                    />
                  </div>
                  <div className="space-y-2">
                    <span className={uiFieldLabel}>Nhập API key</span>
                    {renderMultiKeyFields(activeProviderTab, activeProviderTab === "google" ? "AIzaSy..." : "sk-...")}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div className="space-y-1.5">
                      <span className={uiFieldLabel}>Nhóm model ưu tiên</span>
                      <select
                        value={providerTierPick[activeProviderTab] || "Khác"}
                        onChange={(e) => {
                          const nextTier = e.target.value;
                          setProviderTierPick((prev) => ({
                            ...prev,
                            [activeProviderTab]: nextTier,
                          }));
                          const nextTierModels = sortModelsByRecency(
                            activeProviderModels.filter((m) => detectModelTier(m.id) === nextTier)
                          ).slice(0, 3);
                          if (nextTierModels.length === 0) {
                            setProviderRefreshStatus((prev) => ({
                              ...prev,
                              [activeProviderTab]:
                                `Nhóm "${nextTier}" chưa có model khả dụng. Hãy đổi nhóm hoặc bấm Refresh model.`,
                            }));
                            return;
                          }
                          if (!nextTierModels.some((m) => m.id === settings.selectedModel)) {
                            onSelectModel(nextTierModels[0].id);
                          }
                        }}
                        className={`${uiInput} !min-h-10 !text-xs`}
                      >
                        {activeProviderTiers.map((tier) => (
                          <option key={tier} value={tier}>
                            {tier}
                          </option>
                        ))}
                        {activeProviderTiers.length === 0 && <option value="Khác">Khác</option>}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <span className={uiFieldLabel}>Phiên bản (2-3 bản mới nhất)</span>
                      <select
                        value={activePickedModel?.id || ""}
                        onChange={(e) => onSelectModel(e.target.value)}
                        className={`${uiInput} !min-h-10 !text-xs`}
                      >
                        {detailModelOptions.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                        {detailModelOptions.length === 0 && <option value="">Không có model khả dụng</option>}
                      </select>
                      {detailModelOptions.length === 0 && (
                        <p className={`${uiCaption} !text-[10px]`}>
                          Nhóm đang chọn chưa có model nào. Hãy đổi nhóm model hoặc bấm Refresh model.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                {activePickedModel && (
                  <div className="bg-gradient-to-br from-app-accent to-app-accent-hover text-white rounded-xl p-4 border border-app-border">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold tracking-wide uppercase">Bảng tóm tắt hiệu năng</span>
                      <span className="text-[10px] bg-white/15 px-2 py-0.5 rounded-full">{activePickedModel.name}</span>
                    </div>
                    <p className="text-sm mt-2 font-semibold text-amber-200">{activePickedModel.strength}</p>
                    <p className="text-xs mt-1 text-white/85">{activePickedModel.description}</p>
                    <div className="mt-2 text-[11px] text-white/75">
                      <div>Chi phí: {activePickedModel.cost}</div>
                      <div>Phù hợp: {activePickedModel.plan}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
            {saveSuccess && (
              <div className="max-w-3xl mx-auto mt-3 sm:mt-4">
                <div className={`${uiInlineFeedbackSuccess} flex items-center gap-1.5`}>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  {PROVIDER_SAVE_SUCCESS_LABELS[saveSuccess] || "Đã lưu cấu hình API key."}
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
