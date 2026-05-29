import React, { useState, useEffect, useRef, useLayoutEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { createPortal } from "react-dom";
import { 
  ChevronLeft, 
  ChevronRight, 
  Settings, 
  BookOpen, 
  Maximize2, 
  Minimize2, 
  AlignLeft, 
  AlignJustify, 
  AlignRight, 
  Type, 
  Columns, 
  Bookmark,
  Sparkles,
  CheckCircle,
  PlusCircle,
  ArrowRight,
  X,
  FileText,
  ChevronDown,
  List,
  HelpCircle,
} from "lucide-react";
import { Chapter, Novel, TranslationSettings, DictItem, PronounMapping } from "../types";
import { pinyin } from "pinyin-pro";
import { saveValue, getValue } from "../lib/persistence";
import { translateText, translatePhrase, alignPhrase, getApiUrl } from "../utils/translationClient";
import { type PageContent } from "../utils/readerPagination";
import {
  paginateChapter,
  type PaginateOptions,
} from "../utils/readerPaginateChapter";
import {
  buildReaderNativeParagraphStyle,
  paragraphMayShowInlineTranslateAction,
  READER_LAB_BANNER_RESERVE_PX,
  readerTextMayShowInlineTranslateAction,
  type ReaderPageViewport,
} from "../utils/readerPageLayout";
import {
  getReaderAlignmentClass,
  getReaderFontClass,
  READER_TEXT_INDENT_EM,
} from "../utils/readerTypography";
import { buildDictContextString } from "../utils/dictContextBuilder";
import {
  loadReaderSequentialState,
  saveReaderSequentialState,
} from "../utils/readerSequentialState";
import { formatChapterCharCountLabel } from "../utils/chapterMetrics";
import { applyReaderSystemChrome } from "../utils/systemChrome";
import {
  getReaderThemeTokens,
  normalizeReaderTheme,
  READER_TOOLBAR_HEIGHT_PX,
  readerSafeBottomCss,
  readerSafeTopCss,
} from "../utils/readerChromeLayout";
import {
  canAccumulateDwellTime,
  getAutoTranslateDelaySec,
  isReaderAutoTranslateEnabled,
  READER_AUTO_TRANSLATE_MIN_DELAY_SEC,
  READER_AUTO_TRANSLATE_DEFAULT_DELAY_SEC,
  resolveChapterNavKind,
  runAutoTranslateNextChapter,
  shouldArmSequentialAfterNav,
  resetReaderAutoTranslateSession,
  type ChapterNavKind,
} from "../utils/readerAutoTranslateNext";
import type { ChapterTranslationResult } from "../utils/chapterTranslationEngine";
import {
  type BilingualLookupSource,
} from "../utils/bilingualAlignment";
import {
  resolveLabBilingualSelection,
  validateDictPairBeforeSave,
  expandToWordBoundaries,
  isProperNamePhrase,
  LAB_SELECTION_SETTLE_MS,
} from "../utils/labSelectionPipeline";
import {
  lookupChineseInDict,
} from "../utils/dictLookup";
import {
  getHanVietOffline,
  getCharHanVietReading,
  phraseTranslationCache,
} from "../utils/hanVietOffline";
import { readerStrings as rs } from "./readerStrings";

export { getHanVietOffline } from "../utils/hanVietOffline";

function removeVietnameseTones(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function getPhoneticSimilarity(pinyinWord: string, vietnameseWord: string): number {
  if (!pinyinWord || !vietnameseWord) return 0;
  
  const py = pinyinWord.toLowerCase();
  const vi = vietnameseWord.toLowerCase();
  
  if (py === vi) return 1.0;
  
  const cleanPy = py
    .replace(/^sh/, "s")
    .replace(/^zh/, "ch")
    .replace(/^x/, "s")
    .replace(/^q/, "ch")
    .replace(/^j/, "g")
    .replace(/^f/, "ph")
    .replace(/^w/, "v")
    .replace(/^y/, "i")
    .replace(/ng$/, "n")
    .replace(/nh$/, "n")
    .replace(/m$/, "n")
    .replace(/e$/, "a")
    .replace(/u$/, "o");

  const cleanVi = vi
    .replace(/^tr/, "ch")
    .replace(/^gi/, "ch")
    .replace(/^đ/, "d")
    .replace(/ng$/, "n")
    .replace(/nh$/, "n")
    .replace(/m$/, "n")
    .replace(/u$/, "o")
    .replace(/y/g, "i");

  if (cleanPy === cleanVi) return 0.9;
  
  let score = 0;
  if (cleanPy[0] === cleanVi[0]) score += 0.4;
  
  let matches = 0;
  const setPy = new Set(cleanPy);
  for (const char of cleanVi) {
    if (setPy.has(char)) {
      matches++;
    }
  }
  const jaccard = matches / (new Set([...cleanPy, ...cleanVi]).size || 1);
  score += jaccard * 0.6;
  
  return score;
}

function alignPhraseOffline(
  paragraph: string, 
  vietnamese: string, 
  vietnameseParagraphText: string,
  dictItems: DictItem[], 
  pronounMappings: PronounMapping[]
): string {
  if (!paragraph || !vietnamese) return "";
  
  const cleanViStr = (str: string) => str.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?"']/g, "").replace(/\s+/g, " ").trim();
  const cleanSelected = cleanViStr(vietnamese);
  if (!cleanSelected) return "";

  // 1. Direct search using existing exact dictionary and pronoun mapping values
  if (dictItems && Array.isArray(dictItems)) {
    const matched = dictItems
      .filter(item => {
        const cleanItemVi = cleanViStr(item.vietnamese);
        return cleanItemVi && (cleanItemVi === cleanSelected || (cleanItemVi.length >= 3 && cleanSelected.includes(cleanItemVi)));
      })
      .sort((a, b) => b.vietnamese.length - a.vietnamese.length);
      
    for (const item of matched) {
      if (item.chinese && paragraph.includes(item.chinese)) {
        return item.chinese;
      }
    }
  }

  if (pronounMappings && Array.isArray(pronounMappings)) {
    const matched = pronounMappings
      .filter(item => {
        const cleanItemVi = cleanViStr(item.vietnamese);
        return cleanItemVi && (cleanItemVi === cleanSelected || (cleanItemVi.length >= 3 && cleanSelected.includes(cleanItemVi)));
      })
      .sort((a, b) => b.vietnamese.length - a.vietnamese.length);

    for (const item of matched) {
      if (item.chinese && paragraph.includes(item.chinese)) {
        return item.chinese;
      }
    }
  }

  // 2. Advanced context & phonetic segment alignment
  const charsMap: { char: string; originalIndex: number }[] = [];
  for (let i = 0; i < paragraph.length; i++) {
    const c = paragraph[i];
    if (/[\u4e00-\u9fa5]/.test(c)) {
      charsMap.push({ char: c, originalIndex: i });
    }
  }

  if (charsMap.length === 0) return "";

  const selectedWords = cleanSelected.split(/\s+/).filter(Boolean);
  if (selectedWords.length === 0) return "";

  // Find where the selected vietnamese word is in the paragraph
  const viIdx = vietnameseParagraphText.indexOf(vietnamese);
  let vRatio = 0.5;
  if (viIdx !== -1 && vietnameseParagraphText.length > 0) {
    vRatio = viIdx / vietnameseParagraphText.length;
  }

  let bestSub = "";
  let bestScore = -1000;
  let bestOriginalStart = -1;
  let bestOriginalEnd = -1;

  for (let len = 1; len <= Math.min(10, charsMap.length); len++) {
    for (let i = 0; i <= charsMap.length - len; i++) {
      const subChars = charsMap.slice(i, i + len);
      const subText = subChars.map(x => x.char).join("");
      
      let subTranslation = "";
      const subDict = dictItems.find(item => item.chinese === subText);
      if (subDict && subDict.vietnamese) {
        subTranslation = subDict.vietnamese;
      } else {
        const subPm = pronounMappings.find(pm => pm.chinese === subText);
        if (subPm && subPm.vietnamese) {
          subTranslation = subPm.vietnamese;
        } else {
          const hvWords: string[] = [];
          for (const item of subChars) {
            const h = item.char;
            let hv = getCharHanVietReading(h);
            const single = dictItems.find((x) => x.chinese === h);
            if (single?.vietnamese) {
              hv = single.vietnamese;
            }
            hvWords.push(hv || h);
          }
          subTranslation = hvWords.join(" ");
        }
      }

      const cleanTrans = cleanViStr(subTranslation);
      const transWords = cleanTrans.split(/\s+/).filter(Boolean);

      let score = 0;
      let intersectionCount = 0;
      const transWordSet = new Set(transWords);
      for (const w of selectedWords) {
        if (transWordSet.has(w)) {
          intersectionCount++;
        }
      }

      const unionCount = new Set([...selectedWords, ...transWords]).size;
      const jaccard = unionCount > 0 ? intersectionCount / unionCount : 0;

      if (cleanTrans === cleanSelected) {
        score += 100 + len;
      } else {
        score += intersectionCount * 25 + jaccard * 40;
      }

      const cStartIdx = subChars[0].originalIndex;
      const cRatio = cStartIdx / paragraph.length;
      const distance = Math.abs(cRatio - vRatio);
      score -= distance * 15;

      const lengthRatio = selectedWords.length / len;
      if (lengthRatio < 0.3 || lengthRatio > 3.0) {
        score -= 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestOriginalStart = subChars[0].originalIndex;
        bestOriginalEnd = subChars[subChars.length - 1].originalIndex + 1;
        bestSub = paragraph.substring(bestOriginalStart, bestOriginalEnd);
      }
    }
  }

  if (bestScore > -100 && bestSub) {
    return bestSub;
  }

  return "";
}

const alignPhraseCache = new Map<string, string>();

export type { PageContent } from "../utils/readerPagination";

export function parseChineseNumerals(cn: string): number {
    const charMap: Record<string, number> = {
    '零': 0, '一': 1, '二': 2, '两': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
    '〇': 0, 'o': 0, 'O': 0
  };
  const units: Record<string, number> = {
    '十': 10, '百': 100, '千': 1000, '万': 10000
  };
  
  let sum = 0;
  let temp = 0;
  let hasUnit = false;
  
  for (let i = 0; i < cn.length; i++) {
    const char = cn[i];
    if (charMap[char] !== undefined) {
      temp = charMap[char];
      if (i === cn.length - 1) {
        sum += temp;
      }
    } else if (units[char] !== undefined) {
      const unitValue = units[char];
      if (temp === 0 && unitValue === 10) {
        temp = 1; 
      }
      sum += temp * unitValue;
      temp = 0;
      hasUnit = true;
    }
  }
  if (!hasUnit && temp > 0) {
    let seq = "";
    for (let i = 0; i < cn.length; i++) {
      const char = cn[i];
      if (charMap[char] !== undefined) {
        seq += charMap[char];
      }
    }
    if (seq.length > 0) {
      const val = parseInt(seq, 10);
      return isNaN(val) ? temp : val;
    }
  }
  return sum > 0 ? sum : temp;
}

export {
  READER_CONTENT_HEIGHT_RATIO,
  READER_PAGE_MAX_WIDTH_RATIO,
  READER_TARGET_FRAME_RATIO,
  computeReaderPageViewport,
  type ReaderPageViewport,
} from "../utils/readerPageLayout";

/** Gộp bản dịch từng trang — không ghi đè nội dung đã có bằng chuỗi rỗng */
function mergePageTranslationArrays(
  prev: string[],
  incoming: string[] | null | undefined,
  targetLength: number
): string[] {
  const next = new Array(targetLength).fill("");
  for (let i = 0; i < targetLength; i++) {
    const fromPrev = prev[i]?.trim() ?? "";
    const fromIncoming = incoming?.[i]?.trim() ?? "";
    if (fromPrev) {
      next[i] = prev[i];
    } else if (fromIncoming) {
      next[i] = incoming![i];
    }
  }
  return next;
}

function pageTranslationArraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? "") !== (b[i] ?? "")) return false;
  }
  return true;
}

function readerPageViewportsEqual(a: ReaderPageViewport, b: ReaderPageViewport): boolean {
  return (
    a.width === b.width &&
    a.height === b.height &&
    a.outerWidth === b.outerWidth &&
    a.outerHeight === b.outerHeight &&
    a.padX === b.padX &&
    a.padY === b.padY &&
    a.padTop === b.padTop &&
    a.padBottom === b.padBottom &&
    a.targetHeight === b.targetHeight &&
    a.quantizedHeight === b.quantizedHeight &&
    a.exactLineHeightPx === b.exactLineHeightPx &&
    a.columnWidthPx === b.columnWidthPx
  );
}

export type { PaginateOptions } from "../utils/readerPaginateChapter";
export { paginateChapter } from "../utils/readerPaginateChapter";

const pageFlightKey = (chapterId: string, pageIdx: number) => `${chapterId}:${pageIdx}`;

interface ReaderViewProps {
  activeNovel: Novel;
  activeChapterId?: string;
  isReaderTabActive?: boolean;
  onChapterSelect: (chapterId: string) => void;
  settings: TranslationSettings;
  onUpdateSettings: (settings: TranslationSettings) => void;
  onAddDictWord: (zh: string, vi: string, cat: DictItem["category"], novelId?: string) => void;
  dictItems: DictItem[];
  pronounMappings: PronounMapping[];
  onUpdateTranslation?: (val: string) => void;
  /** Lưu bản dịch Lab cho chương bất kỳ (vd. auto-dịch chương kế) */
  onChapterTranslated?: (chapterId: string, result: ChapterTranslationResult) => Promise<void>;
  apiKeys?: Record<string, string>;
  onUpdateReadingProgress?: (novelId: string, chapterId: string, pageIndex?: number, mode?: "scroll" | "page") => void;
  /** Mở Lab Dịch cùng chương (Hán + Pinyin) */
  onOpenLabAtChapter?: (chapterId: string, pageIndex?: number) => void;
  onBack?: () => void;
}

export default function ReaderView({
  activeNovel,
  activeChapterId,
  isReaderTabActive = true,
  onChapterSelect,
  settings,
  onUpdateSettings,
  onAddDictWord,
  dictItems = [],
  pronounMappings = [],
  onUpdateTranslation,
  onChapterTranslated,
  apiKeys = {},
  onUpdateReadingProgress,
  onOpenLabAtChapter,
  onBack
}: ReaderViewProps) {
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" ? window.innerWidth < 1024 : false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageContentRef = useRef<HTMLDivElement>(null);
  const paginationMeasureRef = useRef<HTMLDivElement>(null);
  const domPaginateIdleRef = useRef<number | null>(null);
  const paginationDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paginationCacheRef = useRef<Map<string, PageContent[]>>(new Map());
  const [pageViewport, setPageViewport] = useState<ReaderPageViewport>({
    width: 340,
    height: 600,
    outerWidth: 360,
    outerHeight: 640,
    padX: 10,
    padY: 8,
    padTop: 8,
    padBottom: 8,
    rawAvailableHeight: 600,
    targetHeight: 600,
    quantizedHeight: 600,
    exactLineHeightPx: 32,
    columnWidthPx: 320,
  });
  const [pages, setPages] = useState<PageContent[]>([]);

  // Mobile full-screen reading state & touch handlers
  const [showBarsOnMobile, setShowBarsOnMobile] = useState(false);
  const [showChapterDrawer, setShowChapterDrawer] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number; time: number; fromRightEdge: boolean } | null>(null);
  const pagesRef = useRef<ReturnType<typeof paginateChapter>>([]);
  const translatedPagesRef = useRef<string[]>([]);
  const translateInFlightRef = useRef<Set<string>>(new Set());
  const readerTabWasActiveRef = useRef(false);
  const syncGenerationRef = useRef(0);
  const syncMetaRef = useRef({ chapterId: "", paginationKey: "" });
  const translateRequestRef = useRef({ chapterId: "", pageIndex: -1 });
  const currentPageIndexRef = useRef(0);
  const chapterTitleRequestedRef = useRef<Set<string>>(new Set());
  const readingProgressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  const apiKeysRef = useRef(apiKeys);
  const dictItemsRef = useRef(dictItems);
  const pronounMappingsRef = useRef(pronounMappings);
  const onChapterTranslatedRef = useRef(onChapterTranslated);
  settingsRef.current = settings;
  apiKeysRef.current = apiKeys;
  dictItemsRef.current = dictItems;
  pronounMappingsRef.current = pronounMappings;
  onChapterTranslatedRef.current = onChapterTranslated;

  const [readMode, setReadMode] = useState<"scroll" | "page">(() => {
    try {
      return (localStorage.getItem("reader_read_mode") as "scroll" | "page") || "scroll";
    } catch {
      return "scroll";
    }
  });

  const buildPaginateOpts = (reserveBanner: boolean): PaginateOptions => ({
    widthIsContentBox: true,
    heightReservePx: reserveBanner ? READER_LAB_BANNER_RESERVE_PX : 0,
    measureRoot: paginationMeasureRef.current,
  });

  // Force page-by-page mode on mobile
  useEffect(() => {
    if (isMobile && readMode !== "page") {
      setReadMode("page");
    }
  }, [isMobile, readMode]);

  const [translatedPages, setTranslatedPages] = useState<string[]>([]);
  const [isTranslatingPage, setIsTranslatingPage] = useState(false);
  const [pageTranslationError, setPageTranslationError] = useState<string | null>(null);
  const [chapterTranslations, setChapterTranslations] = useState<Record<string, string>>(() => {
    try {
      const saved = localStorage.getItem("reader_chapter_title_translations");
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const ignoreResetPageRef = useRef(false);

  const handleToggleReadMode = () => {
    const nextMode = readMode === "scroll" ? "page" : "scroll";
    setReadMode(nextMode);
    try {
      localStorage.setItem("reader_read_mode", nextMode);
    } catch (e) {
      console.error(e);
    }
    setCurrentPageIndex(0);
  };

  const activeChapIdx = activeChapterId
    ? activeNovel.chapters.findIndex((c) => c.id === activeChapterId)
    : -1;
  const currentChapter =
    activeChapIdx >= 0 ? activeNovel.chapters[activeChapIdx] : undefined;

  const [sequentialArmed, setSequentialArmed] = useState(false);
  const [autoTranslateHint, setAutoTranslateHint] = useState<string | null>(null);
  const [showAutoTranslateTips, setShowAutoTranslateTips] = useState(false);
  const [delayInputDraft, setDelayInputDraft] = useState<string>(() =>
    String(settings.readerAutoTranslateNextDelaySec ?? READER_AUTO_TRANSLATE_DEFAULT_DELAY_SEC)
  );
  const lastChapterIndexRef = useRef(-1);
  const pendingNavKindRef = useRef<ChapterNavKind | null>(null);
  const dwellTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoTranslateHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDelayInputDraft(
      String(settings.readerAutoTranslateNextDelaySec ?? READER_AUTO_TRANSLATE_DEFAULT_DELAY_SEC)
    );
  }, [settings.readerAutoTranslateNextDelaySec]);

  const applyReaderAutoTranslatePreset = (mode: "saving" | "balanced" | "continuous") => {
    if (mode === "saving") {
      onUpdateSettings({
        ...settings,
        readerAutoTranslateNextEnabled: false,
        readerAutoTranslateNextDelaySec: 60,
      });
      return;
    }
    if (mode === "balanced") {
      onUpdateSettings({
        ...settings,
        readerAutoTranslateNextEnabled: true,
        readerAutoTranslateNextDelaySec: 45,
      });
      return;
    }
    onUpdateSettings({
      ...settings,
      readerAutoTranslateNextEnabled: true,
      readerAutoTranslateNextDelaySec: 25,
    });
  };

  useEffect(() => {
    resetReaderAutoTranslateSession();
    lastChapterIndexRef.current = -1;
    const persisted = loadReaderSequentialState(activeNovel.id);
    setSequentialArmed(persisted?.armed === true);
  }, [activeNovel.id]);

  useEffect(() => {
    if (!activeNovel.id || !activeChapterId) return;
    saveReaderSequentialState(activeNovel.id, sequentialArmed, activeChapterId);
  }, [sequentialArmed, activeNovel.id, activeChapterId]);

  const goToChapter = useCallback(
    (chapterId: string, navKind?: ChapterNavKind) => {
      const toIdx = activeNovel.chapters.findIndex((c) => c.id === chapterId);
      if (toIdx < 0) return;
      pendingNavKindRef.current =
        navKind ?? resolveChapterNavKind(lastChapterIndexRef.current, toIdx);
      onChapterSelect(chapterId);
    },
    [activeNovel.chapters, onChapterSelect]
  );

  useEffect(() => {
    if (!activeChapterId || activeChapIdx < 0) return;

    const kind =
      pendingNavKindRef.current ??
      resolveChapterNavKind(lastChapterIndexRef.current, activeChapIdx);
    pendingNavKindRef.current = null;
    lastChapterIndexRef.current = activeChapIdx;

    if (shouldArmSequentialAfterNav(kind)) {
      setSequentialArmed(true);
    } else if (kind === "jump" || kind === "initial") {
      setSequentialArmed(false);
    }
  }, [activeChapterId, activeChapIdx]);

  const clearDwellTimer = useCallback(() => {
    if (dwellTimerRef.current) {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = null;
    }
  }, []);

  const showAutoHint = useCallback((message: string, ms = 4000) => {
    setAutoTranslateHint(message);
    if (autoTranslateHintTimerRef.current) {
      clearTimeout(autoTranslateHintTimerRef.current);
    }
    autoTranslateHintTimerRef.current = setTimeout(() => {
      setAutoTranslateHint(null);
      autoTranslateHintTimerRef.current = null;
    }, ms);
  }, []);

  useEffect(() => {
    clearDwellTimer();

    const cfg = settingsRef.current;
    const saveFn = onChapterTranslatedRef.current;
    if (!saveFn || !currentChapter || !isReaderAutoTranslateEnabled(cfg)) return;

    const canDwell = canAccumulateDwellTime({
      enabled: true,
      isReaderTabActive,
      sequentialArmed,
      documentHidden: typeof document !== "undefined" ? document.hidden : false,
      chapterDrawerOpen: showChapterDrawer,
      settingsOpen: showSettings,
    });

    if (!canDwell) return;
    if (activeChapIdx < 0 || activeChapIdx >= activeNovel.chapters.length - 1) return;

    const nextCh = activeNovel.chapters[activeChapIdx + 1];
    if (nextCh.translatedText?.trim()) return;

    const delayMs = getAutoTranslateDelaySec(cfg) * 1000;
    const sourceChapter = currentChapter;
    const novelSnapshot = activeNovel;

    dwellTimerRef.current = setTimeout(() => {
      void (async () => {
        const stillEnabled = isReaderAutoTranslateEnabled(settingsRef.current);
        if (!stillEnabled || !onChapterTranslatedRef.current) return;

        showAutoHint(rs.autoTranslate.translating(nextCh.title));
        const dictContext = buildDictContextString({
          dictItems: dictItemsRef.current,
          pronounMappings: pronounMappingsRef.current,
          novelId: novelSnapshot.id,
        });

        const result = await runAutoTranslateNextChapter({
          novel: novelSnapshot,
          sourceChapter,
          settings: settingsRef.current,
          apiKeys: settingsRef.current.apiKeys,
          dictContext,
          onChapterTranslated: onChapterTranslatedRef.current,
        });

        if (result.ok === false) {
          const failReason = result.reason;
          if (
            failReason !== "no-next" &&
            failReason !== "already-translated" &&
            failReason !== "already-scheduled" &&
            failReason !== "in-flight"
          ) {
            showAutoHint(rs.autoTranslate.failed(failReason), 6000);
          }
        } else {
          showAutoHint(rs.autoTranslate.done);
        }
      })();
    }, delayMs);

    return clearDwellTimer;
  }, [
    activeChapterId,
    activeChapIdx,
    activeNovel,
    currentChapter,
    sequentialArmed,
    isReaderTabActive,
    showChapterDrawer,
    showSettings,
    clearDwellTimer,
    showAutoHint,
  ]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) clearDwellTimer();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [clearDwellTimer]);

  useEffect(
    () => () => {
      clearDwellTimer();
      if (autoTranslateHintTimerRef.current) {
        clearTimeout(autoTranslateHintTimerRef.current);
      }
    },
    [clearDwellTimer]
  );

  const isFullyTranslated = !!(currentChapter?.translatedText && currentChapter.translatedText.trim());

  const skipDomMeasure =
    Capacitor.isNativePlatform() || (typeof window !== "undefined" && window.innerWidth < 1024);

  const resolvePagesWithCache = useCallback(
    (cacheKey: string, text: string, h: number, w: number, opts: PaginateOptions) => {
      const cached = paginationCacheRef.current.get(cacheKey);
      if (cached) return cached;
      const computed = paginateChapter(text, settings, h, w, opts);
      paginationCacheRef.current.set(cacheKey, computed);
      if (paginationCacheRef.current.size > 24) {
        const oldest = paginationCacheRef.current.keys().next().value;
        if (oldest) paginationCacheRef.current.delete(oldest);
      }
      return computed;
    },
    [settings]
  );

  const runPagination = useCallback(() => {
    if (!currentChapter) {
      setPages([]);
      return;
    }
    const textToPaginate = isFullyTranslated
      ? (currentChapter.translatedText || "")
      : (currentChapter.sourceText || "");
    const reserveBanner = !isFullyTranslated;
    const baseOpts: PaginateOptions = {
      widthIsContentBox: true,
      heightReservePx: reserveBanner ? 44 : 0,
      skipDomMeasure,
    };

    let h = 600;
    let w = 800;
    if (readMode === "page") {
      h = pageViewport.quantizedHeight;
      if (readerTextMayShowInlineTranslateAction(textToPaginate)) {
        h = Math.max(pageViewport.exactLineHeightPx, h - pageViewport.exactLineHeightPx);
      }
      w = pageViewport.width;
    }

    const baseKey = [
      currentChapter.id,
      textToPaginate.length,
      textToPaginate.slice(0, 64),
      textToPaginate.slice(-64),
      readMode,
      h,
      w,
      settings.readerFont,
      settings.readerFontSize,
      settings.readerLineHeight,
      settings.readerParagraphSpacing,
      settings.readerAlignment,
      settings.readerPaddingX ?? 12,
      settings.readerWidth,
      settings.readerFillPercent ?? 90,
      reserveBanner ? "r1" : "r0",
      skipDomMeasure ? "fast" : "mix",
    ].join("|");

    setPages(resolvePagesWithCache(baseKey, textToPaginate, h, w, baseOpts));

    if (skipDomMeasure) return;

    const domOpts: PaginateOptions = {
      ...baseOpts,
      measureRoot: paginationMeasureRef.current,
    };
    if (domPaginateIdleRef.current !== null) {
      cancelIdleCallback(domPaginateIdleRef.current);
    }
    const domKey = `${baseKey}|dom`;
    domPaginateIdleRef.current = requestIdleCallback(
      () => {
        domPaginateIdleRef.current = null;
        setPages(resolvePagesWithCache(domKey, textToPaginate, h, w, domOpts));
      },
      { timeout: 1200 }
    );
  }, [
    currentChapter?.id,
    currentChapter?.translatedText,
    currentChapter?.sourceText,
    settings.readerFontSize,
    settings.readerLineHeight,
    settings.readerParagraphSpacing,
    settings.readerFont,
    settings.readerAlignment,
    settings.readerPaddingX,
    settings.readerWidth,
    settings.readerFillPercent,
    readMode,
    isMobile,
    isFullyTranslated,
    skipDomMeasure,
    resolvePagesWithCache,
    pageViewport.quantizedHeight,
    pageViewport.width,
  ]);

  const paginationKey = React.useMemo(
    () =>
      `${pageViewport.width}x${pageViewport.quantizedHeight}x${pageViewport.targetHeight}x${pageViewport.exactLineHeightPx}x${settings.readerWidth}x${settings.readerPaddingX}x${settings.readerFillPercent}x${settings.readerFontSize}x${settings.readerLineHeight}x${settings.readerAlignment}`,
    [
      pageViewport.width,
      pageViewport.quantizedHeight,
      pageViewport.targetHeight,
      pageViewport.exactLineHeightPx,
      settings.readerWidth,
      settings.readerPaddingX,
      settings.readerFillPercent,
      settings.readerFontSize,
      settings.readerLineHeight,
      settings.readerAlignment,
    ]
  );

  useEffect(() => {
    if (!currentChapter) {
      setPages([]);
      return;
    }
    if (paginationDebounceRef.current) {
      clearTimeout(paginationDebounceRef.current);
    }
    paginationDebounceRef.current = setTimeout(runPagination, 220);
    return () => {
      if (paginationDebounceRef.current) {
        clearTimeout(paginationDebounceRef.current);
        paginationDebounceRef.current = null;
      }
      if (domPaginateIdleRef.current !== null) {
        cancelIdleCallback(domPaginateIdleRef.current);
        domPaginateIdleRef.current = null;
      }
    };
  }, [currentChapter?.id, readMode, runPagination, paginationKey]);

  pagesRef.current = pages;
  translatedPagesRef.current = translatedPages;
  currentPageIndexRef.current = currentPageIndex;

  const stableTranslatedPageCacheRef = useRef<Record<string, Record<number, string>>>({});

  const getStablePageTranslation = (chapterId: string, pageIdx: number): string => {
    const live = translatedPages[pageIdx]?.trim() ?? "";
    if (live) {
      if (!stableTranslatedPageCacheRef.current[chapterId]) {
        stableTranslatedPageCacheRef.current[chapterId] = {};
      }
      stableTranslatedPageCacheRef.current[chapterId][pageIdx] = live;
      return live;
    }
    return stableTranslatedPageCacheRef.current[chapterId]?.[pageIdx]?.trim() ?? "";
  };

  const currentPageDisplayText = currentChapter
    ? isFullyTranslated
      ? ""
      : getStablePageTranslation(currentChapter.id, currentPageIndex)
    : "";

  const hasCurrentPageContent = (pages[currentPageIndex]?.paragraphs?.length ?? 0) > 0;

  const currentPageHasInlineTranslateAction = React.useMemo(() => {
    const paras = pages[currentPageIndex]?.paragraphs ?? [];
    return paras.some((p) => p?.text && paragraphMayShowInlineTranslateAction(p.text));
  }, [pages, currentPageIndex]);

  const pageColumnQuantizedHeightPx = React.useMemo(() => {
    const safetyPx = currentPageHasInlineTranslateAction ? pageViewport.exactLineHeightPx : 0;
    return Math.max(pageViewport.exactLineHeightPx, pageViewport.quantizedHeight - safetyPx);
  }, [pageViewport.quantizedHeight, pageViewport.exactLineHeightPx, currentPageHasInlineTranslateAction]);

  const pageColumnBufferedHeightPx = React.useMemo(
    () => pageColumnQuantizedHeightPx + 2,
    [pageColumnQuantizedHeightPx]
  );

  const pageColumnCssVars = React.useMemo(
    () =>
      ({
        ["--exact-lh" as string]: `${pageViewport.exactLineHeightPx}px`,
        ["--max-h" as string]: `${pageColumnBufferedHeightPx}px`,
      }) as React.CSSProperties,
    [pageViewport.exactLineHeightPx, pageColumnBufferedHeightPx]
  );

  const nativeParagraphStyle = React.useMemo(
    () => buildReaderNativeParagraphStyle(settings, pageViewport.exactLineHeightPx),
    [settings, pageViewport.exactLineHeightPx]
  );

  const updatePageViewport = useCallback(() => {
    if (readMode !== "page") return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rawWrapperWidth = Math.max(260, Math.floor(wrapper.clientWidth));
    const rawHeight = Math.max(200, Math.floor(wrapper.clientHeight));
    const fillLevel = Math.max(87, Math.min(100, settings.readerFillPercent ?? 90));
    const targetHeight = Math.max(200, Math.floor(rawHeight * (fillLevel / 100)));
    const fontSizePx = Math.max(12, settings.readerFontSize || 16);
    const lineHeightRatio = Math.max(1, settings.readerLineHeight || 1.6);
    const integerLineHeight = Math.max(1, Math.round(fontSizePx * lineHeightRatio));
    const maxLines = Math.max(1, Math.floor(targetHeight / integerLineHeight));
    const quantizedHeight = maxLines * integerLineHeight;
    const padX = Math.max(0, Math.min(48, settings.readerPaddingX ?? 12));
    const columnWidth = Math.max(220, rawWrapperWidth - padX * 2);
    const next: ReaderPageViewport = {
      width: columnWidth,
      height: quantizedHeight,
      outerWidth: rawWrapperWidth,
      outerHeight: rawHeight,
      padX,
      padY: 0,
      padTop: 0,
      padBottom: 0,
      rawAvailableHeight: rawHeight,
      targetHeight,
      quantizedHeight,
      exactLineHeightPx: integerLineHeight,
      columnWidthPx: columnWidth,
    };
    setPageViewport((prev) => (readerPageViewportsEqual(prev, next) ? prev : next));
  }, [
    readMode,
    settings.readerPaddingX,
    settings.readerFontSize,
    settings.readerLineHeight,
    settings.readerFillPercent,
  ]);

  useLayoutEffect(() => {
    if (readMode !== "page") return;
    updatePageViewport();
    const ro =
      typeof ResizeObserver !== "undefined" && wrapperRef.current
        ? new ResizeObserver(() => updatePageViewport())
        : null;
    if (ro && wrapperRef.current) ro.observe(wrapperRef.current);
    return () => {
      ro?.disconnect();
    };
  }, [readMode, updatePageViewport]);

  const isPageLayout = readMode === "page";
  const barsOverlay = isMobile && isPageLayout;
  const readerTheme = getReaderThemeTokens(normalizeReaderTheme(settings.theme));

  useEffect(() => {
    void applyReaderSystemChrome(normalizeReaderTheme(settings.theme));
  }, [settings.theme]);

  const pageFrameStyle: React.CSSProperties = isPageLayout
    ? {
        width: pageViewport.outerWidth,
        height: pageViewport.outerHeight,
        paddingLeft: pageViewport.padX,
        paddingRight: pageViewport.padX,
        paddingTop: `${pageViewport.padTop}px`,
        paddingBottom: `${pageViewport.padBottom}px`,
        boxSizing: "border-box"
      }
    : {
        width: `${settings.readerWidth}%`,
        margin: "0 auto",
        paddingLeft: settings.readerPaddingX !== undefined ? settings.readerPaddingX : 12,
        paddingRight: settings.readerPaddingX !== undefined ? settings.readerPaddingX : 12,
        paddingTop: 24,
        paddingBottom: 24
      };

  useEffect(() => {
    setShowBarsOnMobile(false);
    setShowChapterDrawer(false);
  }, [activeNovel.id, activeChapterId]);

  // Quay lại Phòng Đọc Sách: khôi phục đúng chương + trang đã lưu
  useEffect(() => {
    if (!isReaderTabActive) {
      readerTabWasActiveRef.current = false;
      return;
    }
    if (readerTabWasActiveRef.current) return;
    readerTabWasActiveRef.current = true;
    if (!activeChapterId || !activeNovel) return;

    ignoreResetPageRef.current = true;
    let savedPage = activeNovel.lastReadPageIndex;
    try {
      const pageStr = localStorage.getItem(`last_read_page_${activeNovel.id}`);
      if (pageStr !== null) {
        savedPage = Number(pageStr);
      }
    } catch {
      /* ignore */
    }
    if (savedPage !== undefined && savedPage >= 0) {
      setCurrentPageIndex(savedPage);
    }
  }, [isReaderTabActive, activeChapterId, activeNovel?.id]);

  // Rời Phòng Đọc: lưu ngay cache trang đã dịch lên thiết bị
  useEffect(() => {
    if (isReaderTabActive) return;
    if (!currentChapter?.id) return;
    const snapshot = translatedPagesRef.current;
    if (snapshot.length > 0) {
      saveValue(`page_trans_${currentChapter.id}`, snapshot).catch(() => {});
    }
  }, [isReaderTabActive, currentChapter?.id]);

  const totalPages = pages.length || 1;

  // Đồng bộ mảng bản dịch từng trang — tách đổi chương vs đổi phân trang, chống ghi đè race async
  useEffect(() => {
    if (!currentChapter) return;

    if (currentChapter.translatedText?.trim()) {
      setTranslatedPages((prev) => (prev.length === 0 ? prev : []));
      return;
    }

    if (pages.length === 0) return;

    const chapterChanged = syncMetaRef.current.chapterId !== currentChapter.id;
    const paginationChanged = syncMetaRef.current.paginationKey !== paginationKey;
    syncMetaRef.current = { chapterId: currentChapter.id, paginationKey };

    const generation = ++syncGenerationRef.current;

    const applyMerged = (incoming: string[] | null | undefined) => {
      if (generation !== syncGenerationRef.current) return;
      setTranslatedPages((prev) => {
        const merged = mergePageTranslationArrays(prev, incoming, pages.length);
        const chId = currentChapter.id;
        if (!stableTranslatedPageCacheRef.current[chId]) {
          stableTranslatedPageCacheRef.current[chId] = {};
        }
        merged.forEach((text, i) => {
          if (text?.trim()) {
            stableTranslatedPageCacheRef.current[chId][i] = text;
          }
        });
        return pageTranslationArraysEqual(prev, merged) ? prev : merged;
      });
    };

    if (chapterChanged) {
      translateInFlightRef.current.clear();
      let cancelled = false;
      (async () => {
        try {
          const saved = await getValue(`page_trans_${currentChapter.id}`);
          if (cancelled || generation !== syncGenerationRef.current) return;
          if (saved && Array.isArray(saved)) {
            applyMerged(saved);
          } else {
            applyMerged(null);
          }
        } catch (e) {
          console.error("Lỗi khi tải trang dịch ngầm đã lưu:", e);
          if (!cancelled) applyMerged(null);
        }
      })();
      return () => {
        cancelled = true;
      };
    }

    if (paginationChanged) {
      applyMerged(translatedPagesRef.current);
    }
  }, [currentChapter?.id, currentChapter?.translatedText, paginationKey, pages.length]);

  // Tiêu đề: ưu tiên translatedTitle từ Lab; fallback cache local + translatePhrase (legacy)
  useEffect(() => {
    if (!currentChapter?.title || !currentChapter.id) return;

    const originalTitle = currentChapter.title;
    if (currentChapter.translatedTitle?.trim()) {
      setChapterTranslations((prev) => {
        if (prev[originalTitle] === currentChapter.translatedTitle) return prev;
        const updated = { ...prev, [originalTitle]: currentChapter.translatedTitle! };
        try {
          localStorage.setItem("reader_chapter_title_translations", JSON.stringify(updated));
        } catch {
          /* ignore */
        }
        return updated;
      });
      return;
    }

    const requestKey = `${currentChapter.id}::${currentChapter.title}`;
    if (chapterTitleRequestedRef.current.has(requestKey)) return;

    const cachedCombined = chapterTranslations[originalTitle];
    const hasChinese = cachedCombined ? /[\u4e00-\u9fa5]/.test(cachedCombined) : false;
    if (cachedCombined && !hasChinese) {
      chapterTitleRequestedRef.current.add(requestKey);
      return;
    }

    chapterTitleRequestedRef.current.add(requestKey);

    const translateTitle = async () => {
      const cfg = settingsRef.current;
      const keys = apiKeysRef.current;
      try {
        const numMatch = originalTitle.match(/第\s*([零一二两三四五六七八九十百千万〇\dO]+)\s*章/);
        let leadingPart = "";
        let restPart = originalTitle;
        if (numMatch) {
          const numStr = numMatch[1];
          const parsedNum = parseChineseNumerals(numStr);
          leadingPart = `Chương ${parsedNum}: `;
          restPart = originalTitle.replace(numMatch[0], "").trim();
        }

        if (!restPart.trim()) {
          const finalTitle = leadingPart.trim();
          setChapterTranslations((prev) => {
            const updated = { ...prev, [originalTitle]: finalTitle };
            try {
              localStorage.setItem("reader_chapter_title_translations", JSON.stringify(updated));
            } catch {
              /* ignore */
            }
            return updated;
          });
          return;
        }

        let translatedRest = await translatePhrase(restPart, { ...cfg, apiKeys: keys });

        const hasChineseTrans = /[\u4e00-\u9fa5]/.test(translatedRest);
        if (translatedRest && !hasChineseTrans) {
          translatedRest = translatedRest.charAt(0).toUpperCase() + translatedRest.slice(1);
        } else {
          translatedRest = getHanVietOffline(restPart, "", dictItems, pronounMappings);
        }

        const finalTitle = (leadingPart + translatedRest).trim();
        setChapterTranslations((prev) => {
          const updated = { ...prev, [originalTitle]: finalTitle };
          try {
            localStorage.setItem("reader_chapter_title_translations", JSON.stringify(updated));
          } catch {
            /* ignore */
          }
          return updated;
        });
      } catch (err) {
        console.error("Lỗi khi dịch tiêu đề chương:", err);
        const hv = getHanVietOffline(originalTitle, "", dictItems, pronounMappings);
        setChapterTranslations((prev) => ({ ...prev, [originalTitle]: hv }));
      }
    };

    translateTitle();
  }, [currentChapter?.id, currentChapter?.title, dictItems, pronounMappings]);

  const isPageCached = async (chapterId: string, pageIdx: number): Promise<boolean> => {
    if (chapterId === currentChapter?.id && translatedPagesRef.current[pageIdx]?.trim()) {
      return true;
    }
    try {
      const saved = await getValue(`page_trans_${chapterId}`);
      return !!(saved && Array.isArray(saved) && saved[pageIdx]?.trim());
    } catch {
      return false;
    }
  };

  /** Lab-first: dịch chương chỉ qua Lab (translateChapter), không gọi API theo trang. */
  const translatePageOnDemand = async (
    _targetChapterId: string,
    _pageIdx: number,
    _chinesePagesList: ReturnType<typeof paginateChapter>,
    _options?: { isPrefetch?: boolean }
  ): Promise<void> => {};

  const resolveNextPrefetchTarget = (): {
    chapterId: string;
    pageIndex: number;
    pagesList: ReturnType<typeof paginateChapter>;
  } | null => {
    if (!currentChapter || currentChapter.translatedText?.trim()) return null;

    const currentPages = pagesRef.current;
    const nextInChapter = currentPageIndex + 1;
    if (nextInChapter < currentPages.length) {
      return {
        chapterId: currentChapter.id,
        pageIndex: nextInChapter,
        pagesList: currentPages
      };
    }

    if (activeChapIdx < 0 || activeChapIdx >= activeNovel.chapters.length - 1) return null;
    const nextChapter = activeNovel.chapters[activeChapIdx + 1];
    if (nextChapter.translatedText?.trim()) return null;

    const nextPages = paginateChapter(
      nextChapter.sourceText || "",
      settingsRef.current,
      pageViewport.height,
      pageViewport.width,
      buildPaginateOpts(true)
    );
    if (nextPages.length === 0) return null;

    return {
      chapterId: nextChapter.id,
      pageIndex: 0,
      pagesList: nextPages
    };
  };

  // Khôi phục số trang khi ĐỔI CHƯƠNG — không chạy lại khi lưu tiến độ đọc (activeNovel cập nhật)
  useEffect(() => {
    if (!activeChapterId || !activeNovel) return;

    setPageTranslationError(null);
    translateInFlightRef.current.clear();
    translateRequestRef.current = { chapterId: "", pageIndex: -1 };

    if (ignoreResetPageRef.current) {
      ignoreResetPageRef.current = false;
      return;
    }

    let savedChId = activeNovel.lastReadChapterId;
    try {
      if (!savedChId) {
        savedChId =
          localStorage.getItem(`last_read_chapter_${activeNovel.id}`) ||
          localStorage.getItem(`last_read_progress_${activeNovel.id}`) ||
          "";
      }
    } catch {
      /* ignore */
    }

    let targetPage = 0;
    if (savedChId === activeChapterId) {
      let savedPage = activeNovel.lastReadPageIndex;
      if (savedPage === undefined) {
        try {
          const pageStr = localStorage.getItem(`last_read_page_${activeNovel.id}`);
          if (pageStr !== null) {
            savedPage = Number(pageStr);
          }
        } catch {
          /* ignore */
        }
      }
      if (savedPage !== undefined && savedPage >= 0) {
        targetPage = savedPage;
      }
    }

    setCurrentPageIndex(targetPage);
  }, [activeChapterId]);

  useEffect(() => {
    if (pages.length === 0) return;
    setCurrentPageIndex((idx) => (idx >= pages.length ? Math.max(0, pages.length - 1) : idx));
  }, [pages.length]);

  // Lab-first: không tự gọi API dịch theo trang / prefetch (tiết kiệm RPM-RPD, khớp dòng Lab).

  const resetTranslateRequest = () => {
    translateRequestRef.current = { chapterId: "", pageIndex: -1 };
  };

  const handleNextPage = () => {
    if (readMode === "scroll") {
      nextChapter();
      return;
    }

    if (currentPageIndex < totalPages - 1) {
      resetTranslateRequest();
      setCurrentPageIndex(currentPageIndex + 1);
    } else {
      if (activeChapIdx < activeNovel.chapters.length - 1) {
        const nextCh = activeNovel.chapters[activeChapIdx + 1];
        ignoreResetPageRef.current = false;
        goToChapter(nextCh.id, "adjacent-next");
        setCurrentPageIndex(0);
      }
    }
  };

  const handleSelectChapterFromDrawer = (chapterId: string) => {
    if (chapterId === activeChapterId) {
      setShowChapterDrawer(false);
      return;
    }
    setShowChapterDrawer(false);
    syncMetaRef.current = { chapterId: "", paginationKey: "" };
    syncGenerationRef.current += 1;
    translateInFlightRef.current.clear();
    translateRequestRef.current = { chapterId: "", pageIndex: -1 };
    ignoreResetPageRef.current = true;
    setPageTranslationError(null);
    setCurrentPageIndex(0);
    goToChapter(chapterId, "jump");
  };

  const handlePrevPage = () => {
    if (readMode === "scroll") {
      prevChapter();
      return;
    }

    if (currentPageIndex > 0) {
      resetTranslateRequest();
      setCurrentPageIndex(currentPageIndex - 1);
    } else {
      if (activeChapIdx > 0) {
        const prevCh = activeNovel.chapters[activeChapIdx - 1];
        ignoreResetPageRef.current = true;
        goToChapter(prevCh.id, "adjacent-prev");
        
        const prevText = prevCh.translatedText || prevCh.sourceText;
        const prevPages = paginateChapter(
          prevText,
          settings,
          pageViewport.height,
          pageViewport.width,
          buildPaginateOpts(!prevCh.translatedText?.trim())
        );
        setCurrentPageIndex(prevPages.length > 0 ? prevPages.length - 1 : 0);
      }
    }
  };
  
  // Handle touch swipe and tap gestures for mobile devices
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches.length !== 1) return;
    const startX = e.touches[0].clientX;
    const startY = e.touches[0].clientY;
    const screenW = window.visualViewport?.width ?? window.innerWidth;
    const fromRightEdge = startX >= screenW - 48;
    touchStartRef.current = {
      x: startX,
      y: startY,
      time: Date.now(),
      fromRightEdge,
    };

  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!touchStartRef.current) return;

    const touchStart = touchStartRef.current;
    const touchEnd = {
      x: e.changedTouches[0].clientX,
      y: e.changedTouches[0].clientY,
      time: Date.now()
    };

    const deltaX = touchEnd.x - touchStart.x;
    const deltaY = touchEnd.y - touchStart.y;
    const duration = touchEnd.time - touchStart.time;

    const absDeltaX = Math.abs(deltaX);
    const absDeltaY = Math.abs(deltaY);

    touchStartRef.current = null;

    const minSwipeDistance = 35;

    // Vuốt từ mép phải sang trái → quay về giao diện mẹ
    if (
      touchStart.fromRightEdge &&
      deltaX < -minSwipeDistance &&
      absDeltaX > absDeltaY
    ) {
      if (window.history.state && (window.history.state.isDetail || window.history.state.isTab)) {
        window.history.back();
      } else if (onBack) {
        onBack();
      }
      return;
    }

    // 1. Swipe gesture check (lật trang)
    if (absDeltaX > minSwipeDistance || absDeltaY > minSwipeDistance) {
      const swipeDir = settings.readerSwipeDirection || "horizontal";

      if (swipeDir === "horizontal") {
        if (absDeltaX > absDeltaY && absDeltaX > minSwipeDistance) {
          if (deltaX > 0) {
            // Swipe right -> Prev page
            handlePrevPage();
          } else {
            // Swipe left -> Next page
            handleNextPage();
          }
          return;
        }
      } else {
        // Vertical swipe
        if (absDeltaY > absDeltaX && absDeltaY > minSwipeDistance) {
          if (deltaY > 0) {
            // Swipe down -> Prev page
            handlePrevPage();
          } else {
            // Swipe up -> Next page
            handleNextPage();
          }
          return;
        }
      }
    }

    // 2. Tap gesture: bật/tắt menu trên–dưới (không khi đang bôi chữ / toolbar)
    const selectedSnippet = window.getSelection()?.toString().trim() ?? "";
    if (absDeltaX < 8 && absDeltaY < 8 && duration < 300) {
      if (showSelectionToolbar || showQuickAddMenu) {
        closeReaderSelectionUi();
        return;
      }
      if (selectedSnippet.length > 0 && selectedSnippet.length <= 120) {
        return;
      }
      if (isMobile && !showChapterDrawer && !showSettings && !showQuickAddMenu) {
        setShowBarsOnMobile((prev) => {
          const next = !prev;
          if (!next) setShowSettings(false);
          return next;
        });
      }
    }
  };
  
  // Selection/Quick-add State
  const [selectedText, setSelectedText] = useState("");
  const [chineseParagraph, setChineseParagraph] = useState("");
  const [chineseWord, setChineseWord] = useState("");
  const [vietnameseWord, setVietnameseWord] = useState("");
  const [dictScope, setDictScope] = useState<"riêng" | "chung">("riêng");
  const [lookupSource, setLookupSource] = useState<BilingualLookupSource | "api" | "dict-name">("none");
  const [bilingualLineHint, setBilingualLineHint] = useState<number | null>(null);
  const [isTranslatingPhrase, setIsTranslatingPhrase] = useState(false);
  const [isApiKeyExpired, setIsApiKeyExpired] = useState(false);
  const [showQuickAddMenu, setShowQuickAddMenu] = useState(false);
  const [showSelectionToolbar, setShowSelectionToolbar] = useState(false);
  const [selectionToolbarPos, setSelectionToolbarPos] = useState({ x: 0, y: 0 });
  const [quickAddCoords, setQuickAddCoords] = useState<{ x: number; y: number; alignBottom?: boolean }>({ x: 0, y: 0, alignBottom: false });
  const activeChapterRowRef = useRef<HTMLButtonElement | null>(null);
  const [selectionParagraphText, setSelectionParagraphText] = useState("");
  const [selectionVietnameseLine, setSelectionVietnameseLine] = useState("");
  const [rawSelectedText, setRawSelectedText] = useState("");
  const [expandedFromPartialName, setExpandedFromPartialName] = useState(false);
  const [popupLexMode, setPopupLexMode] = useState<"vp" | "hv">("vp");
  const [dictSaveAsName, setDictSaveAsName] = useState(true);
  const selectionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionPointerActiveRef = useRef(false);
  const lastCapturedSelectionRef = useRef<{ text: string; rect: DOMRect } | null>(null);

  const hasLabBilingualChapter = !!(
    currentChapter?.translatedText?.trim() && currentChapter?.sourceText?.trim()
  );

  const closeReaderSelectionUi = useCallback(() => {
    setShowSelectionToolbar(false);
    setShowQuickAddMenu(false);
    window.getSelection()?.removeAllRanges();
  }, []);

  const hasReaderTextSelection = (text: string) => {
    const t = text.trim();
    if (t.length < 2) return false;
    return /\p{L}/u.test(t);
  };

  const showSelectionToolbarAt = (rect: DOMRect) => {
    const fontSize = settings.readerFontSize || 16;
    const lineHeight = settings.readerLineHeight || 1.6;
    const linePx = fontSize * lineHeight;
    const gapAbove = linePx * 1.75 + 8;
    const toolbarH = 44;
    const cx = Math.min(window.innerWidth - 72, Math.max(72, rect.left + rect.width / 2));
    let top = rect.top - gapAbove - toolbarH;
    if (top < 12) {
      top = rect.bottom + linePx * 0.5;
    }
    top = Math.max(8, Math.min(window.innerHeight - toolbarH - 16, top));
    setSelectionToolbarPos({ x: cx, y: top });
    setShowSelectionToolbar(true);
  };

  const revealSelectionToolbar = (selection?: Selection | null) => {
    let toolbarRect: DOMRect | null = null;
    if (selection && selection.rangeCount > 0) {
      try {
        toolbarRect = selection.getRangeAt(0).getBoundingClientRect();
      } catch {
        toolbarRect = null;
      }
    }
    if ((!toolbarRect || (toolbarRect.width === 0 && toolbarRect.height === 0)) && lastCapturedSelectionRef.current) {
      toolbarRect = lastCapturedSelectionRef.current.rect;
    }
    if (toolbarRect && (toolbarRect.width > 0 || toolbarRect.height > 0)) {
      showSelectionToolbarAt(toolbarRect);
    }
  };

  const openSelectionPopup = (selection?: Selection | null) => {
    setShowSelectionToolbar(false);

    let rect: DOMRect | null = null;
    if (selection && selection.rangeCount > 0) {
      try {
        rect = selection.getRangeAt(0).getBoundingClientRect();
      } catch {
        rect = null;
      }
    }

    if (isMobile) {
      setQuickAddCoords({ x: 0, y: 0, alignBottom: true });
      setShowQuickAddMenu(true);
      return;
    }

    if (!rect) {
      setQuickAddCoords({ x: 0, y: 0, alignBottom: true });
      setShowQuickAddMenu(true);
      return;
    }

    const panel = document.getElementById("reader-view-panel");
    if (panel) {
      const panelRect = panel.getBoundingClientRect();
      const relativeX = rect.left - panelRect.left;
      const relativeY = rect.bottom - panelRect.top;

      const popupWidth = 350;
      let targetX = relativeX - popupWidth / 2;

      if (targetX + popupWidth > panelRect.width - 20) {
        targetX = panelRect.width - popupWidth - 20;
      }
      if (targetX < 10) {
        targetX = 10;
      }

      const popupHeight = 580;
      let targetY = relativeY + 10;
      let alignBottom = false;

      if (targetY + popupHeight > panelRect.height - 25) {
        const relativeSelectionTop = rect.top - panelRect.top;
        if (relativeSelectionTop - popupHeight - 10 > 60) {
          targetY = relativeSelectionTop - popupHeight - 10;
        } else {
          alignBottom = true;
        }
      }

      if (!alignBottom) {
        if (targetY < 60) {
          targetY = 60;
        }
        if (targetY + popupHeight > panelRect.height - 15) {
          alignBottom = true;
        }
      }

      setQuickAddCoords({
        x: Math.round(targetX),
        y: Math.round(targetY),
        alignBottom,
      });
    } else {
      setQuickAddCoords({
        x: Math.round(rect.left - 175),
        y: Math.round(rect.bottom + 10),
        alignBottom: false,
      });
    }
    setShowQuickAddMenu(true);
  };

  const handleOpenDictPopupFromToolbar = () => {
    setShowSelectionToolbar(false);
    openSelectionPopup();
    window.getSelection()?.removeAllRanges();
  };

  const applyWholeLabLineToSelection = () => {
    const viLine = (selectionVietnameseLine || selectionParagraphText).trim();
    if (!viLine || !hasLabBilingualChapter) {
      alert(rs.alerts.noLabBilingualLine);
      return;
    }
    const chapterSource = currentChapter?.sourceText?.trim() || "";
    const chapterTranslated = currentChapter?.translatedText?.trim() || "";
    const hit = resolveLabBilingualSelection({
      selectedVietnamese: viLine,
      rawSelectedVietnamese: rawSelectedText || viLine,
      lineText: viLine,
      context: {
        sourceText: chapterSource,
        translatedText: chapterTranslated,
        dictItems,
        novelId: activeNovel.id,
      },
      skipNameExpand: true,
    });
    if (!hit) {
      alert(rs.alerts.noLabLineMatch);
      return;
    }
    setSelectedText(hit.vietnamese);
    setVietnameseWord(hit.vietnamese);
    setChineseWord(hit.chinese);
    setChineseParagraph(hit.chineseLine || hit.chinese);
    setSelectionVietnameseLine(hit.vietnameseLine);
    setLookupSource(hit.lookupSource);
    setBilingualLineHint(hit.lineIndex);
    setDictSaveAsName(true);
  };

  const handleQuickDictFromToolbar = () => {
    const vi = vietnameseWord.trim();
    if (!isProperNamePhrase(vi)) {
      alert(rs.alerts.dictProperNameOnly);
      return;
    }
    if (!hasLabBilingualChapter) {
      alert(rs.alerts.chapterNeedsLab);
      return;
    }
    const zh = chineseWord.trim();
    if (!zh || zh === rs.lookup.searching) {
      alert(rs.alerts.chineseUnknown);
      return;
    }
    onAddDictWord(zh, vi, "name", activeNovel.id);
    closeReaderSelectionUi();
    alert(rs.alerts.dictAdded(zh, vi));
  };

  const canQuickDictFromToolbar =
    hasLabBilingualChapter &&
    isProperNamePhrase(vietnameseWord) &&
    !!chineseWord.trim() &&
    chineseWord.trim() !== rs.lookup.searching;

  useEffect(() => {
    if (!showChapterDrawer || !activeChapterId) return;
    const frame = requestAnimationFrame(() => {
      activeChapterRowRef.current?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [showChapterDrawer, activeChapterId]);

  const [isTranslatingParagraphId, setIsTranslatingParagraphId] = useState<number | null>(null);

  const handleTranslateParagraph = async (index: number, vietnameseParagraphText: string) => {
    let sourcePara = "";
    if (vietnameseParagraphText && /[\u4e00-\u9fa5]/.test(vietnameseParagraphText)) {
      sourcePara = vietnameseParagraphText.trim();
    } else {
      const cleanChineseParas = (currentChapter?.sourceText || "").split("\n") || [];
      sourcePara = (cleanChineseParas[index] || "").trim();
    }

    if (!sourcePara) {
      alert(rs.alerts.noChineseParagraph);
      return;
    }

    setIsTranslatingParagraphId(index);
    
    const mappedDict: Record<string, string> = {};
    dictItems.forEach((word) => {
      if (!word.novelId || (activeNovel.id && word.novelId === activeNovel.id)) {
        mappedDict[word.chinese] = word.vietnamese;
      }
    });

    try {
      const relevantDict = dictItems.filter(item => !item.novelId || item.novelId === activeNovel.id);
      const dictContext = relevantDict.map(item => `${item.chinese} -> ${item.vietnamese}`).join("\n");

      const translation = await translateText({
        text: sourcePara,
        model: settings.selectedModel,
        temperature: settings.temperature,
        apiKeys: apiKeys,
        prompt1: settings.prompt1,
        prompt2: settings.prompt2,
        dictContext,
        priority: "high",
      }, settings);

      if (translation && onUpdateTranslation) {
        const translatedParagraphs = (currentChapter.translatedText || "").split("\n");
        translatedParagraphs[index] = translation;
        onUpdateTranslation(translatedParagraphs.join("\n"));
        alert(rs.alerts.gapTranslated);
      } else {
        alert(rs.alerts.aiEmpty);
      }
    } catch (e) {
      console.error(e);
      alert(rs.alerts.aiUnreachable);
    } finally {
      setIsTranslatingParagraphId(null);
    }
  };

  useEffect(() => {
    if (!currentChapter || !activeNovel) return;

    if (containerRef.current && (readMode !== "page" || currentPageIndex === 0)) {
      containerRef.current.scrollTop = 0;
    }

    const mode = readMode;
    const pageIdx = mode === "page" ? currentPageIndex : undefined;
    const novelId = activeNovel.id;
    const chapterId = currentChapter.id;

    try {
      localStorage.setItem(`last_read_chapter_${novelId}`, chapterId);
      localStorage.setItem(`last_read_progress_${novelId}`, chapterId);
      localStorage.setItem(`last_read_mode_${novelId}`, mode);
      localStorage.setItem(`last_read_page_${novelId}`, String(currentPageIndex));
    } catch (e) {
      console.error(e);
    }

    if (!onUpdateReadingProgress) return;

    if (readingProgressTimerRef.current) {
      clearTimeout(readingProgressTimerRef.current);
    }
    readingProgressTimerRef.current = setTimeout(() => {
      onUpdateReadingProgress(novelId, chapterId, pageIdx, mode);
    }, 1200);

    return () => {
      if (readingProgressTimerRef.current) {
        clearTimeout(readingProgressTimerRef.current);
      }
    };
  }, [currentChapter?.id, currentPageIndex, readMode, activeNovel.id, onUpdateReadingProgress]);

  useEffect(() => {
    const term = chineseWord.trim();
    if (!term || term === rs.lookup.searching) return;

    if (phraseTranslationCache.has(term)) {
      const cached = phraseTranslationCache.get(term)!;
      setVietnameseWord(cached.vietphrase || cached.hanviet || term);
      return;
    }

    const dictMatch = dictItems.find(item => item.chinese === term);
    if (dictMatch && dictMatch.vietnamese) {
      setVietnameseWord(dictMatch.vietnamese);
      return;
    }

    const pmMatch = pronounMappings.find(pm => pm.chinese === term);
    if (pmMatch) {
      setVietnameseWord(pmMatch.vietnamese);
      return;
    }
  }, [chineseWord, dictItems, pronounMappings]);

  const captureSelectionSnapshot = (): { text: string; rect: DOMRect | null } => {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return { text: "", rect: null };
    }
    let text = selection.toString().trim();
    let rect: DOMRect | null = null;
    try {
      rect = selection.getRangeAt(0).getBoundingClientRect();
    } catch {
      rect = null;
    }
    if (!text && lastCapturedSelectionRef.current?.text) {
      text = lastCapturedSelectionRef.current.text;
      rect = lastCapturedSelectionRef.current.rect;
    }
    return { text, rect };
  };

  const handleSelectionChange = () => {
    const selection = window.getSelection();
    if (!selection) return;

    const snap = captureSelectionSnapshot();
    let text = snap.text;
    if (!hasReaderTextSelection(text) || text.length > 120) {
      setShowSelectionToolbar(false);
      return;
    }

    let node: Node | null = selection.anchorNode;
    let isInsideReader = false;
    while (node && node !== document.body) {
      if (node instanceof HTMLElement && (node.id === "reader-stage-content" || node.getAttribute("data-p-container") === "true")) {
        isInsideReader = true;
        break;
      }
      node = node.parentNode;
    }

    if (!isInsideReader) {
      return;
    }

    let pNode: Node | null = selection.anchorNode;
    let paragraphIndex: number | null = null;
    let pNodeElement: HTMLElement | null = null;
    while (pNode && pNode !== document.body) {
      if (pNode instanceof HTMLElement && pNode.tagName === "P" && pNode.hasAttribute("data-index")) {
        paragraphIndex = parseInt(pNode.getAttribute("data-index") || "", 10);
        pNodeElement = pNode;
        break;
      }
      pNode = pNode.parentNode;
    }

    let vietnameseParagraphText = "";
    if (pNodeElement) {
      vietnameseParagraphText = pNodeElement.innerText || pNodeElement.textContent || "";
    } else if (pNode instanceof HTMLElement) {
      vietnameseParagraphText = pNode.innerText || pNode.textContent || "";
      pNodeElement = pNode;
    } else if (pNode && pNode.parentNode instanceof HTMLElement) {
      vietnameseParagraphText = pNode.parentNode.innerText || pNode.parentNode.textContent || "";
      pNodeElement = pNode.parentNode;
    }
    if (!vietnameseParagraphText.trim()) {
      vietnameseParagraphText = text;
    }

    const getSelectionOffsetsWithin = (element: HTMLElement) => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return { start: -1, end: -1 };
      try {
        const range = sel.getRangeAt(0);
        const preSelectionRange = range.cloneRange();
        preSelectionRange.selectNodeContents(element);
        preSelectionRange.setEnd(range.startContainer, range.startOffset);
        const start = preSelectionRange.toString().length;
        const end = start + range.toString().length;
        return { start, end };
      } catch (err) {
        return { start: -1, end: -1 };
      }
    };

    // Automatically expand/round the selected Vietnamese text selection to full word boundaries
    let roundedText = text;
    if (text && vietnameseParagraphText) {
      let startIdx = -1;
      let endIdx = -1;
      
      if (pNodeElement) {
        const offsets = getSelectionOffsetsWithin(pNodeElement);
        if (offsets.start !== -1 && offsets.end !== -1) {
          startIdx = offsets.start;
          endIdx = offsets.end;
        }
      }
      
      if (startIdx === -1 || endIdx === -1) {
        startIdx = vietnameseParagraphText.indexOf(text);
        if (startIdx !== -1) {
          endIdx = startIdx + text.length;
        }
      }

      if (startIdx !== -1 && endIdx !== -1) {
        const expanded = expandToWordBoundaries(text, vietnameseParagraphText, startIdx, endIdx);
        roundedText = expanded.text;
        startIdx = expanded.start;
        endIdx = expanded.end;

        // Adjust browser's actual selection range to match the word-boundary-rounded text
        if (pNodeElement) {
          const setSelectionRangeWithin = (element: HTMLElement, start: number, end: number) => {
            try {
              const sel = window.getSelection();
              if (!sel) return;
              const range = document.createRange();
              let currentOffset = 0;
              let startNode: Node | null = null;
              let startNodeOffset = 0;
              let endNode: Node | null = null;
              let endNodeOffset = 0;

              const traverse = (node: Node) => {
                if (node.nodeType === Node.TEXT_NODE) {
                  const textLen = node.textContent?.length || 0;
                  if (!startNode && currentOffset + textLen >= start) {
                    startNode = node;
                    startNodeOffset = start - currentOffset;
                  }
                  if (!endNode && currentOffset + textLen >= end) {
                    endNode = node;
                    endNodeOffset = end - currentOffset;
                  }
                  currentOffset += textLen;
                } else {
                  for (let i = 0; i < node.childNodes.length; i++) {
                    traverse(node.childNodes[i]);
                    if (startNode && endNode) break;
                  }
                }
              };

              traverse(element);

              if (startNode && endNode) {
                range.setStart(startNode, startNodeOffset);
                range.setEnd(endNode, endNodeOffset);
                sel.removeAllRanges();
                sel.addRange(range);
              }
            } catch (err) {
              console.error("Error adjusting visual selection range:", err);
            }
          };

          setSelectionRangeWithin(pNodeElement, startIdx, endIdx);
        }
      }
    }

    text = roundedText;
    setSelectionParagraphText(vietnameseParagraphText);
    setRawSelectedText(text);
    setExpandedFromPartialName(false);
    setSelectionVietnameseLine("");

    setSelectedText(text);
    setVietnameseWord(text);
    setBilingualLineHint(null);

    const chapterSource = currentChapter?.sourceText?.trim() || "";
    const chapterTranslated = currentChapter?.translatedText?.trim() || "";

    const pipelineHit = resolveLabBilingualSelection({
      selectedVietnamese: text,
      rawSelectedVietnamese: text,
      lineText: vietnameseParagraphText,
      context: {
        sourceText: chapterSource,
        translatedText: chapterTranslated,
        dictItems,
        novelId: activeNovel.id,
      },
    });

    if (pipelineHit) {
      setSelectedText(pipelineHit.vietnamese);
      setVietnameseWord(pipelineHit.vietnamese);
      setChineseWord(pipelineHit.chinese);
      setChineseParagraph(pipelineHit.chineseLine || pipelineHit.chinese);
      setSelectionVietnameseLine(pipelineHit.vietnameseLine);
      setLookupSource(pipelineHit.lookupSource);
      setBilingualLineHint(pipelineHit.lineIndex);
      setExpandedFromPartialName(pipelineHit.expandedFromPartial);
      setIsApiKeyExpired(false);
      if (pipelineHit.lookupSource === "dict-name" || pipelineHit.expandedFromPartial) {
        setDictSaveAsName(true);
      }
      revealSelectionToolbar(selection);
      return;
    }

    const cleanChineseParas = (currentChapter?.sourceText || "").split("\n") || [];
    let trimmedChinese = "";
    let isIndexCorrect = false;
    
    if (paragraphIndex !== null && paragraphIndex >= 0 && paragraphIndex < cleanChineseParas.length) {
      const matchingChinese = cleanChineseParas[paragraphIndex] || "";
      trimmedChinese = matchingChinese.trim();
      
      if (trimmedChinese) {
        const hv = getHanVietOffline(trimmedChinese, "", dictItems, pronounMappings);
        const hvClean = removeVietnameseTones(hv).toLowerCase();
        const viClean = removeVietnameseTones(vietnameseParagraphText).toLowerCase();
        
        // Count overlapping words
        const hvWords = hvClean.split(/\s+/).filter(w => w.length > 1);
        const viWords = viClean.split(/\s+/).filter(w => w.length > 1);
        const hvSet = new Set(hvWords);
        let overlapCount = 0;
        for (const w of viWords) {
          if (hvSet.has(w)) {
            overlapCount++;
          }
        }
        
        // If they share at least 2 words or a small ratio (10%), index is considered correct
        const minOverlapToTrust = Math.min(2, Math.max(1, Math.round(viWords.length * 0.1)));
        if (overlapCount >= minOverlapToTrust) {
          isIndexCorrect = true;
        }
      }
    }

    // Fallback: If index is incorrect, empty, or wrong, find the best matching Chinese paragraph
    if ((!trimmedChinese || !isIndexCorrect) && currentChapter?.sourceText) {
      let maxOverlap = 0;
      let bestPara = "";
      let bestIdx = paragraphIndex;
      
      const viClean = removeVietnameseTones(vietnameseParagraphText).toLowerCase();
      const viWords = viClean.split(/\s+/).filter(w => w.length > 1);
      
      if (viWords.length > 0) {
        for (let i = 0; i < cleanChineseParas.length; i++) {
          const para = cleanChineseParas[i].trim();
          if (!para) continue;
          
          const paraHV = getHanVietOffline(para, "", dictItems, pronounMappings);
          const paraClean = removeVietnameseTones(paraHV).toLowerCase();
          const paraWords = paraClean.split(/\s+/).filter(w => w.length > 1);
          const paraSet = new Set(paraWords);
          
          let overlap = 0;
          for (const w of viWords) {
            if (paraSet.has(w)) {
              overlap++;
            }
          }
          
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestPara = para;
            bestIdx = i;
          }
        }
      }
      
      if (maxOverlap > 0 && bestPara) {
        trimmedChinese = bestPara;
        paragraphIndex = bestIdx;
      }
    }

    // Safe fallback 2: If everything else fails, search based strictly on the selected word overlap
    if (!trimmedChinese && currentChapter?.sourceText) {
      const cleanSelectedWords = removeVietnameseTones(text).toLowerCase().split(/\s+/).filter(Boolean);
      
      if (cleanSelectedWords.length > 0) {
        let maxOverlap = 0;
        let bestPara = "";
        let bestIdx = paragraphIndex;
        
        for (let i = 0; i < cleanChineseParas.length; i++) {
          const para = cleanChineseParas[i].trim();
          if (!para) continue;
          
          const paraHV = getHanVietOffline(para, "", dictItems, pronounMappings);
          const paraClean = removeVietnameseTones(paraHV).toLowerCase();
          
          let overlap = 0;
          for (const word of cleanSelectedWords) {
            if (paraClean.includes(word)) {
              overlap++;
            }
          }
          
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            bestPara = para;
            bestIdx = i;
          }
        }
        
        if (maxOverlap > 0 && bestPara) {
          trimmedChinese = bestPara;
          paragraphIndex = bestIdx;
        }
      }
    }

    // Safe fallback 3: Distance bounds search
    if (!trimmedChinese && cleanChineseParas.length > 0) {
      const baseIndex = paragraphIndex !== null ? paragraphIndex : 0;
      for (let offset = 0; offset < cleanChineseParas.length; offset++) {
        const prevIdx = baseIndex - offset;
        const nextIdx = baseIndex + offset;
        if (prevIdx >= 0 && cleanChineseParas[prevIdx]?.trim()) {
          trimmedChinese = cleanChineseParas[prevIdx].trim();
          paragraphIndex = prevIdx;
          break;
        }
        if (nextIdx < cleanChineseParas.length && cleanChineseParas[nextIdx]?.trim()) {
          trimmedChinese = cleanChineseParas[nextIdx].trim();
          paragraphIndex = nextIdx;
          break;
        }
      }
    }

    setChineseParagraph(trimmedChinese || rs.lookup.noHanParagraph);

    if (trimmedChinese && text) {

      const offlineMatch = alignPhraseOffline(
        trimmedChinese,
        text,
        vietnameseParagraphText,
        dictItems,
        pronounMappings
      );

      if (offlineMatch) {
        setChineseWord(offlineMatch);
        setLookupSource("paragraph");
        setIsApiKeyExpired(false);
      } else if (!hasLabBilingualChapter) {
        const cacheKey = `${trimmedChinese}|||${text}`;
        if (alignPhraseCache.has(cacheKey)) {
          setChineseWord(alignPhraseCache.get(cacheKey)!);
          setLookupSource("api");
          setIsApiKeyExpired(false);
        } else {
          setChineseWord(rs.lookup.searching);
          setLookupSource("api");
          alignPhrase(trimmedChinese, text, settings, { priority: "high" })
            .then((chinese) => {
              if (chinese) {
                setChineseWord(chinese);
                alignPhraseCache.set(cacheKey, chinese);
                setIsApiKeyExpired(false);
              } else {
                setChineseWord("");
                setLookupSource("none");
              }
            })
            .catch((err) => {
              console.error("Error aligning phrase:", err);
              setChineseWord("");
              setLookupSource("none");
            });
        }
      } else {
        setChineseWord("");
        setLookupSource("none");
        setSelectionVietnameseLine(vietnameseParagraphText);
      }
    } else {
      setChineseWord("");
      setLookupSource("none");
    }

    revealSelectionToolbar(selection);
  };

  useEffect(() => {
    const isInsideReaderPopup = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        !!target.closest("#selection-reader-popup") ||
        !!target.closest("#reader-selection-toolbar")
      );
    };

    const isInsideReaderContent = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return !!target.closest("#reader-stage-content");
    };

    const captureLiveSelection = () => {
      const sel = window.getSelection();
      if (!sel?.rangeCount) return;
      const liveText = sel.toString().trim();
      if (!liveText || liveText.length > 120) return;
      try {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        lastCapturedSelectionRef.current = { text: liveText, rect };
      } catch {
        /* ignore */
      }
    };

    const scheduleSelectionProcess = () => {
      captureLiveSelection();
      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current);
      }
      selectionDebounceRef.current = setTimeout(() => {
        captureLiveSelection();
        const snap = captureSelectionSnapshot();
        if (!hasReaderTextSelection(snap.text)) {
          setShowSelectionToolbar(false);
          return;
        }
        handleSelectionChange();
      }, 120);
    };

    const handleDocumentSelectionChange = () => {
      if (!selectionPointerActiveRef.current) return;
      captureLiveSelection();
    };

    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (isInsideReaderPopup(e.target)) return;
      if (
        !(e.target instanceof HTMLElement) ||
        (!e.target.closest("#reader-stage-content") &&
          !e.target.closest("#reader-selection-toolbar") &&
          !e.target.closest("#selection-reader-popup"))
      ) {
        setShowSelectionToolbar(false);
      }
      if (isInsideReaderContent(e.target)) {
        selectionPointerActiveRef.current = true;
        lastCapturedSelectionRef.current = null;
      }
    };

    const handlePointerUp = (e: MouseEvent | TouchEvent) => {
      if (isInsideReaderPopup(e.target)) return;
      selectionPointerActiveRef.current = false;
      if (!isInsideReaderContent(e.target)) return;
      const liveText = window.getSelection()?.toString().trim() ?? "";
      if (!hasReaderTextSelection(liveText)) {
        lastCapturedSelectionRef.current = null;
        return;
      }
      scheduleSelectionProcess();
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown, { passive: true });
    document.addEventListener("mouseup", handlePointerUp);
    document.addEventListener("touchend", handlePointerUp);
    document.addEventListener("selectionchange", handleDocumentSelectionChange);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
      document.removeEventListener("mouseup", handlePointerUp);
      document.removeEventListener("touchend", handlePointerUp);
      document.removeEventListener("selectionchange", handleDocumentSelectionChange);
      if (selectionDebounceRef.current) {
        clearTimeout(selectionDebounceRef.current);
      }
    };
  }, [currentChapter, dictItems, pronounMappings, settings, activeNovel]);

  const handleChineseParagraphSelection = () => {
    const selection = window.getSelection();
    if (!selection) return;
    const text = selection.toString().trim();
    if (text && text.length > 0 && text.length < 20) {
      if (/[\u4e00-\u9fa5]/.test(text)) {
        setChineseWord(text);
      }
    }
  };

  const quickTranslate = async (type: "vietphrase" | "hanviet") => {
    const term = chineseWord.trim();
    if (!term) return;

    if (phraseTranslationCache.has(term)) {
      const cached = phraseTranslationCache.get(term)!;
      setIsApiKeyExpired(!!cached.apiExpired);
      if (type === "vietphrase") {
        setVietnameseWord(cached.vietphrase || term);
      } else {
        setVietnameseWord(cached.hanviet || term);
      }
      return;
    }

    const dictForward = lookupChineseInDict(term, dictItems, activeNovel.id);
    if (dictForward) {
      if (type === "vietphrase") {
        setVietnameseWord(dictForward.vietnamese);
        setLookupSource(dictForward.category === "name" ? "dict-name" : "dict");
        return;
      }
      const hv = getHanVietOffline(term, selectedText, dictItems, pronounMappings);
      setVietnameseWord(hv || dictForward.vietnamese);
      return;
    }

    const pmMatch = pronounMappings.find(pm => pm.chinese === term);
    if (pmMatch) {
      if (type === "vietphrase") {
        setVietnameseWord(pmMatch.vietnamese);
        return;
      } else {
        setVietnameseWord(pmMatch.pinyin || pmMatch.vietnamese);
        return;
      }
    }

    if (type === "hanviet") {
      const hvResult = getHanVietOffline(term, selectedText, dictItems, pronounMappings);
      if (hvResult) {
        setVietnameseWord(hvResult);
        return;
      }
    }

    setIsTranslatingPhrase(true);
    try {
      const translated = await translatePhrase(term, { ...settings, apiKeys: apiKeys });
      setIsApiKeyExpired(false);
      const hvVal = getHanVietOffline(term, selectedText, dictItems, pronounMappings) || term;
      phraseTranslationCache.set(term, {
        vietphrase: translated || term,
        hanviet: hvVal,
        apiExpired: false
      });
      if (type === "vietphrase") {
        setVietnameseWord(translated || term);
      } else {
        setVietnameseWord(hvVal);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTranslatingPhrase(false);
    }
  };

  const transformCasing = (text: string, style: "aa" | "AA" | "Aa" | "Aa1" | "Aa2"): string => {
    if (!text.trim()) return text;
    if (style === "aa") return text.toLowerCase();
    if (style === "AA") return text.toUpperCase();
    if (style === "Aa") {
      const trimmed = text.trim();
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    }
    if (style === "Aa1") {
      return text
        .split(/\s+/)
        .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
        .join(" ");
    }
    return text
      .split(/\s+/)
      .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(" ");
  };

  const applyCasing = (style: "aa" | "AA" | "Aa" | "Aa1" | "Aa2") => {
    if (!vietnameseWord.trim()) return;
    const next = transformCasing(vietnameseWord, style);
    setVietnameseWord(next);
    setSelectedText(next);
  };

  const revertToRawSelection = () => {
    if (!rawSelectedText.trim()) return;
    const chapterSource = currentChapter?.sourceText?.trim() || "";
    const chapterTranslated = currentChapter?.translatedText?.trim() || "";
    setSelectedText(rawSelectedText);
    setVietnameseWord(rawSelectedText);
    setExpandedFromPartialName(false);
    const retry = resolveLabBilingualSelection({
      selectedVietnamese: rawSelectedText,
      rawSelectedVietnamese: rawSelectedText,
      lineText: selectionParagraphText || selectionVietnameseLine,
      context: {
        sourceText: chapterSource,
        translatedText: chapterTranslated,
        dictItems,
        novelId: activeNovel.id,
      },
      skipNameExpand: true,
    });
    if (retry) {
      setChineseWord(retry.chinese);
      setChineseParagraph(retry.chineseLine || retry.chinese);
      setSelectionVietnameseLine(retry.vietnameseLine);
      setLookupSource(retry.lookupSource);
      setBilingualLineHint(retry.lineIndex);
    }
  };

  const applySelectionToChapterTranslation = (from: string, to: string) => {
    if (!onUpdateTranslation || !currentChapter?.translatedText || !from.trim() || !to.trim()) {
      return;
    }
    if (from === to) return;
    const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const updated = currentChapter.translatedText.replace(new RegExp(escaped, "g"), to);
    if (updated !== currentChapter.translatedText) {
      onUpdateTranslation(updated);
    }
  };

  const handleQuickAddSubmit = () => {
    if (chineseWord.trim() === rs.lookup.searching) {
      alert(rs.alerts.autoLookupBusy);
      return;
    }
    if (!chineseWord.trim() || !vietnameseWord.trim()) {
      alert(rs.alerts.fillBothFields);
      return;
    }

    let finalVietnamese = vietnameseWord.trim();
    const validation = validateDictPairBeforeSave(chineseWord.trim(), finalVietnamese, {
      vietnameseLine: selectionVietnameseLine || selectionParagraphText,
      rawSelection: rawSelectedText,
    });
    if (validation.level === "warn" && validation.suggestedVietnamese) {
      const useSuggested = window.confirm(
        rs.alerts.validationPrompt(
          validation.message,
          validation.suggestedVietnamese,
          finalVietnamese
        )
      );
      if (useSuggested) {
        finalVietnamese = validation.suggestedVietnamese;
        setVietnameseWord(finalVietnamese);
        setSelectedText(finalVietnamese);
      }
    }

    const scopeNovelId = dictScope === "riêng" ? activeNovel.id : undefined;
    const category = dictSaveAsName ? "name" : "custom";
    onAddDictWord(chineseWord.trim(), finalVietnamese, category, scopeNovelId);

    if (
      rawSelectedText.trim() &&
      finalVietnamese !== rawSelectedText.trim() &&
      hasLabBilingualChapter
    ) {
      applySelectionToChapterTranslation(rawSelectedText.trim(), finalVietnamese);
    }

    closeReaderSelectionUi();
    alert(
      rs.alerts.dictSaved(
        chineseWord,
        finalVietnamese,
        dictScope === "riêng" ? "riêng truyện" : "chung"
      ) +
        (finalVietnamese !== rawSelectedText.trim() && hasLabBilingualChapter
          ? " Đã cập nhật cụm tương ứng trong bản dịch chương này."
          : "")
    );
  };

  const themeClasses = {
    "light": "bg-[#f4f8ff] text-zinc-900 border-sky-200 dark:bg-[#f4f8ff] dark:text-zinc-900 dark:border-sky-200",
    "dark": "bg-zinc-950 text-zinc-300 border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:border-zinc-800",
    "cream": "bg-[#fcf8f2] text-[#2c3e50] border-[#e4d3b2] dark:bg-[#fcf8f2] dark:text-[#2c3e50] dark:border-[#e4d3b2]",
    "pure-white": "bg-white text-black border-zinc-300 dark:bg-white dark:text-black dark:border-zinc-300",
    "contrast-black": "bg-black text-white border-zinc-900 dark:bg-black dark:text-white dark:border-zinc-900"
  };

  const fontClass = getReaderFontClass(settings.readerFont);
  const alignmentClass = getReaderAlignmentClass(settings.readerAlignment);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  const nextChapter = () => {
    if (activeChapIdx < activeNovel.chapters.length - 1) {
      goToChapter(activeNovel.chapters[activeChapIdx + 1].id, "adjacent-next");
    }
  };

  const prevChapter = () => {
    if (activeChapIdx > 0) {
      goToChapter(activeNovel.chapters[activeChapIdx - 1].id, "adjacent-prev");
    }
  };

  const changeFontStyle = (font: TranslationSettings["readerFont"]) => {
    onUpdateSettings({ ...settings, readerFont: font });
  };

  const changeTheme = (theme: TranslationSettings["theme"]) => {
    const normalized = normalizeReaderTheme(theme);
    void applyReaderSystemChrome(normalized);
    onUpdateSettings({ ...settings, theme: normalized });
  };

  const handleOpenLabBilingual = () => {
    if (!currentChapter?.id || !onOpenLabAtChapter) return;
    onOpenLabAtChapter(currentChapter.id, readMode === "page" ? currentPageIndex : 0);
  };

  if (!currentChapter) {
    return (
      <div
        className={`relative flex flex-col h-full w-full items-center justify-center p-8 text-center ${themeClasses[settings.theme]}`}
        id="reader-view-panel"
      >
        <BookOpen className="w-10 h-10 text-zinc-400 mb-3" />
        <p className="text-sm font-bold text-zinc-500">{rs.loadingChapter}</p>
      </div>
    );
  }

  const readerPanelStyle: React.CSSProperties = {
    backgroundColor: readerTheme.surfaceHex,
    ...(barsOverlay
      ? {
          ["--reader-safe-top" as string]: readerSafeTopCss(),
          ["--reader-safe-bottom" as string]: readerSafeBottomCss(),
        }
      : {}),
  };

  const readerSettingsTop =
    barsOverlay
      ? `calc(var(--reader-safe-top, ${readerSafeTopCss()}) + ${READER_TOOLBAR_HEIGHT_PX}px)`
      : `${READER_TOOLBAR_HEIGHT_PX}px`;

  return (
    <div
      className={`relative overflow-hidden flex flex-col w-full border-0 rounded-none shadow-none transition-all duration-300 ${
        barsOverlay
          ? "fixed inset-0 z-30 w-full h-[100dvh] max-h-[100dvh] box-border"
          : "h-full min-h-0"
      } ${readerTheme.surfaceBg} ${readerTheme.textClass}`}
      id="reader-view-panel"
      ref={paginationMeasureRef}
      data-reader-overlay={barsOverlay ? "true" : undefined}
      data-reader-theme={normalizeReaderTheme(settings.theme)}
      style={readerPanelStyle}
    >
      
      {/* Top chrome — dưới status bar; không viền sáng (B-Reader) */}
      <div
        className={`absolute top-0 left-0 right-0 z-50 select-none backdrop-blur-md transition-all duration-300 ${
          readerTheme.chromeBarBg
        } ${
          isMobile && !showBarsOnMobile
            ? "-translate-y-full opacity-0 pointer-events-none"
            : "translate-y-0 opacity-100"
        }`}
        style={
          barsOverlay
            ? { paddingTop: `var(--reader-safe-top, ${readerSafeTopCss()})` }
            : undefined
        }
      >
        <div className="flex h-14 items-center justify-between gap-2 px-5 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => {
              if (window.history.state && window.history.state.isDetail) {
                window.history.back();
              } else if (onBack) {
                onBack();
              }
            }}
            className={`h-10 w-10 flex items-center justify-center border rounded-xl transition-all shrink-0 active:scale-95 cursor-pointer mr-1 ${readerTheme.btnSurfaceClass} ${readerTheme.mutedTextClass}`}
            title={rs.backTitle}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <BookOpen className="w-5 h-5 text-amber-500 shrink-0 hidden sm:inline" />
          <div className="min-w-0">
            <h3 className="text-[10px] font-bold truncate opacity-60 uppercase tracking-widest">{activeNovel.title}</h3>
            <h4 className="text-sm font-bold truncate mt-0.5 flex items-center gap-1.5 leading-none">
              <span className="truncate">{currentChapter?.title || rs.noChapterSelected}</span>
              {currentChapter?.title &&
                (currentChapter.translatedTitle?.trim() ||
                  chapterTranslations[currentChapter.title]) && (
                <span className="text-amber-600 dark:text-amber-500 font-bold text-xs truncate shrink-0">
                  —{" "}
                  {currentChapter.translatedTitle?.trim() ||
                    chapterTranslations[currentChapter.title]}
                </span>
              )}
            </h4>
          </div>
        </div>

        {/* Setting triggers */}
        <div className="flex items-center gap-1 shrink-0">
          {onOpenLabAtChapter && (
            <button
              type="button"
              onClick={handleOpenLabBilingual}
              className="h-10 px-2.5 sm:px-3 hover:bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-center gap-1.5 text-[10px] sm:text-xs font-bold text-amber-700 dark:text-amber-400 cursor-pointer active:scale-95 transition-all"
              title={rs.labHanTitle}
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">{rs.labHanShort}</span>
            </button>
          )}

          {!isMobile && (
            <button
              onClick={handleToggleReadMode}
              className="h-10 px-3.5 hover:bg-zinc-500/10 rounded-xl flex items-center gap-1.5 text-xs font-bold border border-zinc-500/20 cursor-pointer active:scale-95 transition-all text-zinc-600 dark:text-zinc-200"
              title={readMode === "scroll" ? rs.readModePage : rs.readModeScroll}
            >
              {readMode === "scroll" ? (
                <>
                  <FileText className="w-4 h-4 text-amber-600" />
                  <span className="hidden sm:inline">{rs.pageModeLabel}</span>
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4 text-amber-600" />
                  <span className="hidden sm:inline">{rs.scrollModeLabel}</span>
                </>
              )}
            </button>
          )}

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`h-10 w-10 hover:bg-zinc-500/10 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all ${readerTheme.mutedTextClass}`}
            title={rs.settingsTitle}
          >
            <Settings className="w-4.5 h-4.5" />
          </button>

          <button
            onClick={toggleFullscreen}
            className={`h-10 w-10 hover:bg-zinc-500/10 rounded-xl flex items-center justify-center cursor-pointer active:scale-95 transition-all ${readerTheme.mutedTextClass}`}
          >
            {isFullscreen ? <Minimize2 className="w-4.5 h-4.5" /> : <Maximize2 className="w-4.5 h-4.5" />}
          </button>
        </div>
        </div>
      </div>

      {/* Panel cài đặt — dưới status bar + hàng toolbar */}
      {showSettings && (
        <div
          className={`absolute right-2 sm:right-4 z-50 backdrop-blur-xl border rounded-lg shadow-2xl w-[min(20rem,calc(100vw-1rem))] max-h-[min(78vh,560px)] overflow-y-auto overflow-x-hidden custom-scrollbar p-5 space-y-4 animate-scale-up ${readerTheme.settingsPanelClass}`}
          style={{ top: readerSettingsTop }}
        >
          <h4 className={`text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 pb-2 border-b ${readerTheme.borderClass} sticky top-0 z-10 ${readerTheme.settingsPanelClass}`}>
            {rs.settings.panelTitle}
          </h4>

          {onOpenLabAtChapter && (
            <button
              type="button"
              onClick={() => {
                handleOpenLabBilingual();
                setShowSettings(false);
              }}
              className="w-full h-11 px-3 bg-amber-600/15 hover:bg-amber-600/25 border border-amber-500/35 text-amber-800 dark:text-amber-300 font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-all cursor-pointer active:scale-98"
            >
              <FileText className="w-4 h-4" />
              {rs.settings.labBilingualButton}
            </button>
          )}
          
          <div className="space-y-3.5 text-xs">
            {/* Fonts list options */}
            <div>
              <span className="block font-bold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase text-[10px]">{rs.settings.fontStyleLabel}</span>
              <div className="grid grid-cols-2 gap-1.5 font-sans">
                {[
                  { id: "times", label: "Times New Roman" },
                  { id: "calibri", label: "Calibri" },
                  { id: "segoe", label: "Segoe UI" },
                  { id: "verdana", label: "Verdana" },
                  { id: "serif", label: "Georgia Serif" },
                  { id: "sans", label: "Inter Sans" }
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => changeFontStyle(item.id as any)}
                    className={`py-1.5 h-9 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      settings.readerFont === item.id
                        ? "bg-amber-500 border-amber-700 text-white font-extrabold"
                        : "bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Themes list — chỉ Phòng Đọc; shell app: Cài đặt → Giao diện khung */}
            <div>
              <span className="block font-bold text-zinc-500 dark:text-zinc-400 mb-1.5 uppercase text-[10px]">{rs.settings.paperColorLabel}</span>
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500 mb-1.5 leading-snug">
                {rs.settings.paperColorHint}
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {(
                  [
                    "light",
                    "cream",
                    "dark",
                    "pure-white",
                    "contrast-black",
                  ] as const
                ).map((id) => ({
                  id,
                  label: rs.themeLabels[id],
                })).map((t) => (
                  <button
                    key={t.id}
                    onClick={() => changeTheme(t.id as any)}
                    className={`py-2 h-9 text-[10px] font-bold rounded-lg border capitalize active:scale-95 transition-all cursor-pointer ${
                      settings.theme === t.id
                        ? "border-amber-500 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-semibold"
                        : "border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400 bg-zinc-50/50 dark:bg-zinc-950/20"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tự dịch chương kế (Lab) — phương án A */}
            <div className="space-y-2 pt-2 border-t border-zinc-100 dark:border-zinc-800/80 relative">
              <button
                type="button"
                onClick={() => setShowAutoTranslateTips((prev) => !prev)}
                className="absolute top-2 right-0 inline-flex items-center justify-center w-7 h-7 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-300"
                title="Mẹo preset tự dịch chương kế"
                aria-label="Mẹo preset tự dịch chương kế"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase text-zinc-500 dark:text-zinc-400 leading-snug">
                  {rs.settings.autoTranslateLabel}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={settings.readerAutoTranslateNextEnabled === true}
                  onClick={() =>
                    onUpdateSettings({
                      ...settings,
                      readerAutoTranslateNextEnabled: !settings.readerAutoTranslateNextEnabled,
                    })
                  }
                  className={`relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors ${
                    settings.readerAutoTranslateNextEnabled
                      ? "bg-amber-500"
                      : "bg-zinc-300 dark:bg-zinc-700"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${
                      settings.readerAutoTranslateNextEnabled ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
              <p className="text-[9px] text-zinc-400 dark:text-zinc-500 leading-snug">
                {rs.settings.autoTranslateHint}
              </p>
              {showAutoTranslateTips && (
                <div className="rounded-lg border border-amber-500/35 bg-amber-500/5 p-2.5 space-y-1.5">
                  <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400 block">
                    Preset gợi ý nhanh
                  </span>
                  <div className="grid grid-cols-1 gap-1.5">
                    <button
                      type="button"
                      onClick={() => applyReaderAutoTranslatePreset("saving")}
                      className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-[10px] font-bold text-left"
                    >
                      Tiết kiệm token: tắt tự dịch chương kế
                    </button>
                    <button
                      type="button"
                      onClick={() => applyReaderAutoTranslatePreset("balanced")}
                      className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-[10px] font-bold text-left"
                    >
                      Cân bằng: bật tự dịch, delay 45 giây
                    </button>
                    <button
                      type="button"
                      onClick={() => applyReaderAutoTranslatePreset("continuous")}
                      className="h-8 px-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-[10px] font-bold text-left"
                    >
                      Liền mạch: bật tự dịch, delay 25 giây
                    </button>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-2">
                <label
                  htmlFor="reader-auto-translate-delay"
                  className="text-[10px] font-bold text-zinc-500 shrink-0"
                >
                  {rs.settings.minDelayLabel}
                </label>
                <input
                  id="reader-auto-translate-delay"
                  type="number"
                  min={READER_AUTO_TRANSLATE_MIN_DELAY_SEC}
                  step={1}
                  disabled={!settings.readerAutoTranslateNextEnabled}
                  value={delayInputDraft}
                  onChange={(e) => setDelayInputDraft(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(delayInputDraft, 10);
                    if (!Number.isFinite(parsed) || parsed < READER_AUTO_TRANSLATE_MIN_DELAY_SEC) {
                      window.alert(
                        rs.settings.minDelayAlert(READER_AUTO_TRANSLATE_MIN_DELAY_SEC)
                      );
                      const fallback =
                        settings.readerAutoTranslateNextDelaySec ??
                        READER_AUTO_TRANSLATE_DEFAULT_DELAY_SEC;
                      setDelayInputDraft(String(fallback));
                      return;
                    }
                    onUpdateSettings({
                      ...settings,
                      readerAutoTranslateNextDelaySec: parsed,
                    });
                  }}
                  className="flex-1 h-9 px-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 text-xs font-mono disabled:opacity-50"
                />
              </div>
            </div>

            {/* Settings range sliders */}
            <div className="space-y-3 pt-2 border-t border-zinc-100 dark:border-zinc-800/80">
              <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                  <span>{rs.settings.fontSizeLabel}</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{settings.readerFontSize}px</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <button 
                    onClick={() => {
                      const newSize = Math.max(12, settings.readerFontSize - 1);
                      onUpdateSettings({ ...settings, readerFontSize: newSize });
                    }}
                    className="h-11 w-11 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl flex items-center justify-center font-bold text-lg text-zinc-700 dark:text-zinc-300 transition-all active:scale-95 cursor-pointer"
                    title={rs.settings.decreaseFontTitle}
                  >
                    -
                  </button>
                  <input
                    type="range"
                    min={12}
                    max={32}
                    value={settings.readerFontSize}
                    onChange={(e) => onUpdateSettings({ ...settings, readerFontSize: parseInt(e.target.value) })}
                    className="flex-1 accent-amber-500 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                  />
                  <button 
                    onClick={() => {
                      const newSize = Math.min(32, settings.readerFontSize + 1);
                      onUpdateSettings({ ...settings, readerFontSize: newSize });
                    }}
                    className="h-11 w-11 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-800 rounded-xl flex items-center justify-center font-bold text-lg text-zinc-700 dark:text-zinc-300 transition-all active:scale-95 cursor-pointer"
                    title={rs.settings.increaseFontTitle}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                  <span>Khung đọc (Bề ngang)</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{settings.readerWidth}%</span>
                </div>
                <input
                  type="range"
                  min={92}
                  max={96}
                  step={1}
                  value={Math.max(92, Math.min(96, settings.readerWidth))}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      readerWidth: Math.max(92, Math.min(96, parseInt(e.target.value, 10) || 92))
                    })
                  }
                  className="w-full accent-amber-500 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                  <span>Mức fill chiều cao</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">
                    {Math.max(87, Math.min(100, settings.readerFillPercent ?? 90))}%
                  </span>
                </div>
                <input
                  type="range"
                  min={87}
                  max={100}
                  step={1}
                  value={Math.max(87, Math.min(100, settings.readerFillPercent ?? 90))}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      readerFillPercent: Math.max(87, Math.min(100, parseInt(e.target.value, 10) || 90))
                    })
                  }
                  className="w-full accent-amber-500 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                  <span>Lề Trái & Phải</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{settings.readerPaddingX !== undefined ? settings.readerPaddingX : 12}px</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={48}
                  step={2}
                  value={settings.readerPaddingX !== undefined ? settings.readerPaddingX : 12}
                  onChange={(e) => onUpdateSettings({ ...settings, readerPaddingX: parseInt(e.target.value) })}
                  className="w-full accent-amber-500 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                  <span>Dãn dòng</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{settings.readerLineHeight.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min={12}
                  max={24}
                  step={1}
                  value={Math.round(settings.readerLineHeight * 10)}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      readerLineHeight: parseInt(e.target.value, 10) / 10,
                    })
                  }
                  className="w-full accent-amber-500 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-[10px] uppercase font-bold text-zinc-500">
                  <span>Khoảng cách đoạn</span>
                  <span className="font-mono text-zinc-800 dark:text-zinc-200">{settings.readerParagraphSpacing}px</span>
                </div>
                <input
                  type="range"
                  min={8}
                  max={40}
                  step={2}
                  value={settings.readerParagraphSpacing}
                  onChange={(e) =>
                    onUpdateSettings({
                      ...settings,
                      readerParagraphSpacing: parseInt(e.target.value, 10),
                    })
                  }
                  className="w-full accent-amber-500 h-1.5 rounded bg-zinc-100 dark:bg-zinc-800 cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase font-bold text-zinc-500">Căn dòng:</span>
                  <div className="flex bg-zinc-100 dark:bg-zinc-950 p-0.5 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    {(["left", "justify", "right"] as const).map((align) => (
                      <button
                        key={align}
                        onClick={() => onUpdateSettings({ ...settings, readerAlignment: align })}
                        className={`flex-1 h-8 rounded flex items-center justify-center transition-colors cursor-pointer ${
                          settings.readerAlignment === align ? "bg-amber-500 text-white shadow-sm font-bold" : "text-zinc-500 hover:text-zinc-800"
                        }`}
                      >
                        {align === "left" && <AlignLeft className="w-3.5 h-3.5" />}
                        {align === "justify" && <AlignJustify className="w-3.5 h-3.5" />}
                        {align === "right" && <AlignRight className="w-3.5 h-3.5" />}
                      </button>
                    ))}
                  </div>
                </div>

                {!isMobile ? (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Cần đoạn:</span>
                    <div className="flex bg-zinc-100 dark:bg-zinc-950 p-0.5 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                      <button
                        onClick={() => onUpdateSettings({ ...settings, readerLayout: "vertical" })}
                        className={`flex-1 h-8 text-[10px] font-bold rounded flex items-center justify-center transition-all cursor-pointer ${
                          settings.readerLayout === "vertical" ? "bg-amber-500 text-white shadow-sm font-bold" : "text-zinc-500"
                        }`}
                      >
                        Cuộn dọc
                      </button>
                      <button
                        onClick={() => onUpdateSettings({ ...settings, readerLayout: "horizontal" })}
                        className={`flex-1 h-8 text-[10px] font-bold rounded flex items-center justify-center transition-all cursor-pointer ${
                          settings.readerLayout === "horizontal" ? "bg-amber-500 text-white shadow-sm font-bold" : "text-zinc-500"
                        }`}
                      >
                        Gạt trang
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">Đọc vuốt (Mobile):</span>
                    <div className="flex bg-zinc-100 dark:bg-zinc-950 p-0.5 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                      <button
                        onClick={() => onUpdateSettings({ ...settings, readerSwipeDirection: "horizontal" })}
                        className={`flex-1 h-8 text-[10px] font-bold rounded flex items-center justify-center transition-all cursor-pointer ${
                          (settings.readerSwipeDirection || "horizontal") === "horizontal" ? "bg-amber-500 text-white shadow-sm font-bold" : "text-zinc-500"
                        }`}
                      >
                        Vuốt Ngang
                      </button>
                      <button
                        onClick={() => onUpdateSettings({ ...settings, readerSwipeDirection: "vertical" })}
                        className={`flex-1 h-8 text-[10px] font-bold rounded flex items-center justify-center transition-all cursor-pointer ${
                          settings.readerSwipeDirection === "vertical" ? "bg-amber-500 text-white shadow-sm font-bold" : "text-zinc-500"
                        }`}
                      >
                        Vuốt Dọc
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Thanh nội sau khi bôi đen — Dịch / Thêm từ điển */}
      {showSelectionToolbar &&
        selectedText &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            id="reader-selection-toolbar"
            role="toolbar"
            aria-label="Thao tác vùng chọn"
            className="fixed z-[95] flex items-center gap-1.5 px-2 py-1.5 rounded-xl bg-zinc-900/95 text-white shadow-xl border border-zinc-700/80 touch-manipulation"
            style={{
              left: `${selectionToolbarPos.x}px`,
              top: `${selectionToolbarPos.y}px`,
              transform: "translateX(-50%)",
            }}
            onTouchStart={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={handleOpenDictPopupFromToolbar}
              className="h-9 px-3.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-xs font-bold"
            >
              Dịch
            </button>
            {canQuickDictFromToolbar && (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={handleQuickDictFromToolbar}
                className="h-9 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-bold whitespace-nowrap"
              >
                Thêm từ điển
              </button>
            )}
            <button
              type="button"
              onPointerDown={(e) => e.preventDefault()}
              onClick={closeReaderSelectionUi}
              className="h-9 w-9 rounded-lg bg-zinc-800 hover:bg-zinc-700 flex items-center justify-center shrink-0"
              title="Đóng"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>,
          document.body
        )}

      {/* Popup tra cứu / Vietphrase khi bấm «Dịch» (portal — tránh bị cắt bởi overflow Phòng Đọc) */}
      {showQuickAddMenu &&
        selectedText &&
        typeof document !== "undefined" &&
        createPortal(
          <>
            <button
              type="button"
              className="fixed inset-0 z-[90] bg-black/40"
              aria-label="Đóng tra cứu"
              onClick={closeReaderSelectionUi}
            />
            <div
              className={
                isMobile
                  ? "fixed bottom-0 left-0 right-0 w-full rounded-t-2xl z-[91] bg-white dark:bg-zinc-50 text-zinc-900 border-t border-zinc-200 shadow-2xl flex flex-col max-h-[88vh] overflow-hidden"
                  : "fixed z-[91] bg-white dark:bg-zinc-50 text-zinc-900 border border-zinc-200 p-4 rounded-xl shadow-2xl space-y-3 max-w-md w-[min(100vw-24px,380px)] max-h-[calc(100dvh-40px)] overflow-y-auto custom-scrollbar"
              }
              style={
                isMobile
                  ? undefined
                  : quickAddCoords.alignBottom
                    ? { left: `${quickAddCoords.x}px`, bottom: "20px" }
                    : { left: `${quickAddCoords.x}px`, top: `${quickAddCoords.y}px` }
              }
              id="selection-reader-popup"
              onTouchStart={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
            >
          {isMobile && (
            <div className="w-10 h-1 bg-zinc-300 rounded-full mx-auto mt-2 mb-1 shrink-0" />
          )}

          <div className="flex items-center justify-between border-b border-zinc-200 pb-2 shrink-0 px-4 pt-2 md:px-0 md:pt-0">
            <span className="text-sm font-bold text-zinc-800 tracking-tight">Dịch</span>
            <button 
              type="button"
              onClick={closeReaderSelectionUi}
              className="text-zinc-500 hover:text-zinc-900 h-9 w-9 rounded-lg flex items-center justify-center"
              title="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto space-y-3 px-4 pb-4 md:px-0 custom-scrollbar select-none">
            {!hasLabBilingualChapter && (
              <p className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-relaxed">
                Chưa có bản dịch Lab cho chương này — tra cứu dựa trên đoạn Hán gốc và từ điển. Dịch chương trong Lab để khớp dòng chính xác hơn.
              </p>
            )}

            {expandedFromPartialName && rawSelectedText && vietnameseWord !== rawSelectedText && (
              <div className="flex flex-wrap items-center gap-2 text-[10px] bg-teal-50 border border-teal-200 rounded-lg px-2.5 py-2">
                <span className="text-teal-900 leading-snug">
                  Đã mở rộng «{rawSelectedText}» → «{vietnameseWord}»
                </span>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={revertToRawSelection}
                  className="shrink-0 px-2 py-1 rounded-md bg-white border border-teal-300 text-teal-800 font-bold"
                >
                  Chỉ dùng «{rawSelectedText}»
                </button>
              </div>
            )}

            {hasLabBilingualChapter && selectionParagraphText.trim() && (
              <button
                type="button"
                onPointerDown={(e) => e.preventDefault()}
                onClick={applyWholeLabLineToSelection}
                className="w-full h-9 rounded-lg border border-teal-400 bg-teal-50 text-teal-900 text-[11px] font-bold"
              >
                Dùng cả dòng Lab (song ngữ)
              </button>
            )}

            <div className="flex items-center gap-1 bg-zinc-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setPopupLexMode("vp")}
                className={`flex-1 h-9 text-xs font-bold rounded-md transition-colors ${
                  popupLexMode === "vp" ? "bg-white text-teal-800 shadow-sm" : "text-zinc-500"
                }`}
              >
                VP
              </button>
              <button
                type="button"
                onClick={() => setPopupLexMode("hv")}
                className={`flex-1 h-9 text-xs font-bold rounded-md transition-colors ${
                  popupLexMode === "hv" ? "bg-white text-teal-800 shadow-sm" : "text-zinc-500"
                }`}
              >
                HV
              </button>
            </div>

            <div className="flex items-center gap-1 bg-zinc-50 border border-zinc-200 rounded-lg p-2">
              <button
                type="button"
                onClick={() => {
                  if (chineseParagraph && chineseWord) {
                    const idx = chineseParagraph.indexOf(chineseWord);
                    if (idx > 0) setChineseWord(chineseParagraph.substring(idx - 1, idx + chineseWord.length));
                  }
                }}
                className="h-8 w-8 shrink-0 text-zinc-500 hover:text-zinc-900 flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div
                onMouseUp={handleChineseParagraphSelection}
                className="flex-1 text-center text-xs font-mono text-zinc-600 truncate leading-snug select-text cursor-text"
                title="Bôi đen chữ Trung để gán vào ô từ gốc"
              >
                {chineseParagraph && chineseParagraph !== rs.lookup.noHanParagraph
                  ? chineseParagraph
                  : "—"}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (chineseParagraph && chineseWord) {
                    const idx = chineseParagraph.indexOf(chineseWord);
                    if (idx !== -1 && idx + chineseWord.length < chineseParagraph.length) {
                      setChineseWord(chineseParagraph.substring(idx, idx + chineseWord.length + 1));
                    }
                  }
                }}
                className="h-8 w-8 shrink-0 text-zinc-500 hover:text-zinc-900 flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {selectionParagraphText.trim() && (
              <p className="text-sm leading-relaxed text-zinc-800 serif-reading-font px-1">
                {(() => {
                  const para = selectionParagraphText;
                  const idx = para.indexOf(selectedText);
                  if (idx < 0) return para;
                  return (
                    <>
                      {para.slice(0, idx)}
                      <mark className="bg-teal-100 text-teal-900 rounded px-0.5 font-semibold">{selectedText}</mark>
                      {para.slice(idx + selectedText.length)}
                    </>
                  );
                })()}
              </p>
            )}

            <div className="relative">
              <input
                type="text"
                value={popupLexMode === "vp" ? vietnameseWord : (chineseWord ? getHanVietOffline(chineseWord, selectedText, dictItems, pronounMappings) : "")}
                onChange={(e) => {
                  if (popupLexMode === "vp") setVietnameseWord(e.target.value);
                }}
                readOnly={popupLexMode === "hv"}
                className="w-full h-11 bg-white border border-zinc-300 rounded-lg px-3 pr-10 text-sm font-semibold text-zinc-900 focus:outline-none focus:ring-2 focus:ring-teal-500/40"
                placeholder={popupLexMode === "vp" ? "Vietphrase…" : "Hán Việt…"}
              />
              <button
                type="button"
                onClick={() => (popupLexMode === "vp" ? setVietnameseWord("") : setChineseWord(""))}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 h-8 w-8 flex items-center justify-center"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {popupLexMode === "vp" && vietnameseWord.trim() && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => applyCasing("Aa1")}
                  className="px-3 py-1.5 text-xs font-bold rounded-full border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 touch-manipulation"
                >
                  {transformCasing(vietnameseWord, "Aa1")}
                </button>
                <button
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => applyCasing("aa")}
                  className="px-3 py-1.5 text-xs font-bold rounded-full border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 touch-manipulation"
                >
                  {transformCasing(vietnameseWord, "aa")}
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs select-text">
              <input
                type="text"
                placeholder="Từ gốc Trung (vd. 黛眉)"
                value={chineseWord === rs.lookup.searching ? "" : chineseWord}
                onChange={(e) => setChineseWord(e.target.value.trim())}
                className={`h-10 px-2.5 rounded-lg border text-sm font-mono ${
                  chineseWord === rs.lookup.searching
                    ? "border-amber-300 text-amber-600 animate-pulse"
                    : "border-zinc-300"
                }`}
              />
              <input
                type="text"
                placeholder="Bản dịch Việt"
                value={vietnameseWord}
                onChange={(e) => setVietnameseWord(e.target.value)}
                className="h-10 px-2.5 rounded-lg border border-zinc-300 text-sm font-semibold text-teal-800"
              />
            </div>

            <div className="flex flex-wrap gap-1.5">
              {(["aa", "Aa1", "Aa2", "Aa", "AA"] as const).map((style) => (
                <button
                  key={style}
                  type="button"
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => applyCasing(style)}
                  className="flex-1 min-w-[36px] h-9 bg-zinc-100 hover:bg-zinc-200 active:bg-zinc-300 text-[10px] font-bold rounded-lg text-zinc-700 touch-manipulation"
                >
                  {style === "Aa1" ? "Aa¹" : style === "Aa2" ? "Aa²" : style}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDictSaveAsName(true)}
                className={`h-10 rounded-lg border text-[11px] font-bold ${
                  dictSaveAsName ? "bg-teal-50 border-teal-500 text-teal-800" : "border-zinc-200 text-zinc-500"
                }`}
              >
                NE · Tên riêng
              </button>
              <button
                type="button"
                onClick={() => setDictSaveAsName(false)}
                className={`h-10 rounded-lg border text-[11px] font-bold ${
                  !dictSaveAsName ? "bg-teal-50 border-teal-500 text-teal-800" : "border-zinc-200 text-zinc-500"
                }`}
              >
                VP · Thuật ngữ
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setDictScope("riêng")}
                className={`h-10 rounded-lg border text-[11px] font-bold ${
                  dictScope === "riêng" ? "bg-amber-50 border-amber-500 text-amber-900" : "border-zinc-200 text-zinc-500"
                }`}
              >
                Riêng truyện
              </button>
              <button
                type="button"
                onClick={() => setDictScope("chung")}
                className={`h-10 rounded-lg border text-[11px] font-bold ${
                  dictScope === "chung" ? "bg-amber-50 border-amber-500 text-amber-900" : "border-zinc-200 text-zinc-500"
                }`}
              >
                Chung
              </button>
            </div>

            <button
              type="button"
              onClick={handleQuickAddSubmit}
              disabled={!chineseWord.trim() || !vietnameseWord.trim() || isTranslatingPhrase}
              className="w-full h-11 bg-teal-700 hover:bg-teal-800 disabled:opacity-40 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> Cập nhật
            </button>

            <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-zinc-500 border-t border-zinc-100 pt-2 font-medium">
              <a href={`https://hanzii.net/search/word/${encodeURIComponent(chineseWord || selectedText)}`} target="_blank" rel="noreferrer" className="hover:text-teal-700">Hanzii</a>
              <a href={`https://translate.google.com/?sl=zh-CN&tl=vi&text=${encodeURIComponent(chineseWord || selectedText)}`} target="_blank" rel="noreferrer" className="hover:text-teal-700">G.Translate</a>
              <a href={`https://www.google.com/search?q=${encodeURIComponent(chineseWord || selectedText)}`} target="_blank" rel="noreferrer" className="hover:text-teal-700">G.Search</a>
              <a href={`https://fanyi.baidu.com/#/zh/vi/${encodeURIComponent(chineseWord || selectedText)}`} target="_blank" rel="noreferrer" className="hover:text-teal-700">Fanyi</a>
              <a href={`https://baike.baidu.com/item/${encodeURIComponent(chineseWord || selectedText)}`} target="_blank" rel="noreferrer" className="hover:text-teal-700">Baidu</a>
            </div>
          </div>
            </div>
          </>,
          document.body
        )}
      {/* Chapter list drawer (mobile) */}
      {showChapterDrawer && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]"
            aria-label="Đóng danh sách chương"
            onClick={() => setShowChapterDrawer(false)}
          />
          <aside
            className="fixed inset-y-0 left-0 z-[70] w-[82vw] max-w-[85vw] flex flex-col bg-white dark:bg-zinc-950 border-r border-zinc-200 dark:border-zinc-800 shadow-2xl animate-slide-up"
            role="dialog"
            aria-label="Danh sách chương"
          >
            <div className="h-14 px-4 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between shrink-0">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-200">
                Danh sách chương
              </h3>
              <button
                type="button"
                onClick={() => setShowChapterDrawer(false)}
                className="h-9 w-9 rounded-xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1">
              {activeNovel.chapters.map((ch, idx) => {
                const isActive = ch.id === activeChapterId;
                const hasTranslation = !!(ch.translatedText && ch.translatedText.trim());
                const titleVi =
                  ch.translatedTitle?.trim() || chapterTranslations[ch.title];
                return (
                  <button
                    key={ch.id}
                    type="button"
                    ref={isActive ? activeChapterRowRef : undefined}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectChapterFromDrawer(ch.id);
                    }}
                    onTouchEnd={(e) => e.stopPropagation()}
                    className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                      isActive
                        ? "bg-amber-500/15 border-amber-500/40"
                        : "bg-zinc-50/80 dark:bg-zinc-900/50 border-zinc-200/70 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <p
                      className={`text-xs font-bold truncate leading-snug ${
                        isActive
                          ? "text-amber-800 dark:text-amber-300"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      Chương {idx + 1}: {ch.title || "(Không có tiêu đề)"}
                    </p>
                    {titleVi && (
                      <p className="text-[10px] text-amber-600/90 dark:text-amber-500/90 truncate mt-0.5 font-semibold">
                        {titleVi}
                      </p>
                    )}
                    <p className="text-[9px] text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">
                      {formatChapterCharCountLabel(ch)} · {hasTranslation ? "Đã dịch Lab" : "Chưa dịch Lab"}
                    </p>
                  </button>
                );
              })}
            </div>
          </aside>
        </>
      )}

      {autoTranslateHint && (
        <div
          className="absolute left-1/2 -translate-x-1/2 z-[45] px-3 py-2 rounded-lg border border-sky-500/35 bg-sky-500/10 text-[10px] font-semibold text-sky-800 dark:text-sky-200 text-center leading-snug"
          style={{
            top: barsOverlay
              ? `calc(var(--reader-safe-top, ${readerSafeTopCss()}) + ${READER_TOOLBAR_HEIGHT_PX + 8}px)`
              : `${READER_TOOLBAR_HEIGHT_PX + 8}px`,
          }}
        >
          {autoTranslateHint}
        </div>
      )}

      {/* Reading Core Stage — đo bottom-up từ DOM thực tế của wrapper an toàn */}
      <div
        ref={wrapperRef}
        className={isPageLayout ? "z-0 overflow-hidden" : "flex-1 min-h-0 w-full overflow-hidden"}
        style={
          isPageLayout
            ? {
                position: "fixed",
                top: "env(safe-area-inset-top, 0px)",
                bottom: "env(safe-area-inset-bottom, 0px)",
                left: 0,
                right: 0,
                zIndex: 10,
                display: "block",
                overflow: "hidden",
              }
            : undefined
        }
      >
      <div
        ref={containerRef}
        className={isPageLayout ? "absolute inset-0 overflow-hidden" : "w-full h-full overflow-hidden flex items-center justify-center"}
      >
      <div 
        ref={pageContentRef}
        onContextMenu={(e) => {
          e.preventDefault();
        }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        className={`no-callout shrink-0 select-text ${
          isPageLayout ? "overflow-hidden" : "flex-1 min-h-0 overflow-y-auto custom-scrollbar w-full"
        }`}
        style={pageFrameStyle}
        id="reader-stage-content"
      >
        {readMode === "page" ? (
          hasCurrentPageContent ? (
            <div className="w-full overflow-hidden">
              {!isFullyTranslated && (
                <p className="text-[10px] text-center text-amber-600/90 dark:text-amber-400/90 font-semibold mb-2 px-2 leading-snug shrink-0">
                  {rs.chrome.labBannerPaged}
                </p>
              )}
              <div
                className="reader-page-quantized-wrapper"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  alignItems: "center",
                  height: `${pageViewport.targetHeight}px`,
                  width: "100%",
                  overflow: "hidden",
                }}
              >
                <div
                  className={`reader-page-column ${fontClass}`}
                  style={{
                    ...pageColumnCssVars,
                    height: "var(--max-h)",
                    width: "100%",
                    display: "block",
                    lineHeight: "var(--exact-lh)",
                    columnWidth: "100vw",
                    columnGap: "0px",
                    columnFill: "auto",
                    boxSizing: "content-box",
                    WebkitTextSizeAdjust: "100%",
                    textSizeAdjust: "100%",
                    overflow: "hidden",
                  }}
                >
                  {(pages[currentPageIndex]?.paragraphs ?? []).map((paraObj, pIdx) => {
                    if (!paraObj) return null;
                    const paragraph = paraObj.text;
                    const index = paraObj.originalIndex;
                    if (!paragraph.trim()) return null;
                    const hasChinese = paragraphMayShowInlineTranslateAction(paragraph);
                    return (
                      <p
                        key={pIdx}
                        data-index={index}
                        className="reader-page-p transition-colors duration-200 hover:text-amber-600 focus:outline-none relative group"
                        style={{
                          ...nativeParagraphStyle,
                          ...pageColumnCssVars,
                          lineHeight: "var(--exact-lh)",
                          textAlign: "justify",
                          orphans: 1,
                          widows: 1,
                          breakInside: "auto",
                          margin: 0,
                          padding: 0,
                          textIndent: "1.5em",
                        }}
                      >
                        {paragraph.trim()}
                        {hasChinese && (
                          <span className="inline-flex items-center ml-2 select-none">
                            <button
                              disabled={isTranslatingParagraphId === index}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTranslateParagraph(index, paragraph);
                              }}
                              className="inline-flex items-center gap-1.5 h-8 px-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-lg cursor-pointer hover:bg-amber-500 hover:text-white transition-all ml-1.5"
                              title="Đoạn văn này có chứa Hán tự chưa dịch."
                            >
                              <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                              {isTranslatingParagraphId === index
                                ? "Đang dịch..."
                                : "Dịch đoạn sót"}
                            </button>
                          </span>
                        )}
                      </p>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full w-full flex flex-col items-center justify-center p-6 text-center text-zinc-500 dark:text-zinc-400 font-semibold select-none overflow-hidden">
              <BookOpen className="w-8 h-8 mb-3 text-zinc-400" />
              <h4 className="text-sm font-bold opacity-80">{rs.chrome.emptyPageTitle}</h4>
              <p className="text-xs opacity-60 mt-1 max-w-xs leading-normal">
                {rs.chrome.emptyPageBody}
              </p>
            </div>
          )
        ) : (
          !currentChapter?.translatedText?.trim() ? (
            <div
              className={`h-full w-full overflow-y-auto custom-scrollbar p-4 ${fontClass} ${alignmentClass}`}
              style={{
                fontSize: `${settings.readerFontSize}px`,
                lineHeight: settings.readerLineHeight,
              }}
            >
              <p className="text-[10px] text-center text-amber-600/90 dark:text-amber-400/90 font-semibold mb-3 leading-snug">
                {rs.chrome.labBannerScroll}
              </p>
              {(currentChapter?.sourceText || "")
                .split("\n")
                .map((line, index) =>
                  line.trim() ? (
                    <p
                      key={index}
                      className="leading-relaxed text-justify"
                      style={{
                        marginBottom: `${settings.readerParagraphSpacing}px`,
                        textIndent: "2.3em",
                      }}
                    >
                      {line.trim()}
                    </p>
                  ) : null
                )}
            </div>
          ) : (
            <div 
              className={`space-y-4 ${fontClass} ${alignmentClass} leading-relaxed`}
              style={{ 
                fontSize: `${settings.readerFontSize}px`,
                lineHeight: settings.readerLineHeight
              }}
            >
              {currentChapter.translatedText.split('\n').map((paragraph, index) => {
                if (!paragraph.trim()) return null;
                const hasChinese = /[\u4e00-\u9fa5]{3,}/.test(paragraph);
                return (
                  <p 
                    key={index} 
                    data-index={index}
                    className="transition-colors duration-200 hover:text-amber-600 focus:outline-none relative group leading-relaxed text-justify"
                    style={{ marginBottom: `${settings.readerParagraphSpacing}px`, textIndent: "2.3em" }}
                  >
                    {paragraph.trim()}
                    {hasChinese && (
                      <span className="inline-flex items-center ml-2 select-none">
                        <button 
                          disabled={isTranslatingParagraphId === index}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTranslateParagraph(index, paragraph);
                          }}
                          className="inline-flex items-center gap-1.5 h-8 px-2.5 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-[10px] font-bold rounded-lg cursor-pointer hover:bg-amber-500 hover:text-white transition-all ml-1.5"
                        >
                          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                          {isTranslatingParagraphId === index ? "Đang dịch..." : "Dịch đoạn sót"}
                        </button>
                      </span>
                    )}
                  </p>
                );
              })}
            </div>
          )
        )}
      </div>
      </div>
      </div>

      {/* Bottom chrome — nền kéo sát đáy + safe-area gesture */}
      <div
        className={`absolute bottom-0 left-0 right-0 z-50 select-none backdrop-blur-md transition-all duration-300 ${
          readerTheme.chromeBarBg
        } ${
          isMobile && !showBarsOnMobile
            ? "translate-y-full opacity-0 pointer-events-none"
            : "translate-y-0 opacity-100"
        }`}
        style={
          barsOverlay
            ? { paddingBottom: `var(--reader-safe-bottom, ${readerSafeBottomCss()})` }
            : undefined
        }
      >
        <div className="flex h-14 items-center justify-between text-xs px-2 sm:px-4 gap-1">
        {readMode === "page" && (
          <button
            type="button"
            onClick={() => setShowChapterDrawer(true)}
            className={`h-10 w-10 flex items-center justify-center rounded-xl border shrink-0 active:scale-95 ${readerTheme.btnSurfaceClass} ${readerTheme.mutedTextClass}`}
            title={rs.chrome.chapterListTitle}
          >
            <List className="w-4.5 h-4.5 text-amber-500" />
          </button>
        )}
        {onOpenLabAtChapter && (
          <button
            type="button"
            onClick={handleOpenLabBilingual}
            className="h-10 w-10 flex items-center justify-center rounded-xl border border-amber-500/35 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 shrink-0 active:scale-95"
            title={rs.chrome.labTitle}
          >
            <FileText className="w-4.5 h-4.5" />
          </button>
        )}
        <button
          onClick={handlePrevPage}
          disabled={activeChapIdx <= 0 && (readMode !== "page" || currentPageIndex === 0)}
          className={`flex items-center gap-1.5 p-2.5 px-3.5 hover:bg-zinc-500/10 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent font-bold transition-all cursor-pointer select-none ${readerTheme.mutedTextClass}`}
        >
          <ChevronLeft className="w-4 h-4" /> {readMode === "page" ? rs.chrome.prevPage : rs.chrome.prevChapter}
        </button>

        {readMode === "page" ? (
          <div className="flex items-center gap-3.5 font-bold opacity-80 text-center select-none">
            <span className={`font-mono text-[10px] ${readerTheme.mutedTextClass}`}>
              Ch{activeChapIdx + 1}/{activeNovel?.chapters.length || 0}
            </span>
            <span className="text-amber-600 dark:text-amber-400 font-mono text-[10px] font-extrabold bg-amber-500/10 px-2 py-0.5 rounded-lg border border-amber-600/20">
              Trang {currentPageIndex + 1}/{totalPages} ({(((activeChapIdx + (currentPageIndex / totalPages)) / (activeNovel?.chapters.length || 1)) * 100).toFixed(1).replace('.', ',')}%)
            </span>
          </div>
        ) : (
          <span className="font-extrabold opacity-70 font-mono text-[11px]">
            Chương {activeChapIdx + 1}/{activeNovel?.chapters.length || 0}
          </span>
        )}

        <button
          onClick={handleNextPage}
          disabled={
            readMode === "page" 
              ? (activeChapIdx >= (activeNovel?.chapters?.length || 1) - 1 && currentPageIndex >= totalPages - 1)
              : activeChapIdx >= (activeNovel?.chapters?.length || 1) - 1
          }
          className={`flex items-center gap-1.5 p-2.5 px-3.5 hover:bg-zinc-500/10 rounded-xl disabled:opacity-30 disabled:hover:bg-transparent font-bold transition-all cursor-pointer select-none ${readerTheme.mutedTextClass}`}
        >
          {readMode === "page" ? rs.chrome.nextPage : rs.chrome.nextChapter} <ChevronRight className="w-4 h-4" />
        </button>
        </div>
      </div>

    </div>
  );
}
