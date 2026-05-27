import React, { useState } from "react";
import {
  Key,
  Cpu,
  Info,
  Eye,
  EyeOff,
  Check,
  ExternalLink,
  Shield,
  HelpCircle,
  Sparkles,
  Database,
  Coins,
  Plus,
  Trash2,
  Sun,
  Moon,
  Monitor
} from "lucide-react";
import { AppColorScheme, TranslationSettings } from "../types";
import {
  uiPanel,
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
} from "../lib/ui";
import {
  MODELS_DATABASE,
  getModelsByProvider,
  resolveSelectedModel,
  type AiModelDetails,
} from "../utils/aiModels";

interface SettingsTabProps {
  settings: TranslationSettings;
  onUpdateApiKey: (platform: "google" | "openai" | "claude" | "deepseek" | "qwen", value: string) => void;
  onSelectModel: (modelId: string) => void;
  onUpdateSetting?: (key: keyof TranslationSettings, val: any) => void;
}

const PROVIDER_SECTION_LABELS: Record<string, string> = {
  google: "Nhánh Google (Gemini)",
  claude: "Nhánh Anthropic (Claude)",
  deepseek: "DeepSeek AI",
  qwen: "Alibaba Qwen (DashScope)",
  openai: "Nhánh OpenAI (GPT)",
};

const PROVIDER_SELECT_STYLES: Record<
  string,
  { active: string; ring: string }
> = {
  google: {
    active: "bg-blue-500/10 border-blue-500 text-blue-800 dark:text-blue-300",
    ring: "border-blue-500 bg-blue-500",
  },
  claude: {
    active: "bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-400",
    ring: "border-amber-500 bg-amber-500",
  },
  deepseek: {
    active: "bg-cyan-500/10 border-cyan-500 text-cyan-700 dark:text-cyan-300",
    ring: "border-cyan-500 bg-cyan-500",
  },
  qwen: {
    active: "bg-purple-500/10 border-purple-500 text-purple-700 dark:text-purple-400",
    ring: "border-purple-500 bg-purple-500",
  },
  openai: {
    active: "bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-300",
    ring: "border-emerald-500 bg-emerald-500",
  },
};

function ModelProviderSection({
  models,
  providerKey,
  selectedModelId,
  onSelectModel,
}: {
  models: AiModelDetails[];
  providerKey: string;
  selectedModelId: string;
  onSelectModel: (id: string) => void;
}) {
  if (models.length === 0) return null;
  const styles = PROVIDER_SELECT_STYLES[providerKey] || PROVIDER_SELECT_STYLES.google;

  return (
    <div className="space-y-2 pt-2 border-t border-app-border [&:first-child]:border-t-0 [&:first-child]:pt-0">
      <div className={`${uiFieldLabel} pl-1 !mb-0`}>
        {PROVIDER_SECTION_LABELS[providerKey] || providerKey}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {models.map((m) => {
          const isSelected = selectedModelId === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelectModel(m.id)}
              className={`p-3.5 rounded-xl border text-left cursor-pointer transition-all flex justify-between items-start active:scale-98 ${
                isSelected ? styles.active : `${uiCardInset} hover:bg-app-surface`
              }`}
            >
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold flex items-center gap-1.5 flex-wrap">
                  <span>{m.name}</span>
                  {m.recommended && (
                    <span className="text-[9px] text-amber-500 bg-amber-500/10 border border-amber-500/20 font-semibold px-1.5 py-0.5 rounded-md uppercase">
                      Đề xuất
                    </span>
                  )}
                </div>
                <p className={`${uiCaption} mt-1 lines-clamp-1 !text-[10px]`}>
                  {m.strength}
                </p>
              </div>
              <div
                className={`w-4 h-4 rounded-full border flex items-center justify-center p-0.5 shrink-0 ${
                  isSelected
                    ? `${styles.ring} text-white`
                    : "border-app-border bg-app-surface"
                }`}
              >
                {isSelected && <div className="w-1.5 h-1.5 bg-white rounded-full" />}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function SettingsTab({ settings, onUpdateApiKey, onSelectModel, onUpdateSetting }: SettingsTabProps) {
  const [showKeys, setShowKeys] = useState({
    google: false,
    openai: false,
    claude: false,
    deepseek: false,
    qwen: false
  });

  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const resolvedModelId = resolveSelectedModel(settings.selectedModel);
  const activeModel =
    MODELS_DATABASE.find((m) => m.id === resolvedModelId) || MODELS_DATABASE[0];

  const googleModels = getModelsByProvider("google");
  const claudeModels = getModelsByProvider("claude");
  const deepseekModels = getModelsByProvider("deepseek");
  const qwenModels = getModelsByProvider("qwen");
  const openaiModels = getModelsByProvider("openai");

  const handleToggleKeyVisibility = (platform: keyof typeof showKeys) => {
    setShowKeys(prev => ({
      ...prev,
      [platform]: !prev[platform]
    }));
  };

  const getProviderBadge = (provider: string) => {
    switch (provider) {
      case "google":
        return <span className="bg-blue-500/10 border border-blue-500/20 text-blue-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans">Google Gemini</span>;
      case "openai":
        return <span className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans">OpenAI GPT</span>;
      case "claude":
        return <span className="bg-amber-500/10 border border-amber-500/20 text-amber-500 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans">Anthropic Claude</span>;
      case "deepseek":
        return <span className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans">DeepSeek AI</span>;
      case "qwen":
        return <span className="bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider font-sans">Alibaba Qwen</span>;
      default:
        return null;
    }
  };

  const currentKeys = settings.apiKeys || {};

  const renderMultiKeyFields = (
    platform: "google" | "openai" | "claude" | "deepseek" | "qwen",
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
    <div className="space-y-6" id="settings-tab-panel">
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
      <div className={uiBannerHero}>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Shield className="w-5.5 h-5.5 text-amber-500 animate-pulse" />
            <h2 className="text-base font-bold uppercase tracking-wide">Trung Tâm Cấu Hình & Máy Dịch Đa Nền Tảng</h2>
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

      {/* Grid container responsive */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: API KEYS FORM & CONFIG */}
        <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-6 w-full">
          {/* API KEYS CARD */}
          <div className={`${uiPanel} !p-5 space-y-5`}>
            <div className="flex items-center gap-2 pb-3 border-b border-app-border">
              <Key className="w-5 h-5 text-amber-500" />
              <h3 className={`${uiLabel} !text-xs !tracking-widest`}>Kén Chọn Nhập API Key</h3>
            </div>

            <p className={`${uiCaption} !text-[11px] italic select-none`}>
              * Khóa API được lưu trữ trực tiếp và tuyệt đối mã hóa tại trình duyệt của bạn (Local Storage) để bảo mật cao nhất hằng ngày.
            </p>

            {/* Cross-platform API Key rotation toggle (Height 11 UI selection) */}
            <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-lg space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-app-text flex items-center gap-2 cursor-pointer select-none">
                  <Cpu className="w-4 h-4 text-amber-500 animate-spin-slow" />
                  Xoay tua API Key chéo nền tảng
                </label>
                <button
                  type="button"
                  onClick={() => onUpdateSetting?.("enableCrossRotation", !settings.enableCrossRotation)}
                  className={`${uiToggleTrack} ${
                    settings.enableCrossRotation ? uiToggleTrackOn : uiToggleTrackOff
                  }`}
                >
                  <span
                    className={`${uiToggleThumb} ${
                      settings.enableCrossRotation ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <p className={`${uiCaption} !text-[10px]`}>
                Khi bật, hệ dịch thuật sẽ lấy một trong các dòng khóa bất kì của bạn hằng giây để kích hoạt dịch đa luồng, loại bỏ nghẽn rate limit của một account đơn lẻ.
              </p>
            </div>

            {/* CẤU HÌNH HOẠT ĐỘNG LOCAL / OFFLINE BẢO MẬT */}
            <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-app-text flex items-center gap-2 cursor-pointer select-none">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  Dịch trực tiếp từ thiết bị (Direct Client API)
                </label>
                <button
                  type="button"
                  onClick={() => onUpdateSetting?.("directClientTranslation", !settings.directClientTranslation)}
                  className={`${uiToggleTrack} ${
                    settings.directClientTranslation ? "bg-emerald-500" : uiToggleTrackOff
                  }`}
                >
                  <span
                    className={`${uiToggleThumb} ${
                      settings.directClientTranslation ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <p className={`${uiCaption} !text-[10px]`}>
                Kích hoạt để ứng dụng kết nối trực tiếp đến Google/OpenAI/DeepSeek mà không đi qua máy chủ trung gian. Giúp ứng dụng hoạt động độc lập tuyệt đối, loại bỏ sự phụ thuộc khi máy chủ bảo trì.
              </p>

              <div className="space-y-1.5 pt-2 border-t border-emerald-500/10">
                <span className={uiFieldLabel}>Máy chủ dịch thuật từ xa (Remote Proxy):</span>
                <input
                  type="text"
                  value={settings.remoteServerUrl || ""}
                  onChange={(e) => onUpdateSetting?.("remoteServerUrl", e.target.value)}
                  placeholder="https://tên-máy-chủ-củ-bạn.run.app"
                  className={`${uiInput} !min-h-11 rounded-xl !text-xs font-mono focus:ring-emerald-500/50 focus:border-emerald-500`}
                />
                <p className={`${uiCaption} !text-[9.5px]`}>
                  Cấu hình URL Cloud Run hoặc Server của bạn. Bỏ trống để sử dụng máy chủ mặc định của ứng dụng.
                </p>
              </div>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
              
              {/* Google Gemini Card */}
              <div className={`${uiCardInset} space-y-2 p-4`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-app-text flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    Google Gemini Key
                  </label>
                  <a
                    href="https://aistudio.google.com/"
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="text-[10px] text-blue-500 hover:underline flex items-center gap-0.5"
                  >
                    Lấy Key Free <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                {renderMultiKeyFields("google", "AIzaSy...")}
                {saveSuccess === "google" && (
                  <span className="text-[10px] text-emerald-500 font-bold block flex items-center gap-1 animate-pulse mt-1">
                    <Check className="w-3.5 h-3.5" /> Đã lưu khóa Google Gemini
                  </span>
                )}
              </div>

              {/* OpenAI Card */}
              <div className={`${uiCardInset} space-y-2 p-4`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-app-text flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
                    OpenAI GPT Key
                  </label>
                  <a
                    href="https://platform.openai.com/api-keys"
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="text-[10px] text-emerald-500 hover:underline flex items-center gap-0.5"
                  >
                    Lấy OpenAI Key <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                {renderMultiKeyFields("openai", "sk-proj-...")}
                {saveSuccess === "openai" && (
                  <span className="text-[10px] text-emerald-500 font-bold block flex items-center gap-1 animate-pulse mt-1">
                    <Check className="w-3.5 h-3.5" /> Đã lưu khóa OpenAI
                  </span>
                )}
              </div>

              {/* Anthropic Claude */}
              <div className={`${uiCardInset} space-y-2 p-4`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-app-text flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-amber-500 rounded-full animate-pulse"></span>
                    Anthropic Claude Key
                  </label>
                  <a
                    href="https://console.anthropic.com/"
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="text-[10px] text-amber-500 hover:underline flex items-center gap-0.5"
                  >
                    Console Console <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                {renderMultiKeyFields("claude", "sk-ant-...")}
                {saveSuccess === "claude" && (
                  <span className="text-[10px] text-emerald-500 font-bold block flex items-center gap-1 animate-pulse mt-1">
                    <Check className="w-3.5 h-3.5" /> Đã lưu khóa Anthropic
                  </span>
                )}
              </div>

              {/* DeepSeek API */}
              <div className={`${uiCardInset} space-y-2 p-4`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-app-text flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></span>
                    DeepSeek API Key
                  </label>
                  <a
                    href="https://platform.deepseek.com/"
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="text-[10px] text-cyan-500 hover:underline flex items-center gap-0.5"
                  >
                    Lấy DeepSeek Key <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                {renderMultiKeyFields("deepseek", "sk-...")}
                {saveSuccess === "deepseek" && (
                  <span className="text-[10px] text-emerald-500 font-bold block flex items-center gap-1 animate-pulse mt-1">
                    <Check className="w-3.5 h-3.5" /> Đã lưu khóa DeepSeek
                  </span>
                )}
              </div>

              {/* Alibaba Qwen */}
              <div className={`${uiCardInset} space-y-2 p-4`}>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-app-text flex items-center gap-1.5">
                    <span className="w-2 h-2 bg-purple-500 rounded-full animate-pulse"></span>
                    Alibaba Qwen Key (DashScope)
                  </label>
                  <a
                    href="https://dashscope.console.aliyun.com/"
                    target="_blank"
                    referrerPolicy="no-referrer"
                    className="text-[10px] text-purple-500 hover:underline flex items-center gap-0.5"
                  >
                    Lấy Qwen Key <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                {renderMultiKeyFields("qwen", "lm-...")}
                {saveSuccess === "qwen" && (
                  <span className="text-[10px] text-emerald-500 font-bold block flex items-center gap-1 animate-pulse mt-1">
                    <Check className="w-3.5 h-3.5" /> Đã lưu khóa Qwen
                  </span>
                )}
              </div>

            </form>
          </div>

          {/* AI QUALITY CARD */}
          <div className={`${uiPanel} !p-5 space-y-4`}>
            <div className="flex items-center gap-2 pb-3 border-b border-app-border">
              <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              <h3 className={`${uiLabel} !text-xs !tracking-widest`}>Cấu Hình Lập Luận Dịch Thuật</h3>
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
                <span className="font-bold flex items-center gap-1">🛡️ CÀI ĐẶT AN TOÀN TRÁNH TRÀO LƯU RATE LIMIT:</span>
                <p>• <strong>Gói Google MIỄN PHÍ:</strong> Bắt buộc đặt <strong>1 Luồng</strong>. Hạn mức Free Tier của Google AI Studio chỉ cho phép gọi 15 yêu cầu trên một phút, gọi nhiều hơn sẽ bị block lỗi 429.</p>
                <p>• <strong>Gói Vertex / Studio PAY-AS-YOU-GO:</strong> Đặt <strong>2 - 3 Luồng</strong> để dịch song song nhiều chương trong Lab Dịch (Dịch toàn bộ / Dịch chương đã chọn).</p>
                <p>• <strong>Chương 15–30 nghìn chữ:</strong> Cùng cài đặt này còn cho phép dịch <strong>tối đa 3 đoạn trong cùng một chương</strong> song song (DeepSeek, GPT, Claude, Qwen…). Giữ <strong>1 luồng</strong> nếu dùng Gemini free hoặc ưu tiên đồng nhất tên/xưng hô hơn tốc độ.</p>
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
                <p className="text-[10px] text-app-muted leading-relaxed">
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

        {/* RIGHT COLUMN: AI PROVIDERS AND MODEL SELECTOR WITH DETAILS CARD */}
        <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-6 w-full">
          {/* Main model collection grids selector */}
          <div className={`${uiPanel} !p-5 space-y-4`}>
            <div className="flex items-center justify-between pb-3 border-b border-app-border">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-amber-500 animate-spin-slow" />
                <h3 className={`${uiLabel} !text-xs !tracking-widest`}>Ưu Tiên Chọn Model AI Nhãn</h3>
              </div>
              <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono font-semibold text-[10px] px-3 py-1 rounded-full uppercase tracking-wider">
                {MODELS_DATABASE.length} Models
              </span>
            </div>

            <p className={`${uiCaption} mt-1`}>
              Vui lòng click chọn một mô hình thích hợp. Giao diện Fluent Design hỗ trợ kết nối trực tiếp đến core máy dịch tương đương của bạn:
            </p>

            <div className="space-y-0 max-h-[480px] overflow-y-auto custom-scrollbar pr-2">
              <ModelProviderSection
                models={googleModels}
                providerKey="google"
                selectedModelId={settings.selectedModel}
                onSelectModel={onSelectModel}
              />
              <ModelProviderSection
                models={claudeModels}
                providerKey="claude"
                selectedModelId={settings.selectedModel}
                onSelectModel={onSelectModel}
              />
              <ModelProviderSection
                models={deepseekModels}
                providerKey="deepseek"
                selectedModelId={settings.selectedModel}
                onSelectModel={onSelectModel}
              />
              <ModelProviderSection
                models={qwenModels}
                providerKey="qwen"
                selectedModelId={settings.selectedModel}
                onSelectModel={onSelectModel}
              />
              <ModelProviderSection
                models={openaiModels}
                providerKey="openai"
                selectedModelId={settings.selectedModel}
                onSelectModel={onSelectModel}
              />
            </div>
          </div>

          {/* DYNAMIC METADATA DETAILS CARD BRAND */}
          <div className="bg-gradient-to-br from-app-accent to-app-accent-hover text-white rounded-lg p-5 border border-app-border shadow-xl relative overflow-hidden">
            <div className="absolute right-0 top-0 translate-x-12 -translate-y-6 opacity-[0.06] pointer-events-none">
              <Cpu className="w-48 h-48 text-white" />
            </div>

            <div className="flex items-center justify-between border-b border-white/15 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4.5 h-4.5 text-amber-400 animate-pulse" />
                <h4 className={`${uiFieldLabel} !mb-0 text-white/60`}>Bảng tóm tắt hiệu năng</h4>
              </div>
              {getProviderBadge(activeModel.provider)}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <span className="text-base font-semibold text-amber-300 tracking-tight font-mono">{activeModel.name}</span>
              <span className="bg-white/10 px-2.5 py-1 border border-white/20 rounded-lg text-[10px] text-white/75 font-bold uppercase tracking-wider">
                Ưu điểm: {activeModel.strength}
              </span>
            </div>

            <div className="space-y-3.5 text-xs text-white/85 pt-3">
              
              <div className="space-y-1 bg-black/25 p-3.5 rounded-xl border border-white/10">
                <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase text-amber-400 tracking-wider">
                  <Database className="w-4 h-4" /> Phương thức bồi đắp tài khoản:
                </div>
                <p className="leading-relaxed font-bold text-white">
                  {activeModel.plan}
                </p>
              </div>

              <div className="flex items-center gap-2 bg-black/15 p-2 rounded-xl border border-white/10">
                <span className="font-bold text-white/55 flex items-center gap-1 shrink-0 uppercase tracking-widest text-[9.5px]">
                  <Coins className="w-4 h-4 text-amber-500" /> Chi phí ước lượng:
                </span>
                <span className="font-mono text-white bg-white/10 px-2.5 py-0.5 rounded-md border border-white/20 font-semibold text-xs">
                  {activeModel.cost}
                </span>
              </div>

              <div className="space-y-1.5 pt-1.5">
                <div className="flex items-center gap-1.5 text-white/55 font-bold uppercase text-[9.5px]">
                  <Info className="w-4 h-4" /> Bản mô tả máy dịch:
                </div>
                <p className="text-[11.5px] text-white/70 leading-relaxed font-sans italic p-2 bg-white/5 rounded-lg border border-white/10">
                  &ldquo;{activeModel.description}&rdquo;
                </p>
              </div>

            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
