import React, { useState, useEffect, useRef } from "react";
import { Columns, Copy, Check, Edit2, CheckCircle2, ListCollapse } from "lucide-react";
import { pinyin } from "pinyin-pro";
import {
  uiBtnPrimary,
  uiBtnGhost,
  uiTitle,
  uiSubtitle,
  uiCaption,
  uiCompareStage,
  uiSegmentedTrack,
  uiSegmentedBtnActive,
  uiSegmentedBtnIdle,
  uiInfoBanner,
} from "../lib/ui";
import {
  buildCompareBilingualTexts,
  formatLineMismatchWarning,
  parseCompareTranslationSave,
  type ChapterTranslationResult,
} from "../utils/chapterTranslationEngine";
import {
  findNameInconsistenciesInChapter,
  replaceAllExact,
  type NameInconsistencySuggestion,
  extractVietnameseNameLikePhrases,
} from "../utils/nameConsistency";
import type { DictItem } from "../types";
import { extractChineseCandidates, isAlreadyInDict, type ChapterNameRow } from "../utils/chapterNameTable";

const pinyinCache = new Map<string, string>();

function getPinyinOfLine(line: string): string {
  if (!line) return "";
  const trimmed = line.trim();
  if (!trimmed) return "";
  if (pinyinCache.has(trimmed)) {
    return pinyinCache.get(trimmed)!;
  }
  try {
    const result = pinyin(trimmed, { toneType: "symbol" });
    pinyinCache.set(trimmed, result);
    return result;
  } catch (err) {
    return "";
  }
}

interface CompareViewProps {
  chapterId: string;
  chapterTitle?: string;
  sourceText: string;
  translatedTitle?: string;
  translatedText: string;
  onUpdateTranslation: (update: ChapterTranslationResult) => void;
  /** Optional: cho phép thêm nhanh vào từ điển từ bảng tên chương */
  onAddDictWord?: (zh: string, vi: string, cat: DictItem["category"], novelId?: string) => void;
  dictItems?: DictItem[];
  novelId?: string;
  /** Gợi ý bật pinyin khi mở chương (người dùng vẫn tắt/bật bằng nút gạt) */
  initialShowPinyin?: boolean;
  initialViewStyle?: "columns" | "interleaved";
  openFocusBanner?: string | null;
}

function splitAlignedLines(sourceText: string, translatedText: string): {
  sourceLines: string[];
  translatedLines: string[];
} {
  const original = sourceText.replace(/\r\n/g, "\n").split("\n");
  const translated = translatedText.replace(/\r\n/g, "\n").split("\n");
  const maxLines = Math.max(original.length, translated.length);
  const sourceLines = [...original];
  const translatedLines = [...translated];
  while (sourceLines.length < maxLines) sourceLines.push("");
  while (translatedLines.length < maxLines) translatedLines.push("");
  return { sourceLines, translatedLines };
}

export default function CompareView({
  chapterId,
  chapterTitle = "",
  sourceText,
  translatedTitle,
  translatedText,
  onUpdateTranslation,
  onAddDictWord,
  dictItems = [],
  novelId,
  initialShowPinyin = false,
  initialViewStyle = "columns",
  openFocusBanner = null,
}: CompareViewProps) {
  const [viewStyle, setViewStyle] = useState<"columns" | "interleaved">(initialViewStyle);
  const [showPinyin, setShowPinyin] = useState(initialShowPinyin);
  const [focusBanner, setFocusBanner] = useState(openFocusBanner);
  const [sourceLines, setSourceLines] = useState<string[]>([]);
  const [translatedLines, setTranslatedLines] = useState<string[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState("");
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [lineMismatchWarning, setLineMismatchWarning] = useState<string | null>(null);
  const [nameSuggestions, setNameSuggestions] = useState<NameInconsistencySuggestion[]>([]);
  const [showNameSuggest, setShowNameSuggest] = useState(false);
  const [showChapterNames, setShowChapterNames] = useState(false);
  const [chapterNames, setChapterNames] = useState<ChapterNameRow[]>([]);
  const [nameScope, setNameScope] = useState<"riêng" | "chung">("riêng");
  const compareMetaRef = useRef({ hasTitleLine: false });
  const lastChapterIdRef = useRef(chapterId);

  useEffect(() => {
    setFocusBanner(openFocusBanner);
  }, [openFocusBanner, chapterId]);

  // Chỉ áp dụng gợi ý pinyin / dạng xem khi ĐỔI chương — không ghi đè nút gạt khi sửa bản dịch
  useEffect(() => {
    if (lastChapterIdRef.current !== chapterId) {
      lastChapterIdRef.current = chapterId;
      setViewStyle(initialViewStyle);
      setShowPinyin(initialShowPinyin);
    }
  }, [chapterId, initialShowPinyin, initialViewStyle]);

  // Đổi chương hoặc nội dung: cập nhật dòng, cuộn về đầu
  useEffect(() => {
    setEditingIndex(null);
    setEditingText("");
    setCopiedIndex(null);
    const { sourceCombined, translatedCombined, hasTitleLine } = buildCompareBilingualTexts(
      chapterTitle,
      sourceText,
      translatedTitle,
      translatedText
    );
    compareMetaRef.current = { hasTitleLine };
    const { sourceLines: nextSource, translatedLines: nextTranslated } = splitAlignedLines(
      sourceCombined,
      translatedCombined
    );
    setSourceLines(nextSource);
    setTranslatedLines(nextTranslated);
    setLineMismatchWarning(
      formatLineMismatchWarning(chapterTitle, sourceText, translatedTitle, translatedText)
    );
    setNameSuggestions(findNameInconsistenciesInChapter(translatedCombined, { maxSuggestions: 10 }));

    // Bảng tên chương (gợi ý + duyệt tay): trích cụm viết hoa + đếm theo dòng, gợi ý Hán theo lineIndex
    try {
      const phrases = extractVietnameseNameLikePhrases(translatedCombined);
      const freq = new Map<string, number>();
      for (const p of phrases) freq.set(p, (freq.get(p) ?? 0) + 1);
      const unique = Array.from(freq.entries())
        .sort((a, b) => (b[1] - a[1]) || (b[0].length - a[0].length))
        .slice(0, 24);

      const rows: ChapterNameRow[] = unique.map(([vi, count]) => {
        // tìm dòng đầu tiên chứa cụm
        const idx = nextTranslated.findIndex((l) => (l || "").includes(vi));
        const srcLine = idx >= 0 ? (nextSource[idx] ?? "") : "";
        const trLine = idx >= 0 ? (nextTranslated[idx] ?? "") : "";
        const candidates = srcLine ? extractChineseCandidates(srcLine) : [];
        const guess = candidates[0];
        return {
          vietnamese: vi,
          count,
          chineseGuess: guess,
          sourceLine: srcLine,
          translatedLine: trLine,
          lineIndex: idx >= 0 ? idx : undefined,
          alreadyInDict: guess ? isAlreadyInDict(guess, vi, dictItems, novelId) : false,
        };
      });
      setChapterNames(rows);
    } catch {
      setChapterNames([]);
    }
    const stage = document.getElementById("compare-scroll-stage");
    if (stage) stage.scrollTop = 0;
  }, [chapterId, chapterTitle, sourceText, translatedTitle, translatedText]);

  const handleStartEdit = (index: number) => {
    setEditingIndex(index);
    setEditingText(translatedLines[index]);
  };

  const handleSaveEdit = (index: number) => {
    const updated = [...translatedLines];
    updated[index] = editingText;
    setTranslatedLines(updated);
    setEditingIndex(null);
    onUpdateTranslation(parseCompareTranslationSave(updated, compareMetaRef.current.hasTitleLine));
  };

  const applyReplaceInChapter = (from: string, to: string) => {
    const updated = translatedLines.map((l) => replaceAllExact(l, from, to));
    setTranslatedLines(updated);
    onUpdateTranslation(parseCompareTranslationSave(updated, compareMetaRef.current.hasTitleLine));
  };

  const addChapterNameToDict = (row: ChapterNameRow) => {
    if (!onAddDictWord) return;
    const zh = (row.chineseGuess || "").trim();
    const vi = row.vietnamese.trim();
    if (!zh || !vi) return;
    const scopeNovelId = nameScope === "riêng" ? novelId : undefined;
    onAddDictWord(zh, vi, "name", scopeNovelId);
  };

  const copyRow = (index: number) => {
    const textToCopy = `Trung: ${sourceLines[index]}\nViệt : ${translatedLines[index]}`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 1500);
  };

  const copyAllVietnamese = () => {
    const cleanText = translatedLines.join("\n");
    navigator.clipboard.writeText(cleanText);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  return (
    <div
      className="bg-transparent border-0 rounded-none p-0 shadow-none flex flex-col h-full min-h-0 w-full max-w-none md:max-w-[96%] mx-auto px-1 sm:px-2"
      id="compare-view-container"
    >
      {focusBanner && (
        <div className={uiInfoBanner}>
          <span>{focusBanner}</span>
          <button
            type="button"
            onClick={() => setFocusBanner(null)}
            className="text-[10px] font-medium uppercase shrink-0 opacity-70 hover:opacity-100"
          >
            Đóng
          </button>
        </div>
      )}
      {lineMismatchWarning && (
        <div className={`${uiInfoBanner} border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200`}>
          <span>{lineMismatchWarning}</span>
        </div>
      )}
      {nameSuggestions.length > 0 && (
        <div className={`${uiInfoBanner} border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200`}>
          <span>
            Phát hiện <strong>{nameSuggestions.length}</strong> cặp tên riêng có thể không nhất quán trong chương này (vd. Hy/Hi, Phượng/Phong…).
          </span>
          <button
            type="button"
            onClick={() => setShowNameSuggest(true)}
            className="text-[10px] font-medium uppercase shrink-0 opacity-80 hover:opacity-100"
          >
            Xem gợi ý
          </button>
        </div>
      )}
      <div className="shrink-0 flex flex-col lg:flex-row lg:items-center justify-between gap-2 border-b border-app-border pb-2 mb-2 w-full">
        <div className="min-w-0">
          <h2 className={`${uiTitle} flex items-center gap-2`}>
            <Columns className="w-4 h-4 text-app-accent shrink-0" /> Đối chiếu & hiệu đính
          </h2>
          <p className={`${uiCaption} mt-0.5`}>
            Nhấp đúp dòng Việt để sửa. <strong className="text-app-text font-medium">Cột</strong> = Hán|Pinyin trái · Việt phải;{" "}
            <strong className="text-app-text font-medium">Xen kẽ</strong> = từng dòng xếp dọc.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className={uiSegmentedTrack}>
            <button
              type="button"
              onClick={() => setViewStyle("columns")}
              className={viewStyle === "columns" ? uiSegmentedBtnActive : uiSegmentedBtnIdle}
            >
              <Columns className="w-4 h-4 shrink-0 opacity-70" />
              <span className="truncate">Cột</span>
            </button>
            <button
              type="button"
              onClick={() => setViewStyle("interleaved")}
              className={viewStyle === "interleaved" ? uiSegmentedBtnActive : uiSegmentedBtnIdle}
            >
              <ListCollapse className="w-4 h-4 shrink-0 opacity-70" />
              <span className="truncate">Xen kẽ</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => setShowChapterNames(true)}
              className={`${uiBtnGhost} flex-1 sm:flex-initial !text-xs`}
              title="Bảng tên chương: gợi ý tên riêng + duyệt tay"
            >
              <span className="truncate">Tên chương</span>
            </button>
            <button
              type="button"
              onClick={copyAllVietnamese}
              className={`${uiBtnPrimary} flex-1 sm:flex-initial !text-xs`}
              id="compare-copy-all-btn"
            >
              {copiedAll ? <Check className="w-4 h-4 shrink-0" /> : <Copy className="w-4 h-4 shrink-0" />}
              <span className="truncate">{copiedAll ? "Đã chép" : "Copy Việt"}</span>
            </button>

            <div
              className="min-h-10 flex items-center gap-2 border border-app-border bg-app-surface px-3 rounded-md text-xs select-none shrink-0"
              id="compare-pinyin-container"
            >
              <span className="text-app-text-muted font-medium">Pinyin</span>
              <button
                type="button"
                onClick={() => setShowPinyin(!showPinyin)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  showPinyin ? "bg-app-accent" : "bg-app-border"
                }`}
                id="compare-pinyin-toggle"
                aria-label="Bật/tắt Pinyin"
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition ${
                    showPinyin ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>

      {showChapterNames && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]"
            aria-label="Đóng bảng tên chương"
            onClick={() => setShowChapterNames(false)}
          />
          <div className="fixed inset-x-3 top-[8dvh] z-[70] max-w-3xl mx-auto bg-app-surface border border-app-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-app-border flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-app-text truncate">Bảng tên chương (gợi ý + duyệt tay)</h3>
                <p className="text-[11px] text-app-text-muted mt-0.5">
                  Trích các cụm viết hoa trong bản Việt, kèm gợi ý Hán theo dòng. Bạn có thể thêm vào từ điển để “đóng đinh” tên cho cả truyện.
                </p>
              </div>
              <button type="button" className={uiBtnGhost} onClick={() => setShowChapterNames(false)}>
                Đóng
              </button>
            </div>
            <div className="px-4 py-2 border-b border-app-border flex items-center justify-between gap-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-app-text-muted">
                Lưu vào từ điển
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setNameScope("riêng")}
                  className={`${uiBtnGhost} !min-h-9 !text-[11px] ${
                    nameScope === "riêng" ? "border-app-accent text-app-accent" : ""
                  }`}
                  title="Chỉ áp dụng cho truyện này"
                >
                  Riêng truyện
                </button>
                <button
                  type="button"
                  onClick={() => setNameScope("chung")}
                  className={`${uiBtnGhost} !min-h-9 !text-[11px] ${
                    nameScope === "chung" ? "border-app-accent text-app-accent" : ""
                  }`}
                  title="Áp dụng chung mọi truyện"
                >
                  Chung
                </button>
              </div>
            </div>
            <div className="max-h-[72dvh] overflow-y-auto custom-scrollbar p-3 space-y-2">
              {chapterNames.length === 0 ? (
                <div className="p-6 text-center text-app-text-muted text-sm">
                  Chưa trích được tên nào (chương quá ngắn hoặc bản Việt ít chữ viết hoa).
                </div>
              ) : (
                chapterNames.map((row, idx) => (
                  <div key={idx} className="bg-app-surface-muted/60 border border-app-border rounded-xl p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-app-text truncate">
                          {row.vietnamese}{" "}
                          <span className="text-[10px] text-app-text-muted font-mono">({row.count}×)</span>
                          {row.alreadyInDict ? (
                            <span className="ml-2 text-[10px] font-bold text-emerald-600">✓ đã có</span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-app-text-muted mt-1 space-y-1">
                          <div className="truncate">
                            Hán gợi ý:{" "}
                            <span className="font-mono font-bold text-app-text">
                              {row.chineseGuess ? row.chineseGuess : "—"}
                            </span>
                            {row.lineIndex !== undefined ? (
                              <span className="ml-2 font-mono text-[10px] opacity-70">
                                dòng {row.lineIndex + 1}
                              </span>
                            ) : null}
                          </div>
                          {row.sourceLine ? (
                            <div className="truncate" title={row.sourceLine}>
                              Gốc: <span className="font-mono">{row.sourceLine}</span>
                            </div>
                          ) : null}
                          {row.translatedLine ? (
                            <div className="truncate" title={row.translatedLine}>
                              Việt: <span className="font-mono">{row.translatedLine}</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                          type="button"
                          className={`${uiBtnPrimary} !min-h-9 !text-[11px]`}
                          disabled={!onAddDictWord || !row.chineseGuess || row.alreadyInDict}
                          onClick={() => addChapterNameToDict(row)}
                          title="Thêm vào từ điển để áp dụng về sau"
                        >
                          Thêm
                        </button>
                        <button
                          type="button"
                          className={`${uiBtnGhost} !min-h-9 !text-[11px]`}
                          onClick={() => navigator.clipboard.writeText(`${row.chineseGuess ?? ""} -> ${row.vietnamese}`.trim())}
                          title="Copy cặp Hán -> Việt"
                        >
                          Copy
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {showNameSuggest && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-[60] bg-black/45 backdrop-blur-[2px]"
            aria-label="Đóng gợi ý tên"
            onClick={() => setShowNameSuggest(false)}
          />
          <div className="fixed inset-x-3 top-[10dvh] z-[70] max-w-2xl mx-auto bg-app-surface border border-app-border rounded-2xl shadow-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-app-text truncate">Gợi ý đồng nhất tên riêng</h3>
                <p className="text-[11px] text-app-text-muted mt-0.5">
                  Đây là gợi ý dựa trên độ giống nhau. Nếu đúng, bạn có thể thay toàn chương và (tuỳ chọn) thêm vào từ điển qua popup ở Phòng Đọc.
                </p>
              </div>
              <button type="button" className={uiBtnGhost} onClick={() => setShowNameSuggest(false)}>
                Đóng
              </button>
            </div>
            <div className="max-h-[70dvh] overflow-y-auto custom-scrollbar p-3 space-y-2">
              {nameSuggestions.map((s, idx) => (
                <div key={idx} className="bg-app-surface-muted/60 border border-app-border rounded-xl p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-app-text truncate">
                        “{s.a}” ({s.countA}×) ↔ “{s.b}” ({s.countB}×)
                      </div>
                      <div className="text-[10px] text-app-text-muted mt-0.5">
                        Độ giống: <span className="font-mono font-bold">{s.score}</span>/100
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <button
                        type="button"
                        className={`${uiBtnPrimary} !min-h-9 !text-[11px]`}
                        onClick={() => applyReplaceInChapter(s.b, s.a)}
                        title="Thay B → A trong toàn chương"
                      >
                        Dùng “{s.a}”
                      </button>
                      <button
                        type="button"
                        className={`${uiBtnGhost} !min-h-9 !text-[11px]`}
                        onClick={() => applyReplaceInChapter(s.a, s.b)}
                        title="Thay A → B trong toàn chương"
                      >
                        Dùng “{s.b}”
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div
        id="compare-scroll-stage"
        onContextMenu={(e) => {
          e.preventDefault();
        }}
        className={uiCompareStage}
      >
        {sourceLines.length === 0 || (sourceLines.length === 1 && sourceLines[0] === "") ? (
          <div className={`p-12 text-center italic ${uiCaption}`}>
            Chưa có nội dung truyện để đối chiếu. Hãy tiến hành dịch thuật ở phòng làm việc.
          </div>
        ) : (
          sourceLines.map((srcLine, idx) => {
            const hasContent = srcLine.trim() !== "" || translatedLines[idx]?.trim() !== "";
            if (!hasContent) {
              return (
                <div key={`${chapterId}-blank-${idx}`} className="h-7 bg-zinc-100/20 dark:bg-zinc-950/40 italic text-[11px] text-zinc-400 text-center select-none py-1.5">
                  (Dòng trống)
                </div>
              );
            }

            const isEditingRow = editingIndex === idx;

            return (
              <div
                key={`${chapterId}-row-${idx}`}
                className={`transition-all p-4 group relative rounded-lg ${
                  isEditingRow 
                    ? "aligned-row-editing bg-app-accent/8" 
                    : "hover:bg-app-surface-muted/80"
                }`}
              >
                {/* Visual Line Number Badge in margins */}
                <span className="absolute left-2.5 top-3.5 text-[9px] font-mono font-medium text-app-text-muted select-none bg-app-surface border border-app-border px-1 rounded">
                  {idx + 1}
                </span>

                {/* Compare Row Layouts - Adaptive Grid (Stacks on Mobile, Columns on Desktop) */}
                {viewStyle === "columns" ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 w-full pl-8 sm:pl-10 pr-2 sm:pr-4 min-w-0">
                    {/* Cột trái: Hán + Pinyin (tùy chọn) */}
                    <div className="flex flex-col gap-1.5 min-w-0 border-r border-app-border/60 pr-2 sm:pr-3">
                      <div className="text-app-text-muted text-xs tracking-wider select-all font-sans leading-relaxed">
                        {srcLine}
                      </div>
                      {srcLine.trim() && showPinyin && (
                        <div className="text-[11px] font-mono tracking-wider text-emerald-600 dark:text-emerald-400/80 select-all leading-relaxed bg-emerald-50/35 dark:bg-emerald-950/25 px-2 py-0.5 rounded border border-emerald-100 dark:border-emerald-900/20 max-w-max" title="Phiên âm Pinyin">
                          Pinyin: {getPinyinOfLine(srcLine)}
                        </div>
                      )}
                    </div>

                    {/* Cột phải: Việt */}
                    <div className="serif-reading-font min-w-0 pl-1 sm:pl-2">
                      {isEditingRow ? (
                        <div className="flex items-start gap-2 animate-scale-up">
                          <textarea
                            rows={Math.max(2, Math.ceil(editingText.length / 50))}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSaveEdit(idx);
                              }
                            }}
                            className="w-full text-sm font-sans p-2 border border-app-accent rounded-lg bg-app-surface text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/35 font-medium leading-relaxed"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(idx)}
                            className={`${uiBtnPrimary} !min-h-10 !w-10 !px-0 shrink-0`}
                            title="Lưu lại"
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="text-app-text text-sm md:text-base leading-relaxed cursor-pointer hover:bg-app-accent/8 rounded border border-transparent p-1 -m-1 font-medium text-justify"
                          onDoubleClick={() => handleStartEdit(idx)}
                          title="Nhấp đúp để biên dịch hiệu đính nhanh"
                        >
                          {translatedLines[idx] || (
                            <span className="text-red-500 italic text-xs font-sans">(Chưa dịch hoặc nội dung trống)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Xen kẽ: Trung → Pinyin (nếu bật) → Việt */
                  <div className="pl-8 pr-3 sm:pr-6 flex flex-col gap-2 w-full min-w-0">
                    <div className="text-sm md:text-base text-app-text font-sans leading-relaxed tracking-wide select-all">
                      {srcLine.trim() ? (
                        srcLine
                      ) : (
                        <span className="text-zinc-400 italic text-xs">(Dòng Hán trống)</span>
                      )}
                    </div>

                    {srcLine.trim() && showPinyin && (
                      <div
                        className="text-[11px] font-mono tracking-wider text-emerald-700 dark:text-emerald-400/90 select-all leading-relaxed bg-emerald-50/40 dark:bg-emerald-950/25 px-2.5 py-1 rounded-lg border border-emerald-200/50 dark:border-emerald-900/25"
                        title="Phiên âm Pinyin"
                      >
                        {getPinyinOfLine(srcLine)}
                      </div>
                    )}

                    <div className="serif-reading-font pt-1 border-t border-app-border">
                      {isEditingRow ? (
                        <div className="flex items-start gap-2 animate-scale-up mt-1">
                          <textarea
                            rows={Math.max(1, Math.ceil(editingText.length / 70))}
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full text-sm font-sans p-2 border border-app-accent rounded-lg bg-app-surface text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent/35 font-medium leading-relaxed"
                            autoFocus
                          />
                          <button
                            onClick={() => handleSaveEdit(idx)}
                            className={`${uiBtnPrimary} !min-h-10 !w-10 !px-0 shrink-0`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="text-app-text text-sm md:text-base leading-relaxed cursor-pointer hover:bg-app-accent/8 rounded p-1 -m-1 font-medium text-justify mt-1"
                          onDoubleClick={() => handleStartEdit(idx)}
                          title="Nhấp đúp để hiệu đính bản Việt"
                        >
                          {translatedLines[idx]?.trim() ? (
                            translatedLines[idx]
                          ) : (
                            <span className="text-red-500/90 italic text-xs font-sans">
                              (Chưa dịch hoặc nội dung trống)
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Hover line action float menu */}
                {!isEditingRow && (
                  <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 flex items-center gap-1.5 transition-opacity bg-app-surface p-0.5 rounded-lg border border-app-border shadow-sm">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(idx)}
                      className="p-1.5 text-app-text-muted hover:text-app-accent hover:bg-app-surface-muted rounded-md transition-colors cursor-pointer"
                      title="Chỉnh sửa dòng dịch"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => copyRow(idx)}
                      className="p-1.5 text-app-text-muted hover:text-app-accent hover:bg-app-surface-muted rounded-md transition-colors cursor-pointer"
                      title="Sao chép song ngữ"
                    >
                      {copiedIndex === idx ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
