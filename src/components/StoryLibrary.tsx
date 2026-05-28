import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { 
  Book, 
  Trash2, 
  Download, 
  Eye, 
  Layers, 
  PlusCircle, 
  Calendar, 
  User, 
  CheckCircle, 
  Clock, 
  FileDown,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Info,
  SlidersHorizontal,
  Grid,
  List,
  FileText,
  Percent
} from "lucide-react";
import { Novel, Chapter } from "../types";
import type { ChapterRuleState } from "../utils/chapterRulesEngine";
import { exportChaptersToTxt, exportChaptersToDocx, exportChaptersToEpub, triggerBrowserPrint } from "../utils/exporter";
import {
  buildTranslationBackupZip,
  collectTranslationBackupNovels,
  downloadBlobWithFallback,
} from "../utils/translationBackup";
import NovelLoader from "./NovelLoader";
import {
  uiPageRoot,
  uiPageHeader,
  uiIconHeader,
  uiTitle,
  uiCaption,
  uiLabel,
  uiFieldLabel,
  uiInput,
  uiBtnPrimary,
  uiBtnGhost,
  uiBtnSecondary,
  uiBtnDanger,
  uiCard,
  uiCardInset,
  uiPanel,
  uiSection,
  uiSegmentedTrack,
  uiSegmentedBtnActive,
  uiSegmentedBtnIdle,
  uiInlineFeedbackInfo,
  uiInlineFeedbackSuccess,
  uiInlineFeedbackWarning,
  uiInlineFeedbackDanger,
} from "../lib/ui";

interface StoryLibraryProps {
  novels: Novel[];
  activeNovelId?: string;
  onSelectNovel: (novelId: string, shouldSwitchTab?: boolean) => void;
  onDeleteNovel: (novelId: string, deleteMode: "library_only" | "complete") => void;
  onAlert?: (title: string, msg: string) => void;
  onConfirm?: (title: string, msg: string, onConfirm: () => void, isDanger?: boolean) => void;
  onChaptersLoaded: (
    title: string,
    chapters: Chapter[],
    rawText?: string,
    chapterHeaderPattern?: string
  ) => void;
  isTranslating: boolean;
  chapterRuleStates?: ChapterRuleState[];
  onChapterRuleStatesChange?: (states: ChapterRuleState[]) => void;
  onImportTranslationBackup?: (file: File) => void | Promise<void>;
}

export default function StoryLibrary({
  novels,
  activeNovelId,
  onSelectNovel,
  onDeleteNovel,
  onAlert,
  onConfirm,
  onChaptersLoaded,
  isTranslating,
  chapterRuleStates,
  onChapterRuleStatesChange,
  onImportTranslationBackup,
}: StoryLibraryProps) {
  const [selectedNovelId, setSelectedNovelId] = useState<string | null>(null);
  const [bookshelfType, setBookshelfType] = useState<"grid" | "list">(() => {
    return (localStorage.getItem("library_bookshelf_type") as "grid" | "list") || "grid";
  });
  
  const [showToolsModal, setShowToolsModal] = useState(false);
  const [exportNovelId, setExportNovelId] = useState<string>("");
  const [exportStartIdx, setExportStartIdx] = useState<number>(1);
  const [exportEndIdx, setExportEndIdx] = useState<number>(1);
  const [exportFormat, setExportFormat] = useState<"txt" | "docx" | "epub" | "pdf">("txt");
  const [isExportingTranslation, setIsExportingTranslation] = useState(false);
  const [isImportingTranslation, setIsImportingTranslation] = useState(false);
  const [toolsFeedback, setToolsFeedback] = useState<{
    tone: "info" | "success" | "warning" | "danger";
    message: string;
  } | null>(null);
  
  const [novelToDelete, setNovelToDelete] = useState<Novel | null>(null);
  const [deleteOption, setDeleteOption] = useState<"library_only" | "complete">("library_only");

  // Keep selectedNovelId in sync with activeNovelId if any
  useEffect(() => {
    if (activeNovelId) {
      setSelectedNovelId(activeNovelId);
    } else if (novels.length > 0 && !selectedNovelId) {
      setSelectedNovelId(novels[0].id);
    }
  }, [activeNovelId, novels, selectedNovelId]);

  // Handle active novel reference for export target book settings
  const targetExportNovel = novels.find(n => n.id === exportNovelId) || novels.find(n => n.id === selectedNovelId) || novels[0];

  useEffect(() => {
    if (targetExportNovel) {
      setExportNovelId(targetExportNovel.id);
      setExportStartIdx(1);
      setExportEndIdx(targetExportNovel.chapters.length);
    }
  }, [targetExportNovel]);

  /** Modal công cụ: portal ra body — tránh bị main overflow cắt và lớp nền app che nội dung */
  useEffect(() => {
    if (!showToolsModal) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showToolsModal]);

  useEffect(() => {
    if (!showToolsModal) {
      setToolsFeedback(null);
    }
  }, [showToolsModal]);

  const handleExport = () => {
    if (!targetExportNovel) return;
    
    const start = Math.max(1, exportStartIdx) - 1;
    const end = Math.min(targetExportNovel.chapters.length, exportEndIdx) - 1;

    if (start > end) {
      setToolsFeedback({
        tone: "warning",
        message: "Khoảng chương không hợp lệ. Vui lòng kiểm tra lại mốc bắt đầu/kết thúc.",
      });
      if (onAlert) {
        onAlert("Khoảng chương lỗi", "Khoảng chương lựa chọn xuất bản không hợp lệ!");
      } else {
        alert("Khoảng chương lựa chọn xuất bản không hợp lệ!");
      }
      return;
    }

    const targetChapters = targetExportNovel.chapters.slice(start, end + 1);
    const untranslatedCount = targetChapters.filter(ch => !ch.translatedText.trim()).length;
    const estimatedChars = targetChapters.reduce(
      (sum, ch) => sum + (ch.translatedText?.length || 0),
      0
    );

    if (exportFormat === "docx" || exportFormat === "epub") {
      if (estimatedChars > 900_000) {
        const msg =
          "Dung lượng xuất quá lớn cho định dạng này trên điện thoại. " +
          "Vui lòng giảm phạm vi chương (khuyến nghị <= 900k ký tự mỗi lần) hoặc xuất TXT theo nhiều tập.";
        setToolsFeedback({ tone: "warning", message: msg });
        if (onAlert) onAlert("Nên chia nhỏ bản xuất", msg);
        else alert(msg);
        return;
      }
    }

    if (exportFormat === "txt" && estimatedChars > 2_000_000) {
      const msg =
        "Khối lượng TXT quá lớn cho một lần xuất trên mobile. " +
        "Vui lòng chia theo nhiều tập (mỗi tập ~300k-600k ký tự).";
      setToolsFeedback({ tone: "warning", message: msg });
      if (onAlert) onAlert("Nên chia nhỏ bản xuất", msg);
      else alert(msg);
      return;
    }
    
    const performActualExport = () => {
      setToolsFeedback({
        tone: "success",
        message: `Đã gửi lệnh xuất ${exportFormat.toUpperCase()} cho phạm vi ${exportStartIdx}-${exportEndIdx}.`,
      });
      if (exportFormat === "txt") {
        exportChaptersToTxt(targetExportNovel.title, targetExportNovel.chapters, start, end);
      } else if (exportFormat === "docx") {
        exportChaptersToDocx(targetExportNovel.title, targetExportNovel.chapters, start, end);
      } else if (exportFormat === "epub") {
        exportChaptersToEpub(targetExportNovel.title, targetExportNovel.chapters, start, end);
      } else if (exportFormat === "pdf") {
        triggerBrowserPrint(targetExportNovel.title, targetExportNovel.chapters, start, end);
      }
    };

    if (untranslatedCount > 0) {
      const confirmMsg = `Phát hiện thấy có ${untranslatedCount} chương chưa dịch xong trong danh sách xuất bản. Bản xuất ebook sẽ chứa cả văn bản tiếng Trung thô chưa dịch. Bạn có muốn tiếp tục xuất bản sách không?`;
      if (onConfirm) {
        onConfirm(
          "Nhắc nhở xuất bản",
          confirmMsg,
          performActualExport
        );
      } else if (confirm(confirmMsg)) {
        performActualExport();
      }
    } else {
      performActualExport();
    }
  };

  const handleExportTranslationBackup = async () => {
    if (!targetExportNovel) return;
    setIsExportingTranslation(true);
    setToolsFeedback({
      tone: "info",
      message: "Đang đóng gói data dịch truyện đã chọn...",
    });
    try {
      const { blob, manifest, fileName } = await buildTranslationBackupZip(novels, {
        novelId: targetExportNovel.id,
      });
      await downloadBlobWithFallback(blob, fileName, (debugMessage) => {
        if (onAlert) onAlert("Kết quả lưu file", debugMessage);
      });
      if (onAlert) {
        onAlert(
          "Sao lưu data dịch",
          `Đã xuất «${targetExportNovel.title}»: ${manifest.chapterCount} chương đã dịch Lab.`
        );
      }
      setToolsFeedback({
        tone: "success",
        message: `Đã lưu data dịch «${targetExportNovel.title}» (${manifest.chapterCount} chương).`,
      });
    } catch (err: unknown) {
      setToolsFeedback({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
      if (onAlert) {
        onAlert("Không xuất được", err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsExportingTranslation(false);
    }
  };

  const handleImportTranslationBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportTranslationBackup) return;
    setIsImportingTranslation(true);
    setToolsFeedback({
      tone: "info",
      message: `Đang nạp data dịch từ file «${file.name}»...`,
    });
    try {
      await onImportTranslationBackup(file);
      setToolsFeedback({
        tone: "success",
        message: `Đã nạp xong data dịch từ «${file.name}».`,
      });
    } catch (err: unknown) {
      setToolsFeedback({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
      if (onAlert) {
        onAlert("Không nạp được data dịch", err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsImportingTranslation(false);
      if (e.target) e.target.value = "";
    }
  };

  const translatedCountForExportNovel = targetExportNovel
    ? collectTranslationBackupNovels(novels, { novelId: targetExportNovel.id })[0]?.chapters.length ?? 0
    : 0;

  const toggleBookshelfType = (type: "grid" | "list") => {
    setBookshelfType(type);
    localStorage.setItem("library_bookshelf_type", type);
  };

  const getNovelProgress = (novel: Novel) => {
    const totalChapters = novel.chapters.length;
    const translatedChapters = novel.chapters.filter(c => c.translatedText.trim().length > 0).length;
    const translationPercent = totalChapters ? Math.round((translatedChapters / totalChapters) * 100) : 0;

    let lastChId = novel.lastReadChapterId;
    let lastMode = novel.lastReadMode;
    let lastPageIdx = novel.lastReadPageIndex;

    try {
      if (!lastChId) {
        lastChId = localStorage.getItem(`last_read_chapter_${novel.id}`) || localStorage.getItem(`last_read_progress_${novel.id}`) || undefined;
      }
      if (!lastMode) {
        lastMode = (localStorage.getItem(`last_read_mode_${novel.id}`) as "scroll" | "page") || "scroll";
      }
      if (lastPageIdx === undefined && lastMode === "page") {
        const pageStr = localStorage.getItem(`last_read_page_${novel.id}`);
        if (pageStr !== null) {
          lastPageIdx = parseInt(pageStr, 10);
        }
      }
    } catch (e) {}

    const lastChIndex = lastChId ? novel.chapters.findIndex(c => c.id === lastChId) : -1;
    const lastCh = lastChIndex !== -1 ? novel.chapters[lastChIndex] : null;

    const readChaptersCount = lastChIndex !== -1 ? (lastChIndex + 1) : 0;
    const readingPercent = totalChapters ? Math.round((readChaptersCount / totalChapters) * 100) : 0;

    let progressText = "Chưa đọc";
    if (lastCh) {
      if (lastMode === "page" && lastPageIdx !== undefined && lastPageIdx >= 0) {
        progressText = `Chương ${lastChIndex + 1}: ${lastCh.title} (Trang ${lastPageIdx + 1})`;
      } else {
        progressText = `Chương ${lastChIndex + 1}: ${lastCh.title}`;
      }
    }

    return {
      totalChapters,
      translatedChapters,
      translationPercent,
      readChaptersCount,
      readingPercent,
      progressText,
      lastCh
    };
  };

  return (
    <div className={`${uiPageRoot} space-y-5 animate-fade-up-soft`} id="story-library-panel">
      
      {/* Title Header with ... Menu trigger */}
      <div className={`${uiPageHeader} !flex-row items-center rounded-xl bg-gradient-to-r from-app-surface to-app-surface-muted/70 border border-app-border px-4 py-3 md:py-4`}>
        <div className="flex items-center gap-2.5">
          <div className={uiIconHeader}>
            <Book className="w-5 h-5 text-app-accent" />
          </div>
          <div>
            <h2 className={uiTitle}>Thư Viện Sách Offline</h2>
            <p className={`${uiCaption} mt-1`}>
              Quản lý các tác phẩm, theo dõi tiến trình biên phiên dịch và đọc truyện mượt mà.
            </p>
          </div>
        </div>

        {/* Vertical ellipsis action button for tools dashboard */}
        <button
          type="button"
          onClick={() => setShowToolsModal(true)}
          className={`${uiBtnGhost} p-2.5 min-h-10 min-w-10`}
          title="Bảng điều khiển, nạp truyện & xuất bản"
        >
          <SlidersHorizontal className="w-5 h-5 text-app-accent" />
        </button>
      </div>

      {novels.length === 0 ? (
        <div className="py-16 border-2 border-dashed border-app-border rounded-lg flex flex-col items-center justify-center p-6 text-center space-y-4 select-none">
          <Layers className="w-10 h-10 text-app-text-muted animate-pulse" />
          <div className="space-y-1">
            <h3 className={`${uiTitle} text-sm`}>Thư viện chưa nhập tác phẩm nào</h3>
            <p className={`${uiCaption} max-w-sm`}>
              Bạn có thể tiến hành nạp tài nguyên thô Trung văn hoặc tệp .txt truyện tự biên dịch để trải nghiệm.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowToolsModal(true)}
            className={`${uiBtnPrimary} px-4 text-xs font-bold`}
          >
            <PlusCircle className="w-4 h-4" /> Nạp truyện mới ngay
          </button>
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className={uiLabel}>
              Tủ sách thông minh ({novels.length})
            </h3>
            
            {/* Quick layout stats display */}
            <span className={`${uiCaption} font-mono text-[10px]`}>
              Chế độ hiển thị: {bookshelfType === "grid" ? "Dạng lưới" : "Dạng danh sách"}
            </span>
          </div>

          {/* Grid Layout Bookshelf representation */}
          {bookshelfType === "grid" ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {novels.map((novel) => {
                const {
                  totalChapters,
                  translatedChapters,
                  translationPercent,
                  readChaptersCount,
                  readingPercent,
                  progressText,
                  lastCh
                } = getNovelProgress(novel);

                const isActive = activeNovelId === novel.id;

                return (
                  <div
                    key={novel.id}
                    onClick={() => onSelectNovel(novel.id, true)}
                    className={`group ${uiCard} hover:shadow-lg transition-all duration-200 cursor-pointer flex flex-col relative overflow-hidden active:scale-[0.99] border-t-4 border-t-app-accent/90`}
                  >
                    {/* Active read label */}
                    {isActive && (
                      <span className="absolute top-3 right-3 text-[8px] bg-app-accent/15 text-app-accent border border-app-accent/20 px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider animate-pulse">
                        Đang đọc
                      </span>
                    )}

                    {/* Book Cover simulation */}
                    <div className="p-4 bg-gradient-to-br from-app-surface-muted/50 to-app-surface border-b border-app-border flex items-start gap-3">
                      <div className="w-10 h-13 bg-app-accent/10 border border-app-accent/20 rounded-lg flex items-center justify-center shrink-0">
                        <Book className="w-5 h-5 text-app-accent group-hover:rotate-6 transition-transform" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-app-text truncate group-hover:text-app-accent transition-colors leading-snug" title={novel.title}>
                          {novel.title}
                        </h4>
                        <span className={`${uiCaption} text-[9px] block mt-1`}>
                          Tổng chương: {totalChapters}
                        </span>
                        <div className={`flex items-center gap-1 mt-1 text-[8px] ${uiCaption}`}>
                          <Calendar className="w-2.5 h-2.5 text-app-text-muted" />
                          <span>{novel.createdAt || "Hôm nay"}</span>
                        </div>
                      </div>
                    </div>

                    {/* Core stats block */}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-3.5">
                      {/* Translation statistics */}
                      <div className="space-y-1.5">
                        <div className={`flex items-center justify-between text-[10px] ${uiCaption} font-medium leading-none`}>
                          <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" /> Tiến độ dịch:</span>
                          <span className="font-bold text-app-text font-mono">
                            {translatedChapters}/{totalChapters} C ({translationPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-app-surface-muted h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full transition-all duration-300" 
                            style={{ width: `${translationPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Reading statistics */}
                      <div className="space-y-1.5">
                        <div className={`flex items-center justify-between text-[10px] ${uiCaption} font-medium leading-none`}>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-app-accent shrink-0" /> Tiến độ đọc:</span>
                          <span className="font-bold text-app-text font-mono">
                            {readChaptersCount}/{totalChapters} C ({readingPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-app-surface-muted h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-app-accent h-full transition-all duration-300" 
                            style={{ width: `${readingPercent}%` }}
                          />
                        </div>
                        <p className={`${uiCaption} text-[10px] truncate italic block pl-4 leading-normal select-none`} title={progressText}>
                          {progressText}
                        </p>
                      </div>

                      {/* Card actions wrapper - cleanly spaced */}
                      <div className="pt-2 border-t border-app-border flex items-center justify-between shrink-0">
                        <span className="text-[10px] text-app-accent font-bold group-hover:underline flex items-center gap-0.5">
                          Đọc ngay <ChevronRight className="w-3 h-3" />
                        </span>
                        
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setNovelToDelete(novel);
                            setDeleteOption("library_only");
                          }}
                          className="p-1.5 hover:text-red-500 text-app-text-muted hover:bg-red-500/10 rounded-lg transition-all"
                          title="Xóa truyện"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* List Layout Bookshelf representation */
            <div className="flex flex-col gap-3">
              {novels.map((novel) => {
                const {
                  totalChapters,
                  translatedChapters,
                  translationPercent,
                  readChaptersCount,
                  readingPercent,
                  progressText,
                  lastCh
                } = getNovelProgress(novel);

                const isActive = activeNovelId === novel.id;

                return (
                  <div
                    key={novel.id}
                    onClick={() => onSelectNovel(novel.id, true)}
                    className={`p-3.5 ${uiCard} rounded-xl hover:shadow-md hover:border-app-accent transition-all duration-200 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 active:scale-[0.99] border-l-[3px] border-l-transparent hover:border-l-app-accent`}
                  >
                    {/* Left Info Column */}
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <div className="w-10 h-13 bg-app-accent/10 border border-app-accent/20 rounded-xl flex items-center justify-center shrink-0">
                        <Book className="w-5.5 h-5.5 text-app-accent" />
                      </div>
                      
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className={`${uiTitle} text-sm truncate leading-snug`}>
                            {novel.title}
                          </h4>
                          {isActive && (
                            <span className="text-[8px] bg-app-accent/15 text-app-accent px-1.5 py-0.5 rounded font-semibold uppercase tracking-wider animate-pulse">
                              Đang đọc
                            </span>
                          )}
                        </div>
                        <div className={`flex items-center gap-3 text-[10px] ${uiCaption} mt-1`}>
                          <span className="truncate">Tác phẩm lưu offline</span>
                          <span>•</span>
                          <span>Tổng cộng: {totalChapters} chương</span>
                        </div>
                      </div>
                    </div>

                    {/* Progress Bars / Stats Columns (Aggregated seamlessly) */}
                    <div className="grid grid-cols-2 gap-4 shrink-0 w-full md:w-80 border-t md:border-t-0 pt-3 md:pt-0 border-app-border">
                      {/* Translation specs */}
                      <div className="space-y-1">
                        <div className={`flex items-center justify-between text-[10px] ${uiCaption}`}>
                          <span className="font-semibold truncate">Biên dịch:</span>
                          <span className="font-bold text-emerald-600 font-mono truncate pl-1">
                            {translatedChapters}/{totalChapters} ({translationPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-app-surface-muted h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-emerald-500 h-full" 
                            style={{ width: `${translationPercent}%` }}
                          />
                        </div>
                      </div>

                      {/* Reading specs */}
                      <div className="space-y-1">
                        <div className={`flex items-center justify-between text-[10px] ${uiCaption}`}>
                          <span className="font-semibold truncate">Đã đọc:</span>
                          <span className="font-bold text-app-accent font-mono truncate pl-1">
                            {readChaptersCount}/{totalChapters} ({readingPercent}%)
                          </span>
                        </div>
                        <div className="w-full bg-app-surface-muted h-1 rounded-full overflow-hidden">
                          <div 
                            className="bg-app-accent h-full" 
                            style={{ width: `${readingPercent}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Ultimate actions right end of row */}
                    <div className="flex items-center justify-end gap-2 shrink-0 border-t md:border-t-0 pt-2.5 md:pt-0 border-app-border w-full md:w-auto">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setNovelToDelete(novel);
                          setDeleteOption("library_only");
                        }}
                        className="p-1.5 hover:text-red-500 hover:bg-red-500/10 text-app-text-muted rounded-lg transition-all"
                        title="Xóa truyện"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {showToolsModal &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex flex-col bg-app-surface sm:app-modal-overlay sm:items-center sm:justify-center sm:p-4 animate-fade-in"
            id="library-tools-and-loaders-modal"
            role="dialog"
            aria-modal="true"
          >
            <div className={`app-sheet-handle relative flex flex-col flex-1 min-h-0 w-full h-[100dvh] max-h-[100dvh] sm:h-auto sm:max-h-[min(92dvh,880px)] sm:flex-none sm:max-w-2xl ${uiPanel} sm:rounded-xl sm:shadow-2xl text-app-text !p-0`}>
              <div className="lab-chrome-safe-top app-chrome-safe-top shrink-0 px-4 pb-3 sm:px-6 sm:pt-6 border-b border-app-border">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <SlidersHorizontal className="w-5 h-5 text-app-accent shrink-0" />
                    <div className="min-w-0">
                      <h3 className={uiTitle}>
                        Bảng Điều Khiển Thư Viện
                      </h3>
                      <p className={`${uiCaption} mt-0.5`}>
                        Kệ sách · xuất ebook · nạp truyện Trung
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowToolsModal(false)}
                    className={`${uiBtnGhost} h-9 px-3 text-xs font-bold shrink-0`}
                    title="Quay lại"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    Quay lại
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden custom-scrollbar px-4 py-4 sm:px-6 space-y-6">
              {toolsFeedback ? (
                <div
                  className={
                    toolsFeedback.tone === "success"
                      ? uiInlineFeedbackSuccess
                      : toolsFeedback.tone === "warning"
                      ? uiInlineFeedbackWarning
                      : toolsFeedback.tone === "danger"
                      ? uiInlineFeedbackDanger
                      : uiInlineFeedbackInfo
                  }
                >
                  {toolsFeedback.message}
                </div>
              ) : null}

              {/* 1. Bookshelf Layout setting */}
              <div className={`${uiCardInset} p-4 space-y-3`}>
                <span className={`${uiLabel} text-[10px] block`}>
                  (1) Cài đặt kiểu hiển thị kệ sách:
                </span>
                
                <div className={uiSegmentedTrack}>
                  <button
                    type="button"
                    onClick={() => toggleBookshelfType("grid")}
                    className={bookshelfType === "grid" ? uiSegmentedBtnActive : uiSegmentedBtnIdle}
                  >
                    <Grid className="w-4 h-4" /> Bố trí dạng lưới
                  </button>

                  <button
                    type="button"
                    onClick={() => toggleBookshelfType("list")}
                    className={bookshelfType === "list" ? uiSegmentedBtnActive : uiSegmentedBtnIdle}
                  >
                    <List className="w-4 h-4" /> Bố trí dạng danh sách
                  </button>
                </div>
              </div>

              {/* 2. Ebook exporter (Conditional rendering when books are present) */}
              <div className={`${uiCardInset} p-4 space-y-4`}>
                <span className={`${uiLabel} text-[10px] block`}>
                  (2) Kết xuất sách ra ebook để đọc:
                </span>

                {novels.length === 0 ? (
                  <p className={`${uiCaption} italic select-none`}>
                    Chưa có sách nào trong thư viện để cấu hình xuất bản.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {/* Tarbook selector */}
                    <div className="space-y-1">
                      <label className={uiFieldLabel}>Đối tượng sách cần xuất bản:</label>
                      <select
                        value={exportNovelId}
                        onChange={(e) => setExportNovelId(e.target.value)}
                        className={`${uiInput} text-xs font-bold`}
                      >
                        {novels.map(b => (
                          <option key={b.id} value={b.id}>
                            {b.title} ({b.chapters.length} chương)
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Numeric interval range selectors */}
                    <div className="grid grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label className={uiFieldLabel}>Xuất từ chương:</label>
                        <input
                          type="number"
                          min={1}
                          max={targetExportNovel?.chapters.length || 1}
                          value={exportStartIdx}
                          onChange={(e) => setExportStartIdx(Math.max(1, parseInt(e.target.value) || 1))}
                          className={`${uiInput} text-xs font-bold font-mono`}
                        />
                      </div>

                      <div className="space-y-1">
                        <label className={uiFieldLabel}>Đến chương:</label>
                        <input
                          type="number"
                          min={1}
                          max={targetExportNovel?.chapters.length || 1}
                          value={exportEndIdx}
                          onChange={(e) => setExportEndIdx(Math.min(targetExportNovel?.chapters.length || 1, Math.max(1, parseInt(e.target.value) || 1)))}
                          className={`${uiInput} text-xs font-bold font-mono`}
                        />
                      </div>
                    </div>

                    {/* Document selector formats */}
                    <div className="space-y-2">
                      <label className={uiFieldLabel}>Chọn Định dạng ebook tệp tải:</label>
                      <div className={`${uiSegmentedTrack} grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs select-none`}>
                        {[
                          { key: "txt", name: "Text (.txt)" },
                          { key: "docx", name: "Word (.doc)" },
                          { key: "epub", name: "Epub (.epub)" },
                          { key: "pdf", name: "PDF Sách" }
                        ].map((fmt) => (
                          <button
                            key={fmt.key}
                            type="button"
                            onClick={() => setExportFormat(fmt.key as any)}
                            className={exportFormat === fmt.key ? uiSegmentedBtnActive : uiSegmentedBtnIdle}
                          >
                            {fmt.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Compile launch action trigger button */}
                    <button
                      type="button"
                      onClick={handleExport}
                      className={`${uiBtnPrimary} w-full min-h-11 text-xs font-bold`}
                    >
                      <Download className="w-4 h-4" /> Bắt đầu xuất bản {exportEndIdx - exportStartIdx + 1} chương chọn lọc
                    </button>
                  </div>
                )}
              </div>

              {/* 2b. Sao lưu data dịch Lab — theo truyện đang chọn */}
              <div className={`${uiCard} border-app-accent/35 bg-app-accent/8 p-4 space-y-3`}>
                <span className={`${uiLabel} text-[10px] block`}>
                  (2b) Sao lưu / Nạp data dịch Lab (ZIP an toàn):
                </span>
                <p className={`${uiCaption} text-[10.5px] leading-relaxed`}>
                  Chỉ bản dịch chương — không gồm cấu hình app. Phù hợp sau khi gỡ cài và cài lại APK.
                </p>
                {novels.length === 0 ? (
                  <p className={`${uiCaption} italic`}>Chưa có truyện trong thư viện.</p>
                ) : (
                  <>
                    <p className={uiCaption}>
                      Truyện đang chọn:{" "}
                      <span className="font-bold text-app-text truncate">
                        {targetExportNovel?.title ?? "—"}
                      </span>
                      {" · "}
                      <span className="font-bold">{translatedCountForExportNovel}</span> chương đã dịch
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={handleExportTranslationBackup}
                        disabled={
                          isExportingTranslation ||
                          !targetExportNovel ||
                          translatedCountForExportNovel === 0
                        }
                        className={`${uiBtnPrimary} w-full min-h-10 text-xs font-bold`}
                      >
                        <Download className="w-4 h-4" />
                        {isExportingTranslation ? "Đang đóng gói…" : "Tải data dịch truyện này"}
                      </button>
                      {onImportTranslationBackup ? (
                        <label
                          className={`${uiBtnSecondary} w-full min-h-10 text-xs font-bold cursor-pointer justify-center ${
                            isImportingTranslation ? "opacity-60 pointer-events-none" : ""
                          }`}
                        >
                          <FileDown className="w-4 h-4" />
                          {isImportingTranslation ? "Đang nạp…" : "Nạp data dịch (gộp)"}
                          <input
                            type="file"
                            accept={
                              typeof navigator !== "undefined" &&
                              /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                                navigator.userAgent
                              )
                                ? "*/*"
                                : ".zip"
                            }
                            className="hidden"
                            onChange={handleImportTranslationBackupFile}
                            disabled={isImportingTranslation}
                          />
                        </label>
                      ) : null}
                    </div>
                  </>
                )}
              </div>

              {/* 3. Tải Truyện Tiếng Trung Đầu Vào (Novel Loader integrated beautifully) */}
              <div className={`${uiCardInset} p-4 space-y-4`}>
                <span className={`${uiLabel} text-[10px] block`}>
                  (3) Tải truyện tiếng Trung đầu vào:
                </span>
                
                <NovelLoader
                  onChaptersLoaded={(title, chs, rawText, chapterHeaderPattern) => {
                    onChaptersLoaded(title, chs, rawText, chapterHeaderPattern);
                    setShowToolsModal(false); // Auto close tools modal to show added book
                  }}
                  isTranslating={isTranslating}
                  onAlert={onAlert}
                  chapterRuleStates={chapterRuleStates}
                  onChapterRuleStatesChange={onChapterRuleStatesChange}
                />
              </div>

              </div>

              <div className="app-chrome-safe-bottom shrink-0 px-4 py-3 sm:px-6 border-t border-app-border flex items-center justify-end gap-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={() => setShowToolsModal(false)}
                  className={`${uiBtnGhost} px-5 text-xs font-bold`}
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Custom Deletion Dialog Modal */}
      {novelToDelete && (
        <div
          className="fixed inset-0 app-modal-overlay flex items-center justify-center p-4 z-54 select-none animate-fade-in"
          id="delete-option-dialog"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận xóa tác phẩm"
        >
          <div className={`${uiPanel} app-sheet-handle app-chrome-safe-top app-chrome-safe-bottom p-6 shadow-2xl max-w-lg w-full animate-scale-up text-app-text max-h-[calc(100dvh-2rem)] overflow-y-auto custom-scrollbar`}>
            <h4 className={`${uiTitle} text-sm flex items-center gap-2 uppercase`}>
              <Trash2 className="w-5 h-5 text-red-500 shrink-0" />
              XÁC NHẬN XÓA TÁC PHẨM
            </h4>
            
            <p className={`${uiCaption} mt-3 font-medium`}>
              Bạn đang yêu cầu xóa tác phẩm <span className="font-extrabold text-app-text">"{novelToDelete.title}"</span>. Hãy chọn phương thức xóa phù hợp nhất dưới đây:
            </p>

            <div className="mt-5 space-y-3.5 select-none">
              <div 
                onClick={() => setDeleteOption("library_only")}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  deleteOption === "library_only"
                    ? "border-app-accent bg-app-accent/10"
                    : `${uiCardInset} hover:bg-app-surface-muted`
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  deleteOption === "library_only" ? "border-app-accent" : "border-app-border"
                }`}>
                  {deleteOption === "library_only" && <div className="w-2 h-2 rounded-full bg-app-accent" />}
                </div>
                <div>
                  <h5 className={`${uiTitle} text-xs flex items-center gap-1.5 leading-none`}>
                    (1) Chỉ xóa tên truyện khỏi Thư Viện
                  </h5>
                  <p className={`${uiCaption} text-[11px] mt-1.5`}>
                    Chỉ gỡ bỏ truyện khỏi trang hiển thị của Thư Viện. <span className="font-semibold text-app-accent">Toàn bộ các chương và trang đã dịch xong vẫn được bảo lưu trọn vẹn</span> trên Cây Thư Mục của thiết bị.
                  </p>
                </div>
              </div>

              <div 
                onClick={() => setDeleteOption("complete")}
                className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-3.5 ${
                  deleteOption === "complete"
                    ? "border-red-500 bg-red-500/10"
                    : `${uiCardInset} hover:bg-app-surface-muted`
                }`}
              >
                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 ${
                  deleteOption === "complete" ? "border-red-500" : "border-app-border"
                }`}>
                  {deleteOption === "complete" && <div className="w-2 h-2 rounded-full bg-red-500" />}
                </div>
                <div>
                  <h5 className={`${uiTitle} text-xs flex items-center gap-1.5 leading-none`}>
                    (2) Xóa toàn diện mọi dữ liệu
                  </h5>
                  <p className={`${uiCaption} text-[11px] mt-1.5 text-red-600`}>
                    Xóa sạch tên truyện, toàn bộ các chương Hán văn gốc, các bản dịch hoàn thiện cùng các mảnh cache trang lẻ khỏi Cây Thư Mục của thiết bị để giải phóng bộ nhớ. Không thể khôi phục!
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setNovelToDelete(null)}
                className={`${uiBtnGhost} flex-1 min-h-11 text-xs font-semibold`}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteNovel(novelToDelete.id, deleteOption);
                  if (selectedNovelId === novelToDelete.id) {
                    setSelectedNovelId(null);
                  }
                  setNovelToDelete(null);
                }}
                className={`flex-1 min-h-11 text-xs font-semibold ${
                  deleteOption === "complete" ? uiBtnDanger : uiBtnPrimary
                }`}
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
