import React, { Suspense, lazy, useState, useEffect, useCallback, useRef } from "react";
import { 
  BookOpen, 
  Library, 
  FileText, 
  Settings, 
  BookMarked, 
  Languages, 
  RefreshCw,
  Sparkles,
  Play,
  CheckCircle2,
  AlertCircle,
  X,
  HelpCircle,
  ChevronRight,
  ChevronLeft,
  GraduationCap,
  FolderTree,
  Home,
  List
} from "lucide-react";
import { saveValue, getValue, deleteValue } from "./lib/persistence";
import { mergeChapterRuleStates } from "./utils/chapterRulesEngine";
import { Novel, Chapter, TranslationSettings, DictItem, PronounMapping } from "./types";
import type { ChapterTranslationResult } from "./utils/chapterTranslationEngine";
import {
  buildChapterReadinessMap,
  getChapterReadinessSync,
  getPageTranslationProgress,
  type ChapterReadiness,
  type PageTranslationProgress,
} from "./utils/chapterTranslationBridge";
import ChapterReadinessBadge from "./components/ChapterReadinessBadge";
import {
  consumeLabOpenFocus,
  persistLabOpenFocus,
  syncChapterAcrossWorkspaces,
  type LabOpenFocus,
} from "./utils/workspaceNavigation";
import { mapWithConcurrency, clampThreadCount } from "./utils/concurrency";
import { formatChapterCharCountLabel } from "./utils/chapterMetrics";
import { buildDictContextString } from "./utils/dictContextBuilder";
import { isNovelDictImportEligible } from "./utils/novelDictImport";
import { maybeQueueLabAutoTranslateNextAfterLab } from "./utils/labAutoTranslateNext";
import ReaderViewGate from "./components/ReaderViewGate";
import TranslationErrorPanel from "./components/TranslationErrorPanel";
import PandaBrandIcon from "./components/PandaBrandIcon";
import { resolveSelectedModel } from "./utils/aiModels";
import { useAppColorScheme } from "./hooks/useAppColorScheme";
import { applyAppSystemChrome, applyReaderSystemChrome } from "./utils/systemChrome";
import { normalizeReaderTheme } from "./utils/readerChromeLayout";
import { readerSafeBottomCss } from "./utils/readerChromeLayout";
import {
  uiShell,
  uiHeader,
  uiMain,
  uiMenuRow,
  uiIconBox,
  uiPanel,
  uiCard,
  uiTitle,
  uiSubtitle,
  uiBtnGhost,
  uiBtnPrimary,
  uiBtnSecondary,
  uiBtnDanger,
  uiInput,
  uiLabel,
  uiCaption,
} from "./lib/ui";

const StoryLibrary = lazy(() => import("./components/StoryLibrary"));
const CompareView = lazy(() => import("./components/CompareView"));
const DictManager = lazy(() => import("./components/DictManager"));
const PronounsGuide = lazy(() => import("./components/PronounsGuide"));
const SettingsTab = lazy(() => import("./components/SettingsTab"));
const VFSManager = lazy(() => import("./components/VFSManager"));

const loadChapterTranslationEngine = () => import("./utils/chapterTranslationEngine");
const loadTranslationBackupUtils = () => import("./utils/translationBackup");

const DEFAULT_PRONOUNS: PronounMapping[] = [
  { id: "p1", chinese: "我", vietnamese: "ta", pinyin: "wǒ", note: "Tôi tự xưng ta" },
  { id: "p2", chinese: "你", vietnamese: "ngươi", pinyin: "nǐ", note: "Xưng hô trực diện đối thoại" },
  { id: "p3", chinese: "您", vietnamese: "ngài", pinyin: "nín", note: "Kính xưng kính trọng" },
  { id: "p4", chinese: "他", vietnamese: "hắn", pinyin: "tā", note: "Luôn là hắn, không sửa đổi!" },
  { id: "p5", chinese: "她", vietnamese: "nàng", pinyin: "tā", note: "Nữ ngôi thứ ba" },
  { id: "p6", chinese: "它", vietnamese: "nó", pinyin: "tā", note: "Vật/quái ngôi thứ ba" },
  { id: "p7", chinese: "我们", vietnamese: "chúng ta", pinyin: "wǒmen", note: "Số nhiều chúng ta" },
  { id: "p8", chinese: "咱们", vietnamese: "chúng ta", pinyin: "zánmen", note: "Số nhiều chúng ta" },
  { id: "p9", chinese: "你们", vietnamese: "các ngươi", pinyin: "nǐmen", note: "Số nhiều đối phương" },
  { id: "p10", chinese: "您们", vietnamese: "các ngài", pinyin: "nínmen", note: "Trang trọng số nhiều" },
  { id: "p11", chinese: "她们", vietnamese: "các nàng", pinyin: "tāmen", note: "Số nhiều phái nữ" },
  { id: "p12", chinese: "它们", vietnamese: "bọn họ", pinyin: "tāmen", note: "Vật/linh thú số nhiều" },
  { id: "p13", chinese: "诸位", vietnamese: "chư vị", pinyin: "zhūwèi", note: "Phát âm trang nghiêm" },
  { id: "p14", chinese: "同学", vietnamese: "bạn học", pinyin: "tóngxué", note: "Trường lớp bạn học" },
  { id: "p15", chinese: "同学们", vietnamese: "các bạn học", pinyin: "tóngxuémentóngxuémentóngxuémen", note: "Bạn học đám đông" },
  { id: "p16", chinese: "老师", vietnamese: "lão sư", pinyin: "lǎoshī", note: "Thầy dạy" },
  { id: "p17", chinese: "老师们", vietnamese: "các lão sư", pinyin: "lǎoshīmen", note: "Số nhiều lão sư" },
  { id: "p18", chinese: "哥", vietnamese: "ca", pinyin: "gē", note: "Huynh ca" },
  { id: "p19", chinese: "弟", vietnamese: "đệ", pinyin: "dì", note: "Đệ đệ" },
  { id: "p20", chinese: "叔", vietnamese: "thúc", pinyin: "shū", note: "Thúc thúc" },
  { id: "p21", chinese: "cữu", vietnamese: "cữu", pinyin: "jiù", note: "Cữu cữu" },
  { id: "p22", chinese: "姨", vietnamese: "di", pinyin: "yí", note: "Dì lóng" },
  { id: "p23", chinese: "阿姨", vietnamese: "a di", pinyin: "āyí", note: "Họ hàng a di" },
  { id: "p24", chinese: "奶奶", vietnamese: "bà bà", pinyin: "nǎinai", note: "Bà nội bà ngoại" },
  { id: "p25", chinese: "妈妈", vietnamese: "mụ mụ", pinyin: "māma", note: "Mẹ mụ mụ" },
  { id: "p26", chinese: "爷爷", vietnamese: "gia gia", pinyin: "yéye", note: "Gia gia tôn trọng" },
  { id: "p27", chinese: "老板", vietnamese: "lão bản", pinyin: "lǎobǎn", note: "Lão bản cửa hàng" },
  { id: "p28", chinese: "女士", vietnamese: "nữ sĩ", pinyin: "nǚshì", note: "Nữ sĩ trang nhã" },
  { id: "p29", chinese: "这女人", vietnamese: "nữ nhân này", pinyin: "zhè nǚrén", note: "Đệ tam nhân xưng" }
];

const DEFAULT_SETTINGS: TranslationSettings = {
  selectedModel: "gemini-3.5-flash",
  appColorScheme: "system",
  theme: "light",
  readerFont: "serif",
  readerFontSize: 17,
  readerLineHeight: 1.8,
  readerParagraphSpacing: 18,
  readerAlignment: "justify",
  readerLayout: "vertical",
  readerWidth: 92,
  readerPaddingX: 12,
  readerFillPercent: 90,
  readerSwipeDirection: "horizontal",
  apiKeys: {
    google: "",
    openai: "",
    claude: "",
    deepseek: "",
    qwen: "",
    custom: "",
  },
  temperature: 0.3,
  topK: 64,
  maxThreads: 1,
  enableCrossRotation: false,
  prompt1: "",
  prompt2: "",
  directClientTranslation: false,
  remoteServerUrl: "",
  readerAutoTranslateNextEnabled: false,
  readerAutoTranslateNextDelaySec: 30,
  translationSequentialChunks: false,
  translationChunkDictMaxChars: 2600,
  translationBudgetGuardEnabled: true,
  translationBudgetPerChapter: 100000,
  customProviderEnabled: false,
  customProviderLabel: "",
  customProviderApiBase: "",
  customProviderModel: "",
};

export default function App() {
  const [novels, setNovels] = useState<Novel[]>([]);
  const [activeNovelId, setActiveNovelId] = useState<string | undefined>(undefined);
  const [activeChapterId, setActiveChapterId] = useState<string | undefined>(undefined);
  const [dictItems, setDictItems] = useState<DictItem[]>([]);
  const [pronounMappings, setPronounMappings] = useState<PronounMapping[]>([]);
  const [settings, setSettings] = useState<TranslationSettings>(DEFAULT_SETTINGS);
  useAppColorScheme(settings.appColorScheme ?? "system");
  const [activeTab, setActiveTab] = useState<"home" | "library" | "editor" | "reader" | "dict" | "pronouns" | "settings" | "vfs">("home");
  const [isLoadingDb, setIsLoadingDb] = useState(true);

  // Background Batch translating states
  const [isTranslatingChapter, setIsTranslatingChapter] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);
  
  const [isTranslatingFullNovel, setIsTranslatingFullNovel] = useState(false);
  const [currentTranslatingIndex, setCurrentTranslatingIndex] = useState(-1);
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null);
  const [batchErrors, setBatchErrors] = useState<string | null>(null);
  const [showBatchTips, setShowBatchTips] = useState(false);

  // States for selected chapters range and manual checkboxes
  const [selectedChapterIds, setSelectedChapterIds] = useState<string[]>([]);
  /** Lab Dịch trên điện thoại: drawer chọn chương (nút «Danh sách») */
  const [labChapterDrawerOpen, setLabChapterDrawerOpen] = useState(false);
  const labActiveChapterRowRef = useRef<HTMLButtonElement | null>(null);
  const [rangeStart, setRangeStart] = useState<string>("");
  const [rangeEnd, setRangeEnd] = useState<string>("");
  const [chapterReadinessMap, setChapterReadinessMap] = useState<
    Record<string, ChapterReadiness>
  >({});
  const [chapterProgressMap, setChapterProgressMap] = useState<
    Record<string, PageTranslationProgress | null>
  >({});
  const [labDisplayTranslation, setLabDisplayTranslation] = useState("");
  const [labOpenFocus, setLabOpenFocus] = useState<LabOpenFocus | null>(null);
  const labFocusConsumedRef = useRef("");

  // Sync range inputs with chapter selections automatically
  useEffect(() => {
    if (!activeNovel) return;
    const s = parseInt(rangeStart, 10);
    const e = parseInt(rangeEnd, 10);
    if (!isNaN(s) && !isNaN(e) && s >= 1 && e >= s) {
      const matchedIds = activeNovel.chapters.filter((_, idx) => {
        const num = idx + 1;
        return num >= s && num <= e;
      }).map(ch => ch.id);
      setSelectedChapterIds(matchedIds);
    }
  }, [rangeStart, rangeEnd, activeNovelId]);

  // Reset selection states when active novel changes
  useEffect(() => {
    setSelectedChapterIds([]);
    setRangeStart("");
    setRangeEnd("");
  }, [activeNovelId]);

  const toggleChapterSelection = (chId: string) => {
    setSelectedChapterIds(prev => {
      if (prev.includes(chId)) {
        return prev.filter(id => id !== chId);
      } else {
        return [...prev, chId];
      }
    });
  };

  const handleSelectAllChapters = () => {
    if (!activeNovel) return;
    setSelectedChapterIds(activeNovel.chapters.map(ch => ch.id));
  };

  const handleDeselectAllChapters = () => {
    setSelectedChapterIds([]);
    setRangeStart("");
    setRangeEnd("");
  };

  // Modern alert & confirm state triggers (Fluent design dialogues)
  const [alertConfig, setAlertConfig] = useState<{ title: string; desc: string } | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<{ title: string; desc: string; onAgree: () => void; isDanger?: boolean } | null>(null);
  const [translationImportPrompt, setTranslationImportPrompt] = useState<{
    imported: Novel[];
    addOnlySummary: string;
    overwriteSummary: string;
  } | null>(null);
  const [showModelChangePopup, setShowModelChangePopup] = useState<{ newModelId: string } | null>(null);
  const [showModelResetDangerConfirm, setShowModelResetDangerConfirm] = useState<{
    newModelId: string;
    armed: boolean;
    phrase: string;
  } | null>(null);

  // Register last active novel ID tracker
  useEffect(() => {
    if (activeNovelId) {
      try {
        localStorage.setItem("last_active_novel_id", activeNovelId);
      } catch (e) {}
    }
  }, [activeNovelId]);

  // Load persistent DB on start
  useEffect(() => {
    const initDatabase = async () => {
      try {
        const storedNovels = await getValue("novels");
        if (storedNovels && Array.isArray(storedNovels)) {
          setNovels(storedNovels);
          if (storedNovels.length > 0) {
            let lastActiveNovelId = "";
            try {
              lastActiveNovelId = localStorage.getItem("last_active_novel_id") || "";
            } catch (e) {}

            const targetNovel = storedNovels.find(n => n.id === lastActiveNovelId) || storedNovels[0];
            setActiveNovelId(targetNovel.id);

            let storedChId = targetNovel.lastReadChapterId;
            if (!storedChId) {
              try {
                storedChId = localStorage.getItem(`last_read_chapter_${targetNovel.id}`) || localStorage.getItem(`last_read_progress_${targetNovel.id}`) || undefined;
              } catch (e) {}
            }

            const hasCh = targetNovel.chapters.some(c => c.id === storedChId);
            if (storedChId && hasCh) {
              setActiveChapterId(storedChId);
            } else if (targetNovel.chapters[0]) {
              setActiveChapterId(targetNovel.chapters[0].id);
            }
          }
        }

        const storedSettings = await getValue("settings");
        if (storedSettings) {
          setSettings({
            ...DEFAULT_SETTINGS,
            ...storedSettings,
            theme: normalizeReaderTheme(storedSettings.theme),
            selectedModel: resolveSelectedModel(storedSettings.selectedModel),
            appColorScheme:
              storedSettings.appColorScheme === "light" ||
              storedSettings.appColorScheme === "dark" ||
              storedSettings.appColorScheme === "system"
                ? storedSettings.appColorScheme
                : "system",
            chapterRuleStates: mergeChapterRuleStates(storedSettings.chapterRuleStates),
            readerWidth: Math.max(
              92,
              Math.min(96, Number(storedSettings.readerWidth) || DEFAULT_SETTINGS.readerWidth)
            ),
            readerFillPercent: Math.max(
              87,
              Math.min(100, Number(storedSettings.readerFillPercent) || DEFAULT_SETTINGS.readerFillPercent || 90)
            ),
          });
        }

        const storedDict = await getValue("dictItems");
        if (storedDict && Array.isArray(storedDict)) {
          setDictItems(storedDict);
        }

        const storedPronouns = await getValue("pronounMappings");
        if (storedPronouns && Array.isArray(storedPronouns)) {
          setPronounMappings(storedPronouns);
        } else {
          setPronounMappings(DEFAULT_PRONOUNS);
          await saveValue("pronounMappings", DEFAULT_PRONOUNS);
        }
      } catch (err) {
        console.error("Failed loading local IndexedDB layers relative workspace", err);
      } finally {
        setIsLoadingDb(false);
      }
    };
    initDatabase();
  }, []);

  const triggerAlert = (title: string, desc: string) => {
    setAlertConfig({ title, desc });
  };

  const triggerConfirm = (title: string, desc: string, onAgree: () => void, isDanger?: boolean) => {
    setConfirmConfig({ title, desc, onAgree, isDanger });
  };

  const activeNovel = novels.find(n => n.id === activeNovelId);
  const activeChapter = activeNovel?.chapters.find(ch => ch.id === activeChapterId);
  const isReaderImmersive = activeTab === "reader" && !!activeNovel;

  const isLabChapterOpen = activeTab === "editor" && !!activeChapterId;

  useEffect(() => {
    if (isReaderImmersive) {
      void applyReaderSystemChrome(settings.theme);
      return;
    }
    void applyAppSystemChrome(settings.appColorScheme ?? "system");
  }, [isReaderImmersive, isLabChapterOpen, activeTab, settings.theme, settings.appColorScheme]);

  useEffect(() => {
    if (isReaderImmersive) return;
    if ((settings.appColorScheme ?? "system") !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const refresh = () => void applyAppSystemChrome("system");
    mq.addEventListener("change", refresh);
    return () => mq.removeEventListener("change", refresh);
  }, [isReaderImmersive, settings.appColorScheme]);

  const getDictContextForActiveNovel = useCallback(
    () =>
      buildDictContextString({
        dictItems,
        pronounMappings,
        novelId: activeNovelId,
      }),
    [dictItems, pronounMappings, activeNovelId]
  );

  type BatchChapterTask = { chapter: Chapter; chapterIndex: number };
  type BatchChapterResult = { ok: true } | { ok: false; title: string; message: string };

  const resolveChapterTranslationForBatch = async (
    ch: Chapter,
    dictContext: string
  ): Promise<ChapterTranslationResult> => {
    const { translateChapter } = await loadChapterTranslationEngine();
    return translateChapter({
      sourceText: ch.sourceText,
      chapterTitle: ch.title,
      model: settings.selectedModel,
      temperature: settings.temperature,
      apiKeys: settings.apiKeys,
      prompt1: settings.prompt1,
      prompt2: settings.prompt2,
      dictContext,
      settings,
      priority: "normal",
    });
  };

  const buildBudgetSummaryText = useCallback(
    (opts: {
      chapterTitle: string;
      estimatedTotalTokens: number;
      chunkCount: number;
      budget: number;
      warnings: string[];
    }): string => {
      const { chapterTitle, estimatedTotalTokens, chunkCount, budget, warnings } = opts;
      const over = estimatedTotalTokens - budget;
      const warningText = warnings.length
        ? `\n\nGợi ý tối ưu:\n${warnings.map((w) => `• ${w}`).join("\n")}`
        : "";
      return (
        `Chương "${chapterTitle}" được ước tính khoảng ${estimatedTotalTokens.toLocaleString("vi-VN")} token ` +
        `(${chunkCount} đoạn), vượt ngưỡng ${budget.toLocaleString("vi-VN")} token/chương khoảng ${over.toLocaleString("vi-VN")} token.\n` +
        `Bạn có muốn tiếp tục dịch không?${warningText}`
      );
    },
    []
  );

  const resolveChapterBudgetEstimate = useCallback(
    async (chapter: Chapter, dictContext: string) => {
      const { estimateChapterTokenBudget } = await loadChapterTranslationEngine();
      return estimateChapterTokenBudget({
        sourceText: chapter.sourceText,
        chapterTitle: chapter.title,
        model: settings.selectedModel,
        prompt1: settings.prompt1,
        prompt2: settings.prompt2,
        dictContext,
        settings,
      });
    },
    [settings]
  );

  const shouldWarnTokenBudget = useCallback(() => {
    if (!settings.translationBudgetGuardEnabled) return false;
    const budget = Number(settings.translationBudgetPerChapter ?? 0);
    return Number.isFinite(budget) && budget > 0;
  }, [settings.translationBudgetGuardEnabled, settings.translationBudgetPerChapter]);


  const runBatchChapterTranslation = async (tasks: BatchChapterTask[]) => {
    if (!activeNovel || tasks.length === 0) {
      return { succeeded: 0, failed: 0, failures: [] as { title: string; message: string }[] };
    }

    const maxThreads = clampThreadCount(settings.maxThreads, 5);
    const dictContext = getDictContextForActiveNovel();
    const novelId = activeNovel.id;

    const novelCopy: Novel = {
      ...activeNovel,
      chapters: activeNovel.chapters.map((c) => ({ ...c })),
    };

    let completed = 0;
    setBatchProgress({ completed: 0, total: tasks.length });

    const persistNovel = () => {
      setNovels((prev) => {
        const updated = prev.map((n) =>
          n.id === novelId
            ? { ...n, chapters: novelCopy.chapters.map((c) => ({ ...c })) }
            : n
        );
        saveValue("novels", updated).catch((err) => {
          console.error("Lỗi khi lưu tiến trình dịch:", err);
        });
        return updated;
      });
    };

    const results = await mapWithConcurrency<BatchChapterTask, BatchChapterResult>(
      tasks,
      maxThreads,
      async (task) => {
        const chRef = novelCopy.chapters.find((c) => c.id === task.chapter.id);
        if (!chRef) {
          return { ok: false, title: task.chapter.title, message: "Không tìm thấy chương trong bản sao truyện." };
        }

        try {
          const translation = await resolveChapterTranslationForBatch(chRef, dictContext);
          chRef.translatedText = translation.translatedText;
          chRef.translatedTitle = translation.translatedTitle;
          await deleteValue(`page_trans_${task.chapter.id}`).catch(() => {});
          return { ok: true };
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          return { ok: false, title: task.chapter.title, message };
        }
      },
      {
        onItemStart: (_task, _index) => {
          setCurrentTranslatingIndex(_task.chapterIndex);
        },
        onItemComplete: () => {
          completed += 1;
          setBatchProgress({ completed, total: tasks.length });
          persistNovel();
        },
      }
    );

    const failures = results
      .filter((r): r is { ok: false; title: string; message: string } => !r.ok)
      .map((r) => ({ title: r.title, message: r.message }));

    return {
      succeeded: tasks.length - failures.length,
      failed: failures.length,
      failures,
    };
  };

  const formatBatchResultMessage = (
    label: string,
    succeeded: number,
    total: number,
    failures: { title: string; message: string }[]
  ): string => {
    if (failures.length === 0) {
      return `Đã dịch xong ${succeeded}/${total} ${label}.`;
    }
    const sample = failures
      .slice(0, 3)
      .map((f) => `• ${f.title}: ${f.message}`)
      .join("\n");
    const more = failures.length > 3 ? `\n... và ${failures.length - 3} chương lỗi khác.` : "";
    return `Hoàn thành ${succeeded}/${total} ${label}.\n${failures.length} chương lỗi:\n${sample}${more}`;
  };

  // Dịch các chương đã tích chọn — song song theo maxThreads
  const handleTranslateSelectedChapters = async () => {
    if (!activeNovel) return;
    if (selectedChapterIds.length === 0) {
      triggerAlert("Biên dịch thông báo", "Vui lòng tích chọn ít nhất một chương hoặc nhập khoảng để bắt đầu dịch.");
      return;
    }

    const tasks: BatchChapterTask[] = activeNovel.chapters
      .map((chapter, chapterIndex) => ({ chapter, chapterIndex }))
      .filter((t) => selectedChapterIds.includes(t.chapter.id));

    const threadCount = clampThreadCount(settings.maxThreads, 5);
    const executeBatch = async () => {
      setIsTranslatingFullNovel(true);
      setBatchErrors(null);

      try {
        const { succeeded, failed, failures } = await runBatchChapterTranslation(tasks);

        if (failed > 0) {
          const summary = formatBatchResultMessage("chương đã chọn", succeeded, tasks.length, failures);
          setBatchErrors(summary);
          triggerAlert(
            failed === tasks.length ? "Lỗi dịch cụm chương" : "Biên dịch một phần",
            summary
          );
        } else {
          triggerAlert(
            "Biên dịch cụm thành công",
            `Đã dịch ${succeeded} chương (${threadCount} luồng song song).`
          );
        }
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        setBatchErrors(message);
        triggerAlert("Lỗi dịch cụm chương", message);
      } finally {
        setIsTranslatingFullNovel(false);
        setCurrentTranslatingIndex(-1);
        setBatchProgress(null);
      }
    };

    if (shouldWarnTokenBudget()) {
      try {
        const budget = Number(settings.translationBudgetPerChapter ?? 0);
        const dictContext = getDictContextForActiveNovel();
        const estimates = await Promise.all(
          tasks.map((task) => resolveChapterBudgetEstimate(task.chapter, dictContext))
        );
        const overItems = estimates
          .map((estimate, index) => ({ estimate, chapter: tasks[index].chapter }))
          .filter((item) => item.estimate.estimatedTotalTokens > budget);
        if (overItems.length > 0) {
          const top = overItems
            .slice(0, 3)
            .map(
              (item) =>
                `• ${item.chapter.title}: ~${item.estimate.estimatedTotalTokens.toLocaleString("vi-VN")} token (${item.estimate.chunkCount} đoạn)`
            )
            .join("\n");
          const more = overItems.length > 3 ? `\n... và ${overItems.length - 3} chương khác vượt ngưỡng.` : "";
          triggerConfirm(
            "Cảnh báo ngân sách token",
            `Có ${overItems.length}/${tasks.length} chương vượt ngưỡng ${budget.toLocaleString("vi-VN")} token/chương:\n${top}${more}\n\nBạn vẫn muốn tiếp tục dịch hàng loạt?`,
            () => {
              void executeBatch();
            },
            true
          );
          return;
        }
      } catch (err) {
        console.warn("Không ước tính được ngân sách batch:", err);
      }
    }

    await executeBatch();
  };

  // Single chapter translation call handler
  const handleTranslateActiveChapter = async () => {
    if (!activeNovel || !activeChapterId) return;
    const activeCh = activeNovel.chapters.find(ch => ch.id === activeChapterId);
    if (!activeCh) return;

    const isTranslated = activeCh.translatedText && activeCh.translatedText.trim().length > 0;
    if (isTranslated) {
      triggerConfirm(
        "Dịch Lại Chương Hiện Tại",
        `Chương "${activeCh.title}" đã có bản dịch. Bạn có muốn thực hiện dịch lại chương này bằng AI không? Thao tác này sẽ làm mới lại bản dịch hiện tại và tiêu tốn thêm token AI.`,
        async () => {
          await runActiveChapterTranslation(activeCh);
        }
      );
    } else {
      await runActiveChapterTranslation(activeCh);
    }
  };

  const runActiveChapterTranslation = async (activeCh: Chapter, skipBudgetCheck = false) => {
    if (!skipBudgetCheck && shouldWarnTokenBudget()) {
      try {
        const budget = Number(settings.translationBudgetPerChapter ?? 0);
        const dictContext = getDictContextForActiveNovel();
        const estimate = await resolveChapterBudgetEstimate(activeCh, dictContext);
        if (estimate.estimatedTotalTokens > budget) {
          triggerConfirm(
            "Cảnh báo ngân sách token",
            buildBudgetSummaryText({
              chapterTitle: activeCh.title,
              estimatedTotalTokens: estimate.estimatedTotalTokens,
              chunkCount: estimate.chunkCount,
              budget,
              warnings: estimate.warnings,
            }),
            () => {
              void runActiveChapterTranslation(activeCh, true);
            },
            true
          );
          return;
        }
      } catch (err) {
        console.warn("Không ước tính được ngân sách token:", err);
      }
    }

    setIsTranslatingChapter(true);
    setTranslationError(null);

    try {
      const dictContext = getDictContextForActiveNovel();
      const { translateChapter } = await loadChapterTranslationEngine();
      const translation = await translateChapter({
        sourceText: activeCh.sourceText,
        chapterTitle: activeCh.title,
        model: settings.selectedModel,
        temperature: settings.temperature,
        apiKeys: settings.apiKeys,
        prompt1: settings.prompt1,
        prompt2: settings.prompt2,
        dictContext,
        settings,
        priority: "high",
      });

      await handleUpdateTranslation(translation);
      if (activeNovel) {
        maybeQueueLabAutoTranslateNextAfterLab({
          novel: activeNovel,
          sourceChapter: activeCh,
          settings,
          dictItems,
          pronounMappings,
          onChapterTranslated: async (chapterId, result) => {
            await persistChapterTranslation(activeNovel.id, chapterId, result);
          },
        });
      }
      triggerAlert("Dịch chương xong!", `Đã dịch xong hoàn thiện chương "${activeCh.title}" thỏa mãn từ ngữ quy chuẩn!`);
    } catch (err: any) {
      setTranslationError(err.message);
      triggerAlert("Cảnh báo lỗi dịch", err.message);
    } finally {
      setIsTranslatingChapter(false);
    }
  };

  // Dịch toàn bộ chương chưa có bản dịch — song song theo maxThreads
  const handleTranslateFullNovel = async () => {
    if (!activeNovel) return;

    const uncompleted = activeNovel.chapters.filter((ch) => !ch.translatedText?.trim());
    if (uncompleted.length === 0) {
      triggerAlert("Biên dịch thông báo", "Hoàn hảo! Toàn bộ các chương của tác phẩm đã có bản dịch dịch thuật.");
      return;
    }

    const threadCount = clampThreadCount(settings.maxThreads, 5);
    let budgetSuffix = "";
    if (shouldWarnTokenBudget()) {
      try {
        const budget = Number(settings.translationBudgetPerChapter ?? 0);
        const dictContext = getDictContextForActiveNovel();
        const estimates = await Promise.all(
          uncompleted.map((chapter) => resolveChapterBudgetEstimate(chapter, dictContext))
        );
        const overCount = estimates.filter((item) => item.estimatedTotalTokens > budget).length;
        if (overCount > 0) {
          budgetSuffix =
            `\n\nCảnh báo ngân sách: ${overCount}/${uncompleted.length} chương ước tính vượt ${budget.toLocaleString("vi-VN")} token/chương.`;
        }
      } catch (err) {
        console.warn("Không ước tính được ngân sách dịch toàn bộ:", err);
      }
    }

    triggerConfirm(
      "Xác nhận dịch tự động toàn bộ truyện",
      `Bạn có chắc chắn muốn biên dịch tự động ${uncompleted.length} chương chưa dịch của "${activeNovel.title}" không?\n\nSẽ chạy tối đa ${threadCount} chương song song (theo Cấu Hình → Số chương dịch song song). Thao tác này có thể tiêu tốn nhiều token AI.${budgetSuffix}`,
      async () => {
        const tasks: BatchChapterTask[] = activeNovel.chapters
          .map((chapter, chapterIndex) => ({ chapter, chapterIndex }))
          .filter((t) => !t.chapter.translatedText?.trim());

        setIsTranslatingFullNovel(true);
        setBatchErrors(null);

        try {
          const { succeeded, failed, failures } = await runBatchChapterTranslation(tasks);

          if (failed > 0) {
            const summary = formatBatchResultMessage("chương chưa dịch", succeeded, tasks.length, failures);
            setBatchErrors(summary);
            triggerAlert(
              failed === tasks.length ? "Trục trặc dịch tự động" : "Biên soạn một phần",
              summary
            );
          } else {
            triggerAlert(
              "Biên soạn hoàn tất",
              `Đã hoàn thành dịch ${succeeded} chương của "${activeNovel.title}" (${threadCount} luồng).`
            );
          }
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : String(err);
          setBatchErrors(message);
          triggerAlert("Trục trặc dịch tự động", message);
        } finally {
          setIsTranslatingFullNovel(false);
          setCurrentTranslatingIndex(-1);
          setBatchProgress(null);
        }
      }
    );
  };

  const handleChaptersLoaded = async (
    title: string,
    chapters: Chapter[],
    rawText?: string,
    chapterHeaderPattern?: string
  ) => {
    const newNovel: Novel = {
      id: Date.now().toString(),
      title,
      author: "Nguyên tác",
      createdAt: new Date().toLocaleDateString("vi-VN"),
      chapters,
      rawTextSource: rawText,
      chapterHeaderPattern: chapterHeaderPattern?.trim() || undefined,
    };

    const updated = [newNovel, ...novels];
    setNovels(updated);
    await saveValue("novels", updated);
    setActiveNovelId(newNovel.id);
    if (chapters.length > 0) {
      setActiveChapterId(chapters[0].id);
    }
    setActiveTab("editor");
  };

  const handleDeleteNovel = async (novelId: string, deleteMode: "library_only" | "complete" = "complete") => {
    let updated: Novel[] = [];
    if (deleteMode === "library_only") {
      updated = novels.map((n) => n.id === novelId ? { ...n, deletedFromLibrary: true } : n);
    } else {
      const targetNovel = novels.find((n) => n.id === novelId);
      if (targetNovel) {
        // Clear page translation caches for all chapters
        for (const ch of targetNovel.chapters) {
          await deleteValue(`page_trans_${ch.id}`).catch(() => {});
        }
      }
      updated = novels.filter((n) => n.id !== novelId);
    }

    setNovels(updated);
    await saveValue("novels", updated);

    const activeList = updated.filter((n) => !n.deletedFromLibrary);
    if (activeNovelId === novelId) {
      if (activeList.length > 0) {
        setActiveNovelId(activeList[0].id);
        setActiveChapterId(activeList[0].chapters[0]?.id);
      } else {
        setActiveNovelId(undefined);
        setActiveChapterId(undefined);
      }
    }
  };

  const persistChapterTranslation = async (
    novelId: string,
    chapterId: string,
    payload: { translatedText: string; translatedTitle?: string }
  ) => {
    await deleteValue(`page_trans_${chapterId}`).catch(() => {});

    let updatedNovels: Novel[] = [];
    setNovels((prev) => {
      updatedNovels = prev.map((novel) => {
        if (novel.id !== novelId) return novel;
        return {
          ...novel,
          chapters: novel.chapters.map((ch) =>
            ch.id === chapterId
              ? {
                  ...ch,
                  translatedText: payload.translatedText,
                  translatedTitle:
                    payload.translatedTitle !== undefined
                      ? payload.translatedTitle
                      : ch.translatedTitle,
                }
              : ch
          ),
        };
      });
      return updatedNovels;
    });
    if (updatedNovels.length > 0) {
      await saveValue("novels", updatedNovels);
    }
    void refreshChapterReadiness();
  };

  const handleUpdateTranslation = async (update: ChapterTranslationResult | string) => {
    if (!activeNovel || !activeChapterId) return;
    const payload =
      typeof update === "string"
        ? { translatedText: update }
        : {
            translatedText: update.translatedText,
            translatedTitle: update.translatedTitle,
          };
    await persistChapterTranslation(activeNovel.id, activeChapterId, payload);
  };

  const handleReaderChapterTranslated = useCallback(
    async (chapterId: string, result: ChapterTranslationResult) => {
      if (!activeNovelId) return;
      await persistChapterTranslation(activeNovelId, chapterId, result);
    },
    [activeNovelId]
  );

  const scrollComparePanelToTop = () => {
    requestAnimationFrame(() => {
      const stage = document.getElementById("compare-scroll-stage");
      if (stage) stage.scrollTop = 0;
    });
  };

  const handleNavigateChapter = async (direction: "prev" | "next") => {
    if (!activeNovel || !activeChapterId) return;
    const currentIdx = activeNovel.chapters.findIndex((ch) => ch.id === activeChapterId);
    if (currentIdx === -1) return;

    const targetIdx = direction === "prev" ? currentIdx - 1 : currentIdx + 1;
    if (targetIdx < 0 || targetIdx >= activeNovel.chapters.length) return;

    const targetCh = activeNovel.chapters[targetIdx];

    // Thay thế hoàn toàn nội dung đối chiếu — không chồng chương
    setActiveChapterId(targetCh.id);
    setTranslationError(null);
    scrollComparePanelToTop();
    try {
      localStorage.setItem(`last_editor_chapter_${activeNovel.id}`, targetCh.id);
    } catch {
      /* ignore */
    }

    const isTranslated = targetCh.translatedText && targetCh.translatedText.trim().length > 0;
    if (isTranslated) {
      // Already translated before, so load from local DB / state, no AI API call!
      return;
    }

    setTranslationError(
      "Chương chưa có bản dịch Lab. Bấm «Dịch chương» để dịch (1 request/chương ngắn; chương dài tự chia khối dòng)."
    );
  };

  const handleUpdateReadingProgress = useCallback(async (novelId: string, chapterId: string, pageIndex?: number, mode?: "scroll" | "page") => {
    setNovels((prevNovels) => {
      const updated = prevNovels.map((novel) => {
        if (novel.id === novelId) {
          const activeChapIdx = novel.chapters.findIndex((c) => c.id === chapterId);
          const percentDone = novel.chapters.length
            ? Math.round(((activeChapIdx + 1) / novel.chapters.length) * 100)
            : 0;
          return {
            ...novel,
            lastReadChapterId: chapterId,
            lastReadPageIndex: pageIndex,
            lastReadMode: mode,
            lastReadPercentage: percentDone,
          };
        }
        return novel;
      });
      // Save updated novels to db without blocking state computation
      saveValue("novels", updated).catch((err) => {
        console.error("Lỗi khi lưu tiến trình đọc:", err);
      });
      return updated;
    });
  }, []);

  // Dict handlers
  const handleAddDictWord = async (chinese: string, vietnamese: string, category: DictItem["category"], novelId?: string) => {
    const newItem: DictItem = {
      id: Date.now().toString(),
      chinese,
      vietnamese,
      category,
      novelId
    };
    const updated = [newItem, ...dictItems];
    setDictItems(updated);
    await saveValue("dictItems", updated);
  };

  const handleUpdateDictWord = async (id: string, chinese: string, vietnamese: string, category: DictItem["category"], novelId?: string) => {
    const updated = dictItems.map((item) =>
      item.id === id ? { ...item, chinese, vietnamese, category, novelId } : item
    );
    setDictItems(updated);
    await saveValue("dictItems", updated);
  };

  const handleDeleteDictWord = async (id: string) => {
    const updated = dictItems.filter((item) => item.id !== id);
    setDictItems(updated);
    await saveValue("dictItems", updated);
  };

  const handleClearDict = async () => {
    setDictItems([]);
    await saveValue("dictItems", []);
  };

  const handleLoadDictPreset = async (items: Record<string, string>, category: DictItem["category"] = "custom") => {
    const newItems: DictItem[] = Object.entries(items).map(([zh, vi], index) => ({
      id: `${Date.now()}_${index}`,
      chinese: zh,
      vietnamese: vi,
      category,
      novelId: activeNovelId
    }));
    const updated = [...newItems, ...dictItems];
    setDictItems(updated);
    await saveValue("dictItems", updated);
  };

  const handleImportDictTxt = async (
    items: Record<string, string>,
    scope: "chung" | "rieng"
  ): Promise<{ added: { chinese: string; vietnamese: string }[]; skipped: number }> => {
    const scopeNovelId = scope === "rieng" ? activeNovelId : undefined;
    if (scope === "rieng" && !scopeNovelId) return { added: [], skipped: 0 };

    const added: { chinese: string; vietnamese: string }[] = [];
    let skipped = 0;
    const newItems: DictItem[] = [];

    for (const [zhRaw, viRaw] of Object.entries(items)) {
      const chinese = zhRaw.trim();
      const vietnamese = viRaw.trim();
      if (!chinese || !vietnamese) continue;

      if (!isNovelDictImportEligible(chinese, vietnamese)) {
        skipped += 1;
        continue;
      }

      const exists = dictItems.some((it) => {
        if (it.chinese.trim() !== chinese) return false;
        if (scope === "rieng") return it.novelId === scopeNovelId;
        return !it.novelId;
      });
      if (exists) {
        skipped += 1;
        continue;
      }

      newItems.push({
        id: `${Date.now()}_dict_${scope}_${newItems.length}_${Math.random().toString(36).slice(2, 6)}`,
        chinese,
        vietnamese,
        category: "name",
        novelId: scopeNovelId,
      });
      added.push({ chinese, vietnamese });
    }

    if (newItems.length > 0) {
      const updated = [...newItems, ...dictItems];
      setDictItems(updated);
      await saveValue("dictItems", updated);
    }

    return { added, skipped };
  };

  const handleApplyNovelDictReplacements = async (
    novelId: string,
    updates: { chapterId: string; translatedText: string }[]
  ) => {
    if (!updates.length) return;

    let updatedNovels: Novel[] = [];
    setNovels((prev) => {
      updatedNovels = prev.map((novel) => {
        if (novel.id !== novelId) return novel;
        const byId = new Map(updates.map((u) => [u.chapterId, u.translatedText]));
        return {
          ...novel,
          chapters: novel.chapters.map((ch) =>
            byId.has(ch.id) ? { ...ch, translatedText: byId.get(ch.id)! } : ch
          ),
        };
      });
      return updatedNovels;
    });

    if (updatedNovels.length > 0) {
      await saveValue("novels", updatedNovels);
    }
    void refreshChapterReadiness();
  };

  // Pronoun handlers
  const handleAddPronoun = async (chinese: string, vietnamese: string, pinyin: string, note?: string) => {
    const newItem: PronounMapping = {
      id: Date.now().toString(),
      chinese,
      vietnamese,
      pinyin,
      note
    };
    const updated = [newItem, ...pronounMappings];
    setPronounMappings(updated);
    await saveValue("pronounMappings", updated);
  };

  const handleDeletePronoun = async (id: string) => {
    const updated = pronounMappings.filter((item) => item.id !== id);
    setPronounMappings(updated);
    await saveValue("pronounMappings", updated);
  };

  const handleResetDefaultPronouns = async () => {
    setPronounMappings(DEFAULT_PRONOUNS);
    await saveValue("pronounMappings", DEFAULT_PRONOUNS);
  };

  // Settings handlers
  const handleUpdateApiKey = async (platform: keyof Required<TranslationSettings>["apiKeys"], value: string) => {
    const updatedKeys = {
      ...(settings.apiKeys || {}),
      [platform]: value
    };
    const updatedSettings = {
      ...settings,
      apiKeys: updatedKeys
    };
    setSettings(updatedSettings);
    await saveValue("settings", updatedSettings);
  };

  const handleSelectModel = async (modelId: string) => {
    if (modelId === settings.selectedModel) return;

    // Check if there are any translated chapters/pages to ask about
    const hasAnyTranslation = novels.some(novel =>
      novel.chapters.some(ch =>
        (ch.translatedText && ch.translatedText.trim().length > 0)
      )
    );

    if (hasAnyTranslation) {
      setShowModelChangePopup({ newModelId: modelId });
    } else {
      // Just select and save directly if nothing has been translated yet
      const updatedSettings = {
        ...settings,
        selectedModel: modelId
      };
      setSettings(updatedSettings);
      await saveValue("settings", updatedSettings);
    }
  };

  const handleApplyModelChange = async (modelId: string, strategy: "retranslate_all" | "keep_existing") => {
    const updatedSettings = {
      ...settings,
      selectedModel: modelId
    };
    setSettings(updatedSettings);
    await saveValue("settings", updatedSettings);

    if (strategy === "retranslate_all") {
      // Reset translated chapters for all novels
      const updatedNovels = novels.map(novel => {
        const resetChapters = novel.chapters.map(ch => ({
          ...ch,
          translatedTitle: "",
          translatedText: "",
        }));
        return {
          ...novel,
          chapters: resetChapters
        };
      });

      // Clear cached pages in indexedDB
      for (const novel of novels) {
        for (const ch of novel.chapters) {
          await deleteValue(`page_trans_${ch.id}`).catch(() => {});
        }
      }

      setNovels(updatedNovels);
      await saveValue("novels", updatedNovels);
      triggerAlert(
        "Thay đổi thành công", 
        "Đã thiết lập model mới và dọn dẹp các bản dịch cũ. Các chương sẽ được tự động dịch mới hoàn chỉnh bằng model mới khi bắt đầu biên dịch hoặc đọc."
      );
    } else {
      triggerAlert(
        "Thay đổi thành công", 
        "Đã áp dụng model mới cho các chương, trang chưa được dịch. Bản dịch cũ vẫn được bảo lưu trọn vẹn."
      );
    }

    setShowModelChangePopup(null);
  };

  const handleUpdateSetting = async (key: keyof TranslationSettings, val: any) => {
    const updatedSettings = {
      ...settings,
      [key]: val
    };
    setSettings(updatedSettings);
    await saveValue("settings", updatedSettings);
  };

  const applyBatchStrategyPreset = (mode: "safe" | "balanced" | "fast") => {
    if (mode === "safe") {
      void handleUpdateSetting("maxThreads", 1);
      void handleUpdateSetting("translationSequentialChunks", false);
      return;
    }
    if (mode === "balanced") {
      void handleUpdateSetting("maxThreads", 2);
      void handleUpdateSetting("translationSequentialChunks", false);
      return;
    }
    void handleUpdateSetting("maxThreads", 3);
    void handleUpdateSetting("translationSequentialChunks", false);
  };

  const handleUpdateReaderSettings = async (newSettings: TranslationSettings) => {
    setSettings(newSettings);
    await saveValue("settings", newSettings);
  };

  const applyTranslationBackupImport = useCallback(
    async (imported: Novel[], mode: "overwrite" | "add_only") => {
      try {
        const { mergeTranslationBackup, formatTranslationBackupMergeSummary } =
          await loadTranslationBackupUtils();
        const { novels: merged, stats, clearedPageCacheChapterIds } = mergeTranslationBackup(
          novels,
          imported,
          { mode }
        );

        for (const chapterId of clearedPageCacheChapterIds) {
          await deleteValue(`page_trans_${chapterId}`).catch(() => {});
        }

        setNovels(merged);
        await saveValue("novels", merged);
        triggerAlert("Nạp data dịch xong", formatTranslationBackupMergeSummary(stats));
      } catch (err) {
        triggerAlert("Lỗi khi gộp dữ liệu", err instanceof Error ? err.message : String(err));
      }
    },
    [novels, triggerAlert]
  );

  const handleImportTranslationBackup = useCallback(async (file: File) => {
    try {
      const {
        parseTranslationBackupZip,
        previewTranslationBackupMerge,
        formatTranslationBackupMergeSummary,
      } = await loadTranslationBackupUtils();
      const parsed = await parseTranslationBackupZip(file);
      setTranslationImportPrompt({
        imported: parsed.novels,
        addOnlySummary: formatTranslationBackupMergeSummary(
          previewTranslationBackupMerge(novels, parsed.novels, {
            mode: "add_only",
          })
        ),
        overwriteSummary: formatTranslationBackupMergeSummary(
          previewTranslationBackupMerge(novels, parsed.novels, {
            mode: "overwrite",
          })
        ),
      });
    } catch (err) {
      triggerAlert("Không đọc được file", err instanceof Error ? err.message : String(err));
    }
  }, [novels, triggerAlert]);

  const refreshChapterReadiness = useCallback(async () => {
    if (!activeNovel) return;
    const map = await buildChapterReadinessMap(activeNovel.chapters);
    setChapterReadinessMap(map);
    const progressPairs = await Promise.all(
      activeNovel.chapters.map(async (ch) => {
        const readiness = map[ch.id];
        if (readiness === "reader_partial" || readiness === "reader_pages") {
          return [ch.id, await getPageTranslationProgress(ch.id)] as const;
        }
        return [ch.id, null] as const;
      })
    );
    setChapterProgressMap(Object.fromEntries(progressPairs));
  }, [activeNovel]);

  const openReaderAtChapter = useCallback(
    (chapterId: string, pageIndex?: number) => {
      if (!activeNovelId) return;
      let page = pageIndex ?? 0;
      if (pageIndex === undefined) {
        try {
          const savedCh = localStorage.getItem(`last_read_chapter_${activeNovelId}`);
          const savedPage = localStorage.getItem(`last_read_page_${activeNovelId}`);
          if (savedCh === chapterId && savedPage !== null) {
            const parsed = Number(savedPage);
            if (!Number.isNaN(parsed) && parsed >= 0) page = parsed;
          }
        } catch {
          /* ignore */
        }
      }
      syncChapterAcrossWorkspaces(activeNovelId, chapterId, page);
      setActiveChapterId(chapterId);
      setActiveTab("reader");
      void handleUpdateReadingProgress(activeNovelId, chapterId, page, "page");
    },
    [activeNovelId, handleUpdateReadingProgress]
  );

  const openLabAtChapter = useCallback(
    (chapterId: string, focus?: LabOpenFocus, pageIndex = 0) => {
      if (!activeNovelId) return;
      syncChapterAcrossWorkspaces(activeNovelId, chapterId, pageIndex);
      if (focus) {
        persistLabOpenFocus(activeNovelId, focus);
        labFocusConsumedRef.current = "";
      }
      setActiveChapterId(chapterId);
      setActiveTab("editor");
    },
    [activeNovelId]
  );

  const handleReaderChapterSelect = useCallback(
    (chapterId: string) => {
      if (!activeNovelId) return;
      syncChapterAcrossWorkspaces(activeNovelId, chapterId, 0);
      setActiveChapterId(chapterId);
      void handleUpdateReadingProgress(activeNovelId, chapterId, 0, "page");
    },
    [activeNovelId, handleUpdateReadingProgress]
  );

  // Lab Dịch: nhớ chương gần nhất
  useEffect(() => {
    if (activeTab === "editor" && activeNovelId && activeChapterId) {
      try {
        localStorage.setItem(`last_editor_chapter_${activeNovelId}`, activeChapterId);
      } catch {
        /* ignore */
      }
    }
  }, [activeTab, activeNovelId, activeChapterId]);

  useEffect(() => {
    if (activeTab === "editor" && activeNovel) {
      void refreshChapterReadiness();
    }
  }, [activeTab, activeNovel, novels, refreshChapterReadiness]);

  useEffect(() => {
    if (!labChapterDrawerOpen || !activeChapterId) return;
    const frame = requestAnimationFrame(() => {
      labActiveChapterRowRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [labChapterDrawerOpen, activeChapterId]);

  useEffect(() => {
    if (activeTab !== "editor" || !activeNovelId || !activeChapterId) return;
    const key = `${activeNovelId}:${activeChapterId}`;
    if (labFocusConsumedRef.current === key) return;
    labFocusConsumedRef.current = key;
    const focus = consumeLabOpenFocus(activeNovelId);
    setLabOpenFocus(focus);
  }, [activeTab, activeNovelId, activeChapterId]);

  // Lab Dịch: chỉ hiển thị translatedText (nguồn song ngữ chuẩn)
  useEffect(() => {
    if (!activeChapter) {
      setLabDisplayTranslation("");
      return;
    }
    setLabDisplayTranslation(activeChapter.translatedText?.trim() ? activeChapter.translatedText : "");
  }, [activeChapter?.id, activeChapter?.translatedText]);

  useEffect(() => {
    if (activeTab !== "editor" || !activeNovel) return;
    if (activeChapterId) return;

    let storedChId = activeNovel.lastReadChapterId;
    try {
      if (!storedChId) {
        storedChId =
          localStorage.getItem(`last_editor_chapter_${activeNovel.id}`) ||
          localStorage.getItem(`last_read_chapter_${activeNovel.id}`) ||
          undefined;
      }
    } catch {
      /* ignore */
    }

    const hasStored = !!(storedChId && activeNovel.chapters.some((c) => c.id === storedChId));
    if (hasStored && storedChId) {
      setActiveChapterId(storedChId);
    } else if (activeNovel.chapters[0]) {
      setActiveChapterId(activeNovel.chapters[0].id);
    }
  }, [activeTab, activeNovel?.id, activeChapterId]);

  // Mở Phòng Đọc Sách: chỉ tự chọn chương khi chưa có chương nào — không ghi đè khi user chọn từ menu chương
  useEffect(() => {
    if (activeTab !== "reader" || !activeNovel) return;
    if (activeChapterId) return;

    let storedChId = activeNovel.lastReadChapterId;
    if (!storedChId) {
      try {
        storedChId =
          localStorage.getItem(`last_read_chapter_${activeNovel.id}`) ||
          localStorage.getItem(`last_read_progress_${activeNovel.id}`) ||
          undefined;
      } catch {
        /* ignore */
      }
    }

    const hasStored = !!(storedChId && activeNovel.chapters.some((c) => c.id === storedChId));
    if (hasStored && storedChId) {
      setActiveChapterId(storedChId);
    } else if (activeNovel.chapters[0]) {
      setActiveChapterId(activeNovel.chapters[0].id);
    }
  }, [activeTab, activeNovel?.id, activeChapterId]);

  // Tránh thoát app trên WebView của điện thoại khi bấm Back vật lý ở chế độ chi tiết hoặc quay lại home
  useEffect(() => {
    const handlePopState = () => {
      if (isReaderImmersive) {
        setActiveTab("home");
      } else if (activeChapterId) {
        setActiveChapterId(undefined);
        if (activeTab === "editor") {
          setLabChapterDrawerOpen(true);
        }
      } else if (activeTab !== "home") {
        if (activeTab === "editor") {
          setLabChapterDrawerOpen(true);
          return;
        }
        setActiveTab("home");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [activeChapterId, activeTab, isReaderImmersive]);

  // Một mục history cho chế độ chi tiết — đổi chương trong Lab Dịch dùng replaceState (tránh chồng màn hình khi cuộn)
  useEffect(() => {
    const isDetail =
      isReaderImmersive || !!(activeChapterId && activeTab === "editor");
    if (isDetail) {
      if (window.history.state?.isDetail) {
        window.history.replaceState({ isDetail: true }, "");
      } else {
        window.history.pushState({ isDetail: true }, "");
      }
    } else if (activeTab !== "home") {
      if (window.history.state?.isTab) {
        window.history.replaceState({ isTab: true }, "");
      } else {
        window.history.pushState({ isTab: true }, "");
      }
    }
  }, [activeChapterId, activeTab, isReaderImmersive]);

  const isDetailMode =
    isReaderImmersive || !!(activeChapterId && activeTab === "editor");

  /** Lab Dịch: quay danh sách chương — không dùng history.back (tránh thoát ra màn hình gốc) */
  const handleLabChapterBack = () => {
    setActiveChapterId(undefined);
    setTranslationError(null);
    setLabChapterDrawerOpen(true);
    if (activeTab === "editor") {
      window.history.replaceState({ isTab: true }, "");
    }
  };

  const handleLabOpenChapterList = () => {
    if (typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches) {
      handleLabChapterBack();
      return;
    }
    setLabChapterDrawerOpen(true);
  };

  const handleLabPickChapter = (chapterId: string) => {
    setActiveChapterId(chapterId);
    setTranslationError(null);
    setLabChapterDrawerOpen(false);
  };

  /** Lab: về màn hình Home gốc — không mở drawer danh sách chương. */
  const handleLabExitToHome = () => {
    setLabChapterDrawerOpen(false);
    setTranslationError(null);
    setActiveChapterId(undefined);
    setActiveTab("home");
    window.history.replaceState(null, "");
  };

  if (isLoadingDb) {
    return (
      <div className={`${uiShell} items-center justify-center gap-3`}>
        <RefreshCw className="w-7 h-7 text-app-accent animate-spin" />
        <span className={uiCaption}>Đang khởi tạo tệp cơ sở dữ liệu IndexedDB...</span>
      </div>
    );
  }

  const renderTabFallback = (message: string) => (
    <div className={`${uiCard} p-4 flex items-center gap-2 text-app-text-muted`}>
      <RefreshCw className="w-4 h-4 animate-spin text-app-accent shrink-0" />
      <span className="text-xs">{message}</span>
    </div>
  );

  return (
    <div className={`${uiShell} select-none`}>
      
      {/* Compact layout navigation bar inside tabs */}
      {activeTab !== "home" && !isDetailMode && !isReaderImmersive && (
        <header className={uiHeader}>
          <button
            onClick={() => {
              if (window.history.state && (window.history.state.isTab || window.history.state.isDetail)) {
                window.history.back();
              } else {
                setActiveTab("home");
              }
            }}
            className={uiBtnGhost}
          >
            <ChevronLeft className="w-4 h-4 shrink-0" />
            <span className="truncate">Quay lại</span>
          </button>
          
          <div className="flex items-center gap-2 min-w-0">
            <span className={`${uiLabel} app-chip truncate max-w-[min(100%,14rem)]`}>
              {activeTab === "library" && "📚 Thư Viện"}
              {activeTab === "editor" && "✍️ Lab Dịch"}
              {activeTab === "reader" && "📖 Phòng Đọc Sách"}
              {activeTab === "dict" && "🗂️ Từ Điển"}
              {activeTab === "pronouns" && "👥 Quy Tắc Xưng Hô"}
              {activeTab === "settings" && "⚙️ Cấu Hình"}
              {activeTab === "vfs" && "📁 Sao Lưu và Khôi Phục"}
            </span>
          </div>
        </header>
      )}

      {/* Main viewport Container with Desktop width limit constraints */}
      <main className={`${uiMain} overflow-y-auto md:overflow-hidden ${
        activeTab === "reader" && activeChapterId 
          ? "max-w-full p-0" 
          : activeTab === "editor" && activeChapterId
            ? "max-w-full py-0 px-0 md:p-4"
            : "max-w-7xl py-3 px-0 md:p-6"
      }`}>
        
        {/* Render Tab Views */}
        {activeTab === "home" && (
          <div className="flex-1 flex flex-col justify-center items-center py-4 md:py-8 px-4 max-w-lg w-full mx-auto select-none my-auto animate-fade-up-soft">
            
            {/* Header branding — tối giản kiểu Kindle */}
            <div className={`w-full flex flex-col items-center text-center py-5 px-4 mb-4 relative overflow-hidden rounded-[1.35rem] border border-app-border bg-gradient-to-br from-app-accent to-app-accent-hover text-white shadow-[0_14px_30px_color-mix(in_srgb,var(--color-app-accent)_30%,transparent)]`}>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_12%,rgba(255,255,255,0.22),transparent_42%),radial-gradient(circle_at_82%_100%,rgba(0,0,0,0.18),transparent_45%)] pointer-events-none" />
              <div className="relative h-16 w-16 bg-white/18 rounded-2xl flex items-center justify-center mb-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_10px_22px_rgba(0,0,0,0.24)]">
                <PandaBrandIcon className="w-16 h-16" />
              </div>
              <h1 className="text-[20px] font-bold tracking-tight mt-1 leading-snug">
                Novel Translator for Fun
              </h1>
              <p className="text-white/80 text-sm mt-0.5 font-medium">
                Nguyễn Thái Dũng
              </p>
            </div>

            <div className={`w-full ${uiCard} p-2.5 flex flex-col gap-2`}>
              {[
                { id: "library", label: "Thư Viện", emoji: "📚", desc: "Quản lý tác phẩm & nạp chương mới", icon: Library },
                { id: "editor", label: "Lab Dịch", emoji: "✍️", desc: "So sánh dịch thuật & biên tập nội dung", icon: FileText },
                { id: "reader", label: "Phòng Đọc Sách", emoji: "📖", desc: "Đọc truyện offline mượt mà tinh chỉnh", icon: BookMarked },
                { id: "dict", label: "Từ Điển", emoji: "🗂️", desc: "Quy chuẩn từ vựng hệ thống", icon: Sparkles },
                { id: "pronouns", label: "Quy Tắc Xưng Hô", emoji: "👥", desc: "Thiết lập quan hệ vai xưng hô", icon: GraduationCap },
                { id: "settings", label: "Cấu Hình", emoji: "⚙️", desc: "API Keys & cài đặt mô hình AI", icon: Settings },
                { id: "vfs", label: "Sao Lưu và Khôi Phục", emoji: "📁", desc: "Quản lý tệp hệ thống, sao lưu dữ liệu", icon: FolderTree }
              ].map((tab) => {
                const IconComp = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveTab(tab.id as any);
                      setTranslationError(null);
                      setBatchErrors(null);
                    }}
                    className={`${uiMenuRow} group border-l-[3px] border-l-transparent hover:border-l-app-accent hover:-translate-y-[1px]`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`${uiIconBox} bg-gradient-to-br from-app-surface to-app-surface-muted`}>
                        <IconComp className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="text-[17px] font-semibold block truncate leading-tight tracking-tight">
                          {tab.emoji} {tab.label}
                        </span>
                        <span className="text-[13px] block truncate mt-0.5 text-app-text-muted">
                          {tab.desc}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0 opacity-70 text-app-accent" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "library" && (
          <div className="flex-1 min-h-0">
            <Suspense fallback={renderTabFallback("Đang tải Thư Viện...")}>
              <StoryLibrary
                novels={novels.filter((n) => !n.deletedFromLibrary)}
                activeNovelId={activeNovelId}
                onSelectNovel={(nid, switchT = true) => {
                  setActiveNovelId(nid);
                  const targetNovel = novels.find((n) => n.id === nid);
                  if (targetNovel) {
                    let storedChapterId = targetNovel.lastReadChapterId;
                    if (!storedChapterId) {
                      try {
                        storedChapterId =
                          localStorage.getItem(`last_read_chapter_${nid}`) ||
                          localStorage.getItem(`last_read_progress_${nid}`) ||
                          undefined;
                      } catch (e) {}
                    }
                    const hasChapter = targetNovel.chapters.some((c) => c.id === storedChapterId);
                    if (storedChapterId && hasChapter) {
                      setActiveChapterId(storedChapterId);
                    } else {
                      const firstCh = targetNovel.chapters[0];
                      if (firstCh) {
                        setActiveChapterId(firstCh.id);
                      }
                    }
                  }
                  if (switchT) {
                    setActiveTab("reader");
                  }
                }}
                onDeleteNovel={handleDeleteNovel}
                onAlert={triggerAlert}
                onConfirm={triggerConfirm}
                onChaptersLoaded={handleChaptersLoaded}
                isTranslating={isTranslatingFullNovel}
                chapterRuleStates={settings.chapterRuleStates}
                onChapterRuleStatesChange={(states) => handleUpdateSetting("chapterRuleStates", states)}
                onImportTranslationBackup={handleImportTranslationBackup}
              />
            </Suspense>
          </div>
        )}

          {activeTab === "editor" && (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
            {/* Chapters list selector left */}
            <div className={`lg:col-span-3 ${uiPanel} rounded-none md:rounded-xl ${
              activeChapterId ? "hidden lg:flex" : "flex"
            } h-[calc(100dvh-3.5rem)] lg:h-[calc(100vh-140px)]`}>
              <h3 className={`${uiLabel} mb-3 shrink-0`}>Danh sách chương</h3>
              
              {!activeNovel ? (
                <div className="flex-1 flex flex-col justify-center items-center text-center p-4 text-zinc-400 text-xs italic">
                  Chưa chọn truyện biên dịch. Vui lòng nạp truyện tại tab Thư Viện.
                </div>
              ) : (
                <>
                  <div className="mb-3 p-2.5 bg-app-accent/8 border border-app-accent/25 rounded-lg shrink-0">
                    <span className={uiLabel}>Tác phẩm</span>
                    <span className="text-sm font-medium text-app-text block truncate mt-0.5">{activeNovel.title}</span>
                  </div>

                  {/* Range selection controls */}
                  <div className="mb-3 shrink-0 bg-zinc-50 dark:bg-zinc-950/40 border border-zinc-200/50 dark:border-zinc-800 p-3 rounded-xl space-y-2">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Chọn khoảng chương cần dịch:</span>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-zinc-500 dark:text-zinc-500 font-bold block mb-0.5">Từ chương:</label>
                        <input
                          type="number"
                          min="1"
                          max={activeNovel.chapters.length}
                          value={rangeStart}
                          onChange={(e) => setRangeStart(e.target.value)}
                          placeholder="Bắt đầu..."
                          className={`${uiInput} !min-h-8 !text-xs`}
                        />
                      </div>
                      <div>
                        <label className="text-[9px] text-zinc-500 dark:text-zinc-500 font-bold block mb-0.5">Đến chương:</label>
                        <input
                          type="number"
                          min="1"
                          max={activeNovel.chapters.length}
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(e.target.value)}
                          placeholder="Chương cũ..."
                          className={`${uiInput} !min-h-8 !text-xs`}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-2.5 pt-1 text-[10px] font-bold">
                      <button
                        type="button"
                        onClick={handleSelectAllChapters}
                        className="text-app-accent hover:opacity-80 transition-opacity uppercase cursor-pointer text-[10px] font-medium"
                      >
                        ✓ Tích tất
                      </button>
                      <span className="text-zinc-300 dark:text-zinc-700">|</span>
                      <button
                        type="button"
                        onClick={handleDeselectAllChapters}
                        className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors uppercase cursor-pointer"
                      >
                        ✗ Hủy tích
                      </button>
                      <span className="text-zinc-300 dark:text-zinc-700">|</span>
                      <span className="text-app-text-muted">Đã chọn: <span className="text-app-accent font-semibold">{selectedChapterIds.length}</span></span>
                    </div>
                  </div>

                  {/* Novel sequential batch translation controls */}
                  <div className="mb-3 shrink-0 space-y-2 relative">
                    <button
                      type="button"
                      onClick={() => setShowBatchTips((prev) => !prev)}
                      className="absolute top-0 right-0 inline-flex items-center justify-center w-7 h-7 rounded-full border border-app-border bg-app-surface hover:bg-app-surface-muted text-app-text-muted"
                      title="Mẹo dịch hàng loạt"
                      aria-label="Mẹo dịch hàng loạt"
                    >
                      <HelpCircle className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleTranslateFullNovel}
                      disabled={isTranslatingFullNovel || isTranslatingChapter}
                      className={`${uiBtnSecondary} w-full !text-xs`}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          isTranslatingFullNovel && selectedChapterIds.length === 0 ? "animate-spin" : ""
                        }`}
                      />
                      {isTranslatingFullNovel && selectedChapterIds.length === 0 && batchProgress
                        ? `Đang dịch ${batchProgress.completed}/${batchProgress.total} (${clampThreadCount(settings.maxThreads, 5)} luồng)...`
                        : "Dịch tự động toàn bộ truyện"}
                    </button>

                    <button
                      type="button"
                      onClick={handleTranslateSelectedChapters}
                      disabled={isTranslatingFullNovel || isTranslatingChapter || selectedChapterIds.length === 0}
                      className={`${uiBtnPrimary} w-full`}
                    >
                      <Play
                        className={`w-4 h-4 ${
                          isTranslatingFullNovel && selectedChapterIds.length > 0 ? "animate-spin" : ""
                        }`}
                      />
                      {isTranslatingFullNovel && selectedChapterIds.length > 0 && batchProgress
                        ? `Đang dịch ${batchProgress.completed}/${batchProgress.total} (${clampThreadCount(settings.maxThreads, 5)} luồng)...`
                        : `Dịch ${selectedChapterIds.length} chương đã chọn`}
                    </button>
                    {showBatchTips && (
                      <div className="rounded-lg border border-app-accent/35 bg-app-accent/5 p-2.5 text-[10px] leading-relaxed space-y-1.5">
                        <span className="font-bold text-app-accent block">Preset nhanh dịch hàng loạt</span>
                        <div className="grid grid-cols-1 gap-1.5">
                          <button
                            type="button"
                            onClick={() => applyBatchStrategyPreset("safe")}
                            className={`${uiBtnGhost} !justify-start !min-h-8 !px-2.5 !py-1 !text-[10px] font-bold`}
                          >
                            An toàn token: 1 luồng (ổn định, ít retry)
                          </button>
                          <button
                            type="button"
                            onClick={() => applyBatchStrategyPreset("balanced")}
                            className={`${uiBtnGhost} !justify-start !min-h-8 !px-2.5 !py-1 !text-[10px] font-bold`}
                          >
                            Cân bằng: 2 luồng (khuyên dùng mặc định)
                          </button>
                          <button
                            type="button"
                            onClick={() => applyBatchStrategyPreset("fast")}
                            className={`${uiBtnGhost} !justify-start !min-h-8 !px-2.5 !py-1 !text-[10px] font-bold`}
                          >
                            Nhanh: 3 luồng (chỉ khi mạng/API ổn định)
                          </button>
                        </div>
                      </div>
                    )}
                    {batchErrors && (
                      <TranslationErrorPanel title="Lỗi dịch hàng loạt" message={batchErrors} />
                    )}
                  </div>

                  {/* Scroll list */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2 pr-1">
                    {activeNovel.chapters.map((ch, idx) => {
                      const isChActive = activeChapterId === ch.id;
                      const readiness =
                        chapterReadinessMap[ch.id] ?? getChapterReadinessSync(ch);
                      return (
                        <div
                          key={ch.id}
                          className={`w-full p-1.5 rounded-xl border flex items-center gap-2 transition-colors ${
                            isChActive
                              ? "bg-app-accent/10 border-app-accent/35 text-app-accent font-medium"
                              : "bg-app-surface-muted/50 border-app-border hover:bg-app-surface-muted text-app-text"
                          }`}
                        >
                          {/* Checkbox for batch tracking selection */}
                          <input
                            type="checkbox"
                            checked={selectedChapterIds.includes(ch.id)}
                            onChange={() => toggleChapterSelection(ch.id)}
                            className="w-4 h-4 rounded border-app-border text-app-accent focus:ring-app-accent/35 cursor-pointer accent-[var(--color-app-accent)] shrink-0 select-none ml-1.5"
                          />

                          {/* Detail Button Clicked trigger comparing */}
                          <button
                            onClick={() => {
                              setActiveChapterId(ch.id);
                              setTranslationError(null);
                            }}
                            className="flex-1 text-left min-w-0 py-1 cursor-pointer outline-none select-none"
                          >
                            <p className="truncate leading-tight text-xs">Chương {idx + 1}: {ch.title}</p>
                            <p className="text-[9px] text-zinc-400 mt-0.5">
                              {formatChapterCharCountLabel(ch)}
                            </p>
                          </button>

                          <ChapterReadinessBadge
                            readiness={readiness}
                            progress={chapterProgressMap[ch.id]}
                            className="mr-1.5"
                          />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Editing comparing space on right */}
            <div className={`lg:col-span-9 min-h-0 space-y-2 ${
              activeChapterId ? "flex flex-col flex-1 min-h-[calc(100dvh-3.5rem)] lg:min-h-[calc(100vh-140px)]" : "hidden lg:flex lg:flex-col"
            }`}>
              {activeChapter ? (
                <>
                  {/* Lab header — tiêu đề ngang dưới status bar, nút hàng dưới (1B) */}
                  <div
                    id="lab-chapter-header"
                    className={`${uiPanel} lab-chrome-safe-top rounded-none md:rounded-xl !px-3 !pb-3 shrink-0 flex flex-col gap-2.5 select-none`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <h2 className="text-sm font-bold text-app-text whitespace-nowrap shrink-0">
                        ✍️ Lab Dịch
                      </h2>
                      <span className="text-app-border shrink-0" aria-hidden="true">
                        |
                      </span>
                      <h3 className={`${uiTitle} truncate leading-snug flex-1 min-w-0`}>
                        {activeChapter.title}
                        {activeChapter.translatedTitle?.trim() ? (
                          <span className="text-app-text-muted font-semibold">
                            {" "}
                            — {activeChapter.translatedTitle}
                          </span>
                        ) : null}
                      </h3>
                      <ChapterReadinessBadge
                        readiness={
                          chapterReadinessMap[activeChapter.id] ??
                          getChapterReadinessSync(activeChapter)
                        }
                        progress={chapterProgressMap[activeChapter.id]}
                        size="sm"
                      />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={handleLabExitToHome}
                        className={`${uiBtnGhost} shrink-0 !min-h-9 !w-9 !px-0`}
                        title="Về trang chủ"
                        aria-label="Về trang chủ"
                      >
                        <Home className="w-4 h-4 shrink-0" />
                      </button>
                      <button
                        type="button"
                        onClick={handleLabOpenChapterList}
                        className={`${uiBtnGhost} shrink-0 !min-h-9 !w-9 !px-0`}
                        title="Danh sách chương"
                        aria-label="Danh sách chương"
                      >
                        <List className="w-4 h-4 shrink-0" />
                      </button>

                      <div className="flex-1 min-w-[0.5rem]" />

                      <button
                        type="button"
                        onClick={() => openReaderAtChapter(activeChapter.id)}
                        className={`${uiBtnGhost} !text-app-accent border-app-accent/30 shrink-0 !min-h-9 !px-2.5`}
                        title="Mở Phòng Đọc đúng chương này"
                      >
                        <BookMarked className="w-4 h-4 shrink-0" />
                        <span className="hidden sm:inline">Phòng Đọc</span>
                      </button>
                      <button
                        onClick={handleTranslateActiveChapter}
                        disabled={isTranslatingChapter || isTranslatingFullNovel}
                        className={`${uiBtnPrimary} shrink-0`}
                      >
                        <Languages className="w-4 h-4 shrink-0" />
                        <span className="truncate">Dịch chương</span>
                      </button>
                    </div>
                  </div>

                  {translationError && (
                    <TranslationErrorPanel message={translationError} />
                  )}

                  <div key={activeChapter.id} className="flex-1 min-h-0 overflow-hidden flex flex-col">
                    <Suspense fallback={renderTabFallback("Đang tải Lab Dịch...")}>
                      <CompareView
                        chapterId={activeChapter.id}
                        chapterTitle={activeChapter.title}
                        sourceText={activeChapter.sourceText}
                        translatedTitle={activeChapter.translatedTitle}
                        translatedText={labDisplayTranslation}
                        onUpdateTranslation={handleUpdateTranslation}
                        onAddDictWord={handleAddDictWord}
                        dictItems={dictItems}
                        novelId={activeNovel.id}
                        initialShowPinyin={labOpenFocus === "han_pinyin"}
                        initialViewStyle={
                          labOpenFocus === "han_pinyin" ? "interleaved" : "columns"
                        }
                        openFocusBanner={
                          labOpenFocus === "han_pinyin"
                            ? "Mở từ Phòng Đọc: dạng Xen kẽ (Hán → Pinyin → Việt). Dùng nút gạt Pinyin để tắt/bật phiên âm bất cứ lúc nào."
                            : null
                        }
                      />
                    </Suspense>
                  </div>

                  {/* Navigation Footer for Previous and Next Chapter */}
                  <div
                    className={`${uiCard} px-4 py-3 flex items-center justify-between gap-4 shrink-0 select-none`}
                    style={{ paddingBottom: `max(0.75rem, ${readerSafeBottomCss()})` }}
                  >
                    {/* Previous Chapter button */}
                    <button
                      onClick={() => handleNavigateChapter("prev")}
                      disabled={isTranslatingChapter || isTranslatingFullNovel || activeNovel.chapters.indexOf(activeChapter) <= 0}
                      className={`${uiBtnSecondary} !min-h-9 !text-xs`}
                    >
                      <ChevronLeft className="w-4 h-4 text-app-accent shrink-0" />
                      Trước
                    </button>

                    <div className="text-[10px] text-zinc-500 dark:text-zinc-500 font-bold uppercase tracking-wider text-center hidden sm:block">
                      Chương {activeNovel.chapters.indexOf(activeChapter) + 1} / {activeNovel.chapters.length}
                    </div>

                    {/* Next Chapter button */}
                    <button
                      onClick={() => handleNavigateChapter("next")}
                      disabled={isTranslatingChapter || isTranslatingFullNovel || activeNovel.chapters.indexOf(activeChapter) >= activeNovel.chapters.length - 1}
                      className={`${uiBtnSecondary} !min-h-9 !text-xs`}
                    >
                      <span className="truncate">Sau</span>
                      <ChevronRight className="w-4 h-4 text-app-accent shrink-0" />
                    </button>
                  </div>
                </>
              ) : (
                <div className="flex-1 bg-white/70 dark:bg-zinc-900/70 border-y md:border border-zinc-200 dark:border-zinc-800 rounded-none md:rounded-2xl flex flex-col items-center justify-center p-8 text-zinc-400 select-none">
                  <span className="italic font-bold">Vui lòng click chọn một chương bên trái để xem nội dung so sánh</span>
                </div>
              )}
            </div>

            {labChapterDrawerOpen && activeNovel && (
              <>
                <button
                  type="button"
                  className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px] lg:hidden"
                  aria-label="Đóng danh sách chương Lab"
                  onClick={() => setLabChapterDrawerOpen(false)}
                />
                <aside
                  className="fixed inset-y-0 left-0 z-[70] w-[88vw] max-w-md flex flex-col bg-app-surface border-r border-app-border shadow-2xl lg:hidden"
                  role="dialog"
                  aria-label="Danh sách chương Lab"
                >
                  <div className="lab-chrome-safe-top min-h-14 px-4 pb-0 border-b border-app-border flex items-center justify-between shrink-0">
                    <h3 className={`${uiLabel} !mb-0`}>Danh sách chương</h3>
                    <button
                      type="button"
                      onClick={() => setLabChapterDrawerOpen(false)}
                      className={`${uiBtnGhost} !min-h-9 !w-9 !px-0`}
                      aria-label="Đóng"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
                    {activeNovel.chapters.map((ch, idx) => {
                      const isChActive = activeChapterId === ch.id;
                      const readiness =
                        chapterReadinessMap[ch.id] ?? getChapterReadinessSync(ch);
                      return (
                        <button
                          key={ch.id}
                          type="button"
                          ref={isChActive ? labActiveChapterRowRef : undefined}
                          onClick={() => handleLabPickChapter(ch.id)}
                          className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                            isChActive
                              ? "bg-app-accent/12 border-app-accent/40 text-app-accent"
                              : "bg-app-surface-muted/60 border-app-border text-app-text hover:bg-app-surface-muted"
                          }`}
                        >
                          <p className="text-xs font-bold truncate leading-snug">
                            Chương {idx + 1}: {ch.title || "(Không có tiêu đề)"}
                          </p>
                          <p className="text-[9px] text-app-text-muted mt-0.5">
                            {formatChapterCharCountLabel(ch)} ·{" "}
                            {readiness === "lab_full" ? "Đã dịch Lab" : "Chưa dịch Lab"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </aside>
              </>
            )}
          </div>
        )}

        {activeTab === "reader" && (
          <div className="flex-1 min-h-0 flex flex-col w-full h-full max-h-[100dvh]">
            {activeNovel ? (
              <ReaderViewGate
                activeNovel={activeNovel}
                activeChapterId={activeChapterId}
                isReaderTabActive={activeTab === "reader"}
                onChapterSelect={handleReaderChapterSelect}
                settings={settings}
                onUpdateSettings={handleUpdateReaderSettings}
                onAddDictWord={handleAddDictWord}
                dictItems={dictItems}
                pronounMappings={pronounMappings}
                onUpdateTranslation={handleUpdateTranslation}
                onChapterTranslated={handleReaderChapterTranslated}
                apiKeys={settings.apiKeys || {}}
                onUpdateReadingProgress={handleUpdateReadingProgress}
                onOpenLabAtChapter={(chapterId, pageIndex) =>
                  openLabAtChapter(chapterId, "han_pinyin", pageIndex)
                }
                onBack={() => {
                  if (window.history.state && (window.history.state.isDetail || window.history.state.isTab)) {
                    window.history.back();
                  } else {
                    setActiveTab("home");
                  }
                }}
              />
            ) : (
              <div className="py-16 bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-2xl text-center text-zinc-400 space-y-2 select-none">
                <BookOpen className="w-8 h-8 mx-auto text-zinc-300 dark:text-zinc-700 animate-bounce" />
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Chưa có tác phẩm đang đọc</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 max-w-sm mx-auto leading-relaxed">
                  Vui lòng chọn mở tác phẩm của bạn tại thẻ "Thư Viện" hoặc nạp chương mới.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "dict" && (
          <div className="flex-1 min-h-0">
            <Suspense fallback={renderTabFallback("Đang tải Từ Điển...")}>
              <DictManager
                dictItems={dictItems}
                onAddWord={handleAddDictWord}
                onUpdateWord={handleUpdateDictWord}
                onDeleteWord={handleDeleteDictWord}
                onClearDict={handleClearDict}
                onLoadPreset={handleLoadDictPreset}
                onImportDictTxt={handleImportDictTxt}
                onApplyNovelDictReplacements={handleApplyNovelDictReplacements}
                activeNovelId={activeNovelId}
                novels={novels}
                pronounMappings={pronounMappings}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "pronouns" && (
          <div className="flex-1 min-h-0">
            <Suspense fallback={renderTabFallback("Đang tải Quy Tắc Xưng Hô...")}>
              <PronounsGuide
                pronounMappings={pronounMappings}
                onAddPronoun={handleAddPronoun}
                onDeletePronoun={handleDeletePronoun}
                onResetDefaultPronouns={handleResetDefaultPronouns}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "settings" && (
          <div className="flex-1 min-h-0">
            <Suspense fallback={renderTabFallback("Đang tải Cấu Hình...")}>
              <SettingsTab
                settings={settings}
                onUpdateApiKey={handleUpdateApiKey}
                onSelectModel={handleSelectModel}
                onUpdateSetting={handleUpdateSetting}
              />
            </Suspense>
          </div>
        )}

        {activeTab === "vfs" && (
          <div className="flex-1 min-h-0">
            <Suspense fallback={renderTabFallback("Đang tải Sao Lưu và Khôi Phục...")}>
              <VFSManager
                novels={novels}
                dictItems={dictItems}
                pronounMappings={pronounMappings}
                settings={settings}
                setNovels={setNovels}
                setDictItems={setDictItems}
                setPronounMappings={setPronounMappings}
                setSettings={setSettings}
                onAlert={triggerAlert}
                onImportTranslationBackup={handleImportTranslationBackup}
              />
            </Suspense>
          </div>
        )}

      </main>

      {/* Floating alert dialogue overlay */}
      {alertConfig && (
        <div
          className="fixed inset-0 app-modal-overlay flex items-center justify-center p-4 z-[54] select-none animate-fade-in"
          id="fluent-alert-balloon"
          role="dialog"
          aria-modal="true"
          aria-label="Thông báo hệ thống"
        >
          <div className={`${uiCard} app-sheet-handle app-chrome-safe-top app-chrome-safe-bottom p-5 shadow-2xl max-w-md w-full animate-scale-up max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar`}>
            <h4 className={`${uiTitle} flex items-center gap-2`}>
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              {alertConfig.title}
            </h4>
            <p className={`${uiSubtitle} mt-3 whitespace-pre-wrap`}>
              {alertConfig.desc}
            </p>
            <button
              onClick={() => setAlertConfig(null)}
              className={`${uiBtnPrimary} mt-5 w-full`}
            >
              Chấp nhận
            </button>
          </div>
        </div>
      )}

      {translationImportPrompt && (
        <div
          className="fixed inset-0 app-modal-overlay flex items-center justify-center p-4 z-[54] select-none animate-fade-in"
          id="translation-import-prompt"
          role="dialog"
          aria-modal="true"
          aria-label="Nạp data dịch"
        >
          <div className={`${uiCard} app-sheet-handle app-chrome-safe-top app-chrome-safe-bottom p-5 shadow-2xl max-w-md w-full animate-scale-up space-y-3 max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar`}>
            <h4 className={`${uiTitle} flex items-center gap-2`}>
              <FolderTree className="w-5 h-5 text-teal-600 shrink-0" />
              Nạp data dịch
            </h4>
            <p className={`${uiCaption} leading-relaxed`}>
              Chỉ gộp truyện/chương đã dịch Lab — không đổi cấu hình, API key hay từ điển.
            </p>
            <div className="space-y-2 text-[11px] leading-relaxed">
              <div className="rounded-lg border border-app-border bg-app-surface-muted/60 p-2.5">
                <span className="font-bold text-app-text block mb-1">Chỉ thêm mới (không ghi đè)</span>
                <span className="text-app-text-muted">
                  {translationImportPrompt.addOnlySummary}
                </span>
              </div>
              <div className="rounded-lg border border-amber-500/35 bg-amber-500/8 p-2.5">
                <span className="font-bold text-app-text block mb-1">Gộp & ghi đè chương trùng id</span>
                <span className="text-app-text-muted">
                  {translationImportPrompt.overwriteSummary}
                </span>
              </div>
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  const imported = translationImportPrompt.imported;
                  setTranslationImportPrompt(null);
                  void applyTranslationBackupImport(imported, "add_only");
                }}
                className={`${uiBtnPrimary} w-full min-h-10 bg-teal-700 hover:bg-teal-600`}
              >
                Chỉ thêm mới
              </button>
              <button
                type="button"
                onClick={() => {
                  const imported = translationImportPrompt.imported;
                  setTranslationImportPrompt(null);
                  void applyTranslationBackupImport(imported, "overwrite");
                }}
                className={`${uiBtnSecondary} w-full min-h-10 text-xs font-bold`}
              >
                Gộp & ghi đè
              </button>
              <button
                type="button"
                onClick={() => setTranslationImportPrompt(null)}
                className={`${uiBtnGhost} w-full min-h-10`}
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating confirm dialogue override */}
      {confirmConfig && (
        <div
          className="fixed inset-0 app-modal-overlay flex items-center justify-center p-4 z-[54] select-none animate-fade-in"
          id="fluent-confirm-balloon"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận hành động"
        >
          <div className={`${uiCard} app-sheet-handle app-chrome-safe-top app-chrome-safe-bottom p-5 shadow-2xl max-w-md w-full animate-scale-up max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar`}>
            <h4 className={`${uiTitle} flex items-center gap-2`}>
              <AlertCircle className={`w-5 h-5 shrink-0 ${confirmConfig.isDanger ? "text-red-500" : "text-app-accent"}`} />
              {confirmConfig.title}
            </h4>
            <p className={`${uiSubtitle} mt-3 whitespace-pre-wrap`}>
              {confirmConfig.desc}
            </p>
            {/* Height 11 control bars */}
            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => setConfirmConfig(null)}
                className={`${uiBtnGhost} flex-1`}
              >
                Hủy bỏ
              </button>
              <button
                onClick={() => {
                  confirmConfig.onAgree();
                  setConfirmConfig(null);
                }}
                className={`flex-1 ${confirmConfig.isDanger ? uiBtnDanger : uiBtnPrimary}`}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Model adaptation strategy selection dialog */}
      {showModelChangePopup && (
        <div
          className="fixed inset-0 app-modal-overlay flex items-center justify-center p-4 z-[54] select-none animate-fade-in"
          id="model-adaptation-popup"
          role="dialog"
          aria-modal="true"
          aria-label="Chọn chiến lược đổi model"
        >
          <div className={`${uiCard} app-sheet-handle app-chrome-safe-top app-chrome-safe-bottom p-5 shadow-2xl max-w-md w-full animate-scale-up max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar`}>
            <h4 className={`${uiTitle} flex items-center gap-2`}>
              <Sparkles className="w-5 h-5 text-app-accent shrink-0" />
              Thay đổi mô hình AI dịch thuật
            </h4>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed mt-3.5 font-medium">
              Bạn vừa thay đổi mô hình AI mới để dịch truyện. Bạn muốn xử lý các nội dung (các trang và chương) mà các mô hình trước đó đã hoàn tất dịch thuật như thế nào?
            </p>
            <div className="mt-5 space-y-2.5">
              <button
                onClick={async () => {
                  if (showModelChangePopup) {
                    setShowModelResetDangerConfirm({
                      newModelId: showModelChangePopup.newModelId,
                      armed: false,
                      phrase: "",
                    });
                    setShowModelChangePopup(null);
                  }
                }}
                className="w-full text-left p-3.5 border border-amber-500/30 dark:border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 rounded-xl text-xs font-bold transition-all cursor-pointer group"
              >
                <div className="text-zinc-800 dark:text-zinc-200 group-hover:text-amber-600 dark:group-hover:text-amber-400 font-semibold">Cách 1: Dịch lại toàn bộ</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-500 font-normal mt-0.5 leading-snug">
                  Xóa bỏ toàn bộ các chương và các trang đã dịch tốt từ trước để dịch thuật sạch mới hoàn toàn bằng mô hình mới này.
                </div>
              </button>

              <button
                onClick={async () => {
                  if (showModelChangePopup) {
                    await handleApplyModelChange(showModelChangePopup.newModelId, "keep_existing");
                  }
                }}
                className="w-full text-left p-3.5 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                <div className="text-zinc-800 dark:text-zinc-200 font-semibold">Cách 2: Chỉ dịch chương còn lại</div>
                <div className="text-[10px] text-zinc-500 dark:text-zinc-500 font-normal mt-0.5 leading-snug">
                  Bảo lưu mọi lịch sử/bản dịch cũ. Mô hình AI mới chỉ áp dụng cho việc biên dịch các chương/trang mới về sau.
                </div>
              </button>

              <button
                onClick={() => setShowModelChangePopup(null)}
                className="w-full h-10 border border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-300 rounded-xl text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-900 cursor-pointer transition-all"
              >
                Hủy bỏ
              </button>
            </div>
          </div>
        </div>
      )}

      {showModelResetDangerConfirm && (
        <div
          className="fixed inset-0 app-modal-overlay flex items-center justify-center p-4 z-[55] select-none animate-fade-in"
          id="model-reset-danger-confirm"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận xóa bản dịch cũ"
        >
          <div className={`${uiCard} app-sheet-handle app-chrome-safe-top app-chrome-safe-bottom p-5 shadow-2xl max-w-md w-full animate-scale-up max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar space-y-3`}>
            <h4 className={`${uiTitle} flex items-center gap-2`}>
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              Xác nhận nguy hiểm: Dịch lại toàn bộ
            </h4>
            <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
              Thao tác này sẽ xóa toàn bộ bản dịch hiện có của tất cả truyện/chương. Không thể hoàn tác.
            </p>
            <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-3 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-100">
                  Tôi đã hiểu rủi ro và đồng ý xóa toàn bộ bản dịch cũ
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={showModelResetDangerConfirm.armed}
                  onClick={() =>
                    setShowModelResetDangerConfirm((prev) =>
                      prev ? { ...prev, armed: !prev.armed } : prev
                    )
                  }
                  className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                    showModelResetDangerConfirm.armed ? "bg-red-500" : "bg-app-border"
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow transition ${
                      showModelResetDangerConfirm.armed ? "translate-x-5" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-zinc-700 dark:text-zinc-200">
                  Nhập chính xác cụm sau để xác nhận: <span className="font-mono">XOA TOAN BO</span>
                </label>
                <input
                  type="text"
                  value={showModelResetDangerConfirm.phrase}
                  onChange={(e) =>
                    setShowModelResetDangerConfirm((prev) =>
                      prev ? { ...prev, phrase: e.target.value } : prev
                    )
                  }
                  placeholder="XOA TOAN BO"
                  className={`${uiInput} !min-h-10 !text-xs font-mono`}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowModelResetDangerConfirm(null)}
                className={`${uiBtnGhost} flex-1`}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={async () => {
                  const snapshot = showModelResetDangerConfirm;
                  if (!snapshot) return;
                  await handleApplyModelChange(snapshot.newModelId, "retranslate_all");
                  setShowModelResetDangerConfirm(null);
                }}
                disabled={
                  !showModelResetDangerConfirm.armed ||
                  showModelResetDangerConfirm.phrase.trim().toUpperCase() !== "XOA TOAN BO"
                }
                className={`${uiBtnDanger} flex-1 disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                Xóa và dịch lại toàn bộ
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

