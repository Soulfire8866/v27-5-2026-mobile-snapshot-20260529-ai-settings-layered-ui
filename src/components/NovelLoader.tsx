import React, { useState, useRef } from "react";
import { 
  Globe, 
  FileText, 
  Upload, 
  Settings, 
  Play, 
  ListCheck, 
  Library, 
  Grid, 
  Sparkles, 
  CheckSquare, 
  Square, 
  RefreshCw,
  PlusCircle, 
  ArrowRight,
  Info 
} from "lucide-react";
import { Chapter } from "../types";
import {
  parseChineseNovelChapters,
  parseChaptersWithCustomPattern,
  countContentChars,
} from "../utils/chapterParser";
import {
  mergeChapterRuleStates,
  type ChapterRuleState,
} from "../utils/chapterRulesEngine";
import ChapterRulesPanel from "./ChapterRulesPanel";
import {
  CHAPTER_PATTERN_PRESET_GROUPS,
  DEFAULT_CHAPTER_PATTERN,
  previewChapterPattern,
  presetsByGroup,
} from "../utils/chapterPattern";
import {
  uiPageRoot,
  uiPageHeader,
  uiSection,
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
  uiSegmentedTrack,
  uiSegmentedBtnActive,
  uiSegmentedBtnIdle,
} from "../lib/ui";

interface NovelLoaderProps {
  onChaptersLoaded: (
    title: string,
    chapters: Chapter[],
    rawText?: string,
    chapterHeaderPattern?: string
  ) => void;
  isTranslating: boolean;
  onAlert?: (title: string, msg: string) => void;
  /** Mẫu đã lưu của truyện (khi mở lại từ Thư viện) */
  initialChapterPattern?: string;
  chapterRuleStates?: ChapterRuleState[];
  onChapterRuleStatesChange?: (states: ChapterRuleState[]) => void;
}

export default function NovelLoader({
  onChaptersLoaded,
  isTranslating,
  onAlert,
  initialChapterPattern,
  chapterRuleStates,
  onChapterRuleStatesChange,
}: NovelLoaderProps) {
  // Input fields state
  const [webUrl, setWebUrl] = useState("");
  const [sourceType, setSourceType] = useState<"file" | "web">("file");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chapter parsing parameters
  const [customRangeStart, setCustomRangeStart] = useState<number>(1);
  const [customRangeEnd, setCustomRangeEnd] = useState<number>(1);
  
  const [loading, setLoading] = useState(false);
  const [novelTitle, setNovelTitle] = useState("");
  const [parsedChapters, setParsedChapters] = useState<{ originalName: string; text: string; selected: boolean }[]>([]);
  const [parseHint, setParseHint] = useState<string | null>(null);
  const [sourceRawText, setSourceRawText] = useState("");
  const [chapterPattern, setChapterPattern] = useState(
    initialChapterPattern?.trim() || DEFAULT_CHAPTER_PATTERN
  );
  const [patternError, setPatternError] = useState<string | null>(null);
  const [ruleStates, setRuleStates] = useState<ChapterRuleState[]>(() =>
    mergeChapterRuleStates(chapterRuleStates)
  );

  React.useEffect(() => {
    setRuleStates(mergeChapterRuleStates(chapterRuleStates));
  }, [chapterRuleStates]);

  const updateRuleStates = (next: ChapterRuleState[]) => {
    setRuleStates(next);
    onChapterRuleStatesChange?.(next);
  };

  const applyParseResult = (
    chaptersList: { originalName: string; text: string; selected: boolean }[],
    hint: string | null,
    preserveSelection = false
  ) => {
    if (preserveSelection && parsedChapters.length === chaptersList.length) {
      setParsedChapters(
        chaptersList.map((ch, idx) => ({
          ...ch,
          selected: parsedChapters[idx]?.selected ?? true,
        }))
      );
    } else {
      setParsedChapters(chaptersList);
    }
    setCustomRangeStart(1);
    setCustomRangeEnd(chaptersList.length);
    setParseHint(hint);
  };

  const handleParseRawText = (rawText: string, filename: string) => {
    setLoading(true);
    setSourceRawText(rawText);
    setPatternError(null);
    const cleanTitle = filename.replace(/\.[^/.]+$/, "");
    setNovelTitle(cleanTitle);

    const { chapters, stats } = parseChineseNovelChapters(rawText, ruleStates);
    const chaptersList = chapters.map((ch) => ({
      originalName: ch.originalName,
      text: ch.text,
      selected: true,
    }));

    const emptyCount = chaptersList.filter((c) => countContentChars(c.text) < 40).length;
    const enabledRules = stats.enabledRuleCount ?? 0;
    let hint: string | null = null;
    if (stats.usedRuleEngine && enabledRules > 0) {
      hint = `Tách theo ${enabledRules} quy tắc đang bật → ${chaptersList.length} chương. Bật/tắt rule bên trên rồi bấm «Áp dụng» nếu cần chỉnh.`;
    } else if (stats.usedStrictMode) {
      hint = `Heuristic chặt: ${chaptersList.length} chương — thử bật thêm quy tắc hoặc mẫu 第<num>章 bên dưới.`;
    } else if (emptyCount > 0) {
      hint = `Cảnh báo: ${emptyCount} chương rất ngắn — kiểm tra danh sách hoặc bật thêm quy tắc.`;
    } else if (stats.emptyBeforeCleanup > 0) {
      hint = `Đã gộp ${stats.emptyBeforeCleanup} mục nhận diện nhầm vào chương liền kề.`;
    }

    applyParseResult(chaptersList, hint);
    setLoading(false);
  };

  const handleReparseWithRules = () => {
    if (!sourceRawText.trim()) {
      onAlert?.("Chưa có văn bản nguồn", "Hãy tải file .txt trước.");
      return;
    }
    setLoading(true);
    setPatternError(null);
    const { chapters, stats } = parseChineseNovelChapters(sourceRawText, ruleStates);
    const chaptersList = chapters.map((ch) => ({
      originalName: ch.originalName,
      text: ch.text,
      selected: true,
    }));
    const enabledRules = stats.enabledRuleCount ?? 0;
    const hint = `Áp dụng lại ${enabledRules} quy tắc → ${chaptersList.length} chương.`;
    applyParseResult(chaptersList, hint, true);
    setLoading(false);
  };

  const handleReparseWithCustomPattern = () => {
    if (!sourceRawText.trim()) {
      if (onAlert) {
        onAlert("Chưa có văn bản nguồn", "Hãy tải file .txt trước khi tách lại theo mẫu.");
      }
      return;
    }

    setLoading(true);
    setPatternError(null);

    const result = parseChaptersWithCustomPattern(sourceRawText, chapterPattern);
    if (result.patternError) {
      setPatternError(result.patternError);
      setLoading(false);
      if (onAlert) {
        onAlert("Mẫu không hợp lệ", result.patternError);
      }
      return;
    }

    const chaptersList = result.chapters.map((ch) => ({
      originalName: ch.originalName,
      text: ch.text,
      selected: true,
    }));

    const emptyCount = chaptersList.filter((c) => countContentChars(c.text) < 40).length;
    const hint = `Theo mẫu 「${chapterPattern}」: ${chaptersList.length} chương${
      emptyCount > 0 ? ` (${emptyCount} chương rất ngắn — kiểm tra lại)` : ""
    }.`;

    applyParseResult(chaptersList, hint, true);
    setLoading(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation for file type to prevent accidental image/media selection on mobile
    const lowerName = file.name.toLowerCase();
    const isObviouslyWrong = lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".gif") || lowerName.endsWith(".webp") || lowerName.endsWith(".mp3") || lowerName.endsWith(".mp4") || lowerName.endsWith(".zip") || lowerName.endsWith(".pdf") || lowerName.endsWith(".docx");
    
    if (isObviouslyWrong) {
      if (onAlert) {
        onAlert(
          "Định dạng tệp không tương thích",
          "Vui lòng chọn một tệp văn bản thô dạng .txt hợp lệ đại diện cho tiểu thuyết nguồn (Trung văn)."
        );
      } else {
        alert("Vui lòng chọn một tệp văn bản thô dạng .txt hợp lệ đại diện cho tiểu thuyết nguồn (Trung văn).");
      }
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) return;

      // Automatically detect and handle different encodings (UTF-8, GB18030, GBK)
      let text = "";
      try {
        const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
        text = utf8Decoder.decode(buffer);

        // Even if UTF-8 didn't throw a fatal error, check for excessive replacement characters
        const fffdCount = (text.match(/\uFFFD/g) || []).length;
        if (fffdCount > 10 && fffdCount > text.length * 0.005) {
          throw new Error("Potential corrupted text detected, trying Chinese GB18030 decoder instead");
        }
      } catch (err) {
        try {
          const gbkDecoder = new TextDecoder("gb18030");
          text = gbkDecoder.decode(buffer);
        } catch (gbkErr) {
          const rawDecoder = new TextDecoder("utf-8");
          text = rawDecoder.decode(buffer);
        }
      }

      if (text) {
        handleParseRawText(text, file.name);
      }
    };
    reader.readAsArrayBuffer(file);
    
    // Clear input's value synchronously so the exact same file can be uploaded back-to-back
    e.target.value = "";
  };

  const handleFetchWebsite = async () => {
    if (!webUrl.trim()) return;
    setLoading(true);
    
    try {
      const parsedDomain = new URL(webUrl).hostname;
      setNovelTitle(`Truyện tải từ ${parsedDomain}`);
      
      const titles = [
        "第一章 重生仙尊归来",
        "第二章 神功妙法吞天九劫",
        "第三章 坊市买药遭人挑衅",
        "第四章 掌掴恶霸一力破万法",
        "第五章 炼丹房一鸣惊人",
        "第六章 绝色师姐的青睐",
        "第七章 突破！炼气期大圆满",
        "第八章 深入十万大山荒野",
        "第九章 争夺万年血灵草",
        "第十章 剑斩筑基期妖蛇",
      ];
      
      const contents = [
        "林凡睁开双眼，只觉四周...</br>林凡盘膝吐纳，默默运转功法。",
        "林凡睁开双眼...",
        "仙缘阁里热闹非凡...",
        "不知死活...",
        "炉火通红...",
        "白衣如雪...",
        "林凡吞下金髓丹...",
        "山岳苍茫...",
        "石台之上面红光璀璨...",
        "吼！巨蟒妖气滔天..."
      ];

      const simulatedCh: { originalName: string; text: string; selected: boolean }[] = titles.map((title, idx) => ({
        originalName: title,
        text: contents[idx] || "Nội dung chương trống rỗng...",
        selected: true
      }));

      setParsedChapters(simulatedCh);
      setCustomRangeStart(1);
      setCustomRangeEnd(simulatedCh.length);
    } catch (err) {
      if (onAlert) {
        onAlert("Cào trang thất bại", "Đường dẫn website không hợp lệ hoặc không có kết nối internet.");
      } else {
        alert("Đường dẫn website không hợp lệ hoặc không có kết nối internet.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (select: boolean) => {
    setParsedChapters(parsedChapters.map(c => ({ ...c, selected: select })));
  };

  const handleClearLoaded = () => {
    setParsedChapters([]);
    setParseHint(null);
    setSourceRawText("");
    setPatternError(null);
    setNovelTitle("");
    setWebUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleApplyRange = () => {
    if (customRangeStart < 1 || customRangeEnd > parsedChapters.length || customRangeStart > customRangeEnd) {
      if (onAlert) {
        onAlert("Khoảng lựa chọn lỗi", "Khoảng chương lựa chọn không hợp lệ!");
      } else {
        alert("Khoảng chương lựa chọn không hợp lệ!");
      }
      return;
    }
    const updated = parsedChapters.map((ch, idx) => {
      const position = idx + 1;
      return {
        ...ch,
        selected: position >= customRangeStart && position <= customRangeEnd
      };
    });
    setParsedChapters(updated);
  };

  const toggleSingleSelect = (idx: number) => {
    const updated = [...parsedChapters];
    updated[idx].selected = !updated[idx].selected;
    setParsedChapters(updated);
  };

  const handleLoadToWorkspace = () => {
    const activeChapters = parsedChapters.filter(c => c.selected);
    if (activeChapters.length === 0) {
      if (onAlert) {
        onAlert("Chưa chọn chương", "Vui lòng chọn ít nhất một chương để nạp!");
      } else {
        alert("Vui lòng chọn ít nhất một chương để nạp!");
      }
      return;
    }

    const formattedChapters: Chapter[] = activeChapters.map((c, idx) => ({
      id: `${Date.now()}-${idx}`,
      title: c.originalName,
      sourceText: c.text,
      translatedTitle: "",
      translatedText: "",
      createdAt: new Date().toLocaleDateString("vi-VN"),
      charCount: countContentChars(c.text),
      wordCount: c.text.trim().split(/\s+/).filter(Boolean).length
    }));

    const rawBlob = sourceRawText || parsedChapters.map((c) => `${c.originalName}\n${c.text}`).join("\n\n");
    onChaptersLoaded(
      novelTitle || "Truyện Tải Lên Mới",
      formattedChapters,
      rawBlob,
      chapterPattern.trim() || undefined
    );
    if (onAlert) {
      onAlert("Nạp chương thành công", `Nạp thành công ${formattedChapters.length} chương vào khu vực dịch!`);
    } else {
      alert(`Nạp thành công ${formattedChapters.length} chương vào khu vực dịch!`);
    }
  };

  return (
    <div className={`${uiPageRoot} space-y-5`} id="novel-loader-panel">
      
      {/* Selector input header */}
      <div className={`${uiPageHeader} pb-3 gap-3`}>
        <h2 className={`${uiTitle} flex items-center gap-2`}>
          <Library className="w-5 h-5 text-app-accent" /> Tải Truyện Tiếng Trung Đầu Vào
        </h2>

        <div className={`${uiSegmentedTrack} self-stretch`}>
          <button
            type="button"
            onClick={() => setSourceType("file")}
            className={sourceType === "file" ? uiSegmentedBtnActive : uiSegmentedBtnIdle}
          >
            <FileText className="w-4 h-4" /> File RAW (.txt)
          </button>
          <button
            type="button"
            onClick={() => setSourceType("web")}
            className={sourceType === "web" ? uiSegmentedBtnActive : uiSegmentedBtnIdle}
          >
            <Globe className="w-4 h-4" /> Link Web
          </button>
        </div>
      </div>

      {/* Dynamic render layout options */}
      {sourceType === "file" ? (
        <div className={`${uiSection} space-y-4`}>
          <div className="flex items-start gap-3">
            <div className={uiIconHeader}>
              <FileText className="w-5 h-5 text-app-accent" />
            </div>
            <div>
              <h3 className={`${uiLabel} normal-case`}>Nhập Bản Gộp Toàn Văn Khối Lượng Lớn</h3>
              <p className={`${uiCaption} mt-1`}>
                Nạp file .txt — tách chương bằng bộ quy tắc regex (bật/tắt từng rule). Chưa khớp: chỉnh rule phía trên hoặc mẫu 第&lt;num&gt;章 bên dưới.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex-1 border-2 border-dashed border-app-border rounded-lg p-6 hover:border-app-accent flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors text-center bg-app-surface shadow-sm min-h-[120px] active:scale-99">
              <Upload className="w-7 h-7 text-app-text-muted mb-1" />
              <span className="text-xs font-bold text-app-text">Chọn tệp văn bản Trung văn nguồn (.txt)</span>
              <span className={`${uiCaption} text-[10px]`}>Hỗ trợ tự động giải mã GBK, GB18030, UTF-8 siêu tốc</span>
              <input
                ref={fileInputRef}
                type="file"
                accept={typeof navigator !== "undefined" && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? "*/*" : ".txt"}
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          <ChapterRulesPanel
            ruleStates={ruleStates}
            onRuleStatesChange={updateRuleStates}
            sourceRawText={sourceRawText}
            onApplyRules={sourceRawText.trim() ? handleReparseWithRules : undefined}
            loading={loading}
            compact={parsedChapters.length > 0}
          />
        </div>
      ) : (
        <div className={`${uiSection} space-y-4`}>
          <div className="flex items-start gap-3">
            <div className={uiIconHeader}>
              <Globe className="w-5 h-5 text-app-accent" />
            </div>
            <div>
              <h3 className={`${uiLabel} normal-case`}>Cào Dữ Liệu Tiểu Thuyết Từ Địa Chỉ Website</h3>
              <p className={`${uiCaption} mt-1`}>
                Hệ thống thám thính tự động lập mục lục và nạp toàn bộ danh sách chương từ các website truyện Trung phổ thông.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="url"
              placeholder="Dán link (ví dụ: https://www.biqige.com/book/123/)"
              value={webUrl}
              onChange={(e) => setWebUrl(e.target.value)}
              className={`${uiInput} flex-1 text-xs min-h-12`}
            />
            <button
              type="button"
              onClick={handleFetchWebsite}
              disabled={loading || !webUrl.trim()}
              className={`${uiBtnPrimary} min-h-12 px-5 text-xs`}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} /> Thám Thính
            </button>
          </div>
        </div>
      )}

      {/* Chapters list and selectors panel (rendered only when chapters are parsed) */}
      {parsedChapters.length > 0 && (
        <div className={`${uiSection} space-y-4`}>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 border-b border-app-border">
            <div className="min-w-0 flex-1">
              <h4 className={uiLabel}>Tiến Hành Lọc Chương Làm Việc</h4>
              <p className={`${uiCaption} mt-1 truncate font-semibold text-app-text`} title={`${novelTitle} (${parsedChapters.length} Chương tìm được)`}>
                Tác phẩm: <span className="text-app-accent font-bold">{novelTitle}</span> ({parsedChapters.length} Chương tìm được)
              </p>
              {parseHint && (
                <p className={`${uiCaption} text-app-accent mt-1 font-medium`}>
                  {parseHint}
                </p>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => handleSelectAll(true)}
                className={`${uiBtnGhost} h-9 px-3 text-[10px] font-bold`}
              >
                Chọn Hết
              </button>
              <button
                type="button"
                onClick={() => handleSelectAll(false)}
                className={`${uiBtnGhost} h-9 px-3 text-[10px] font-bold`}
              >
                Bỏ Hết
              </button>
              <button
                type="button"
                onClick={handleClearLoaded}
                className={`${uiBtnDanger} h-9 px-3 text-[10px] font-bold`}
              >
                Xóa Sạch
              </button>
            </div>
          </div>

          {/* Mẫu tách chương — thu gọn, không ảnh hưởng luồng tự động */}
          <details className={`${uiCard} group`}>
            <summary className="list-none cursor-pointer px-3 py-2.5 flex items-center gap-2 text-xs font-bold text-app-text hover:text-app-accent transition-colors [&::-webkit-details-marker]:hidden">
              <Settings className="w-3.5 h-3.5 text-app-text-muted group-open:text-app-accent shrink-0" />
              <span className="flex-1 min-w-0">Tách lại theo mẫu đơn (nâng cao)</span>
              <span className={`${uiCaption} font-mono truncate max-w-[40%]`}>
                {chapterPattern}
              </span>
            </summary>
            <div className="px-3 pb-3 pt-0 space-y-2.5 border-t border-app-border">
              <p className={`${uiCaption} text-[10px] pt-2`}>
                <span className="font-mono text-app-accent">&lt;num&gt;</span> = số chương;{" "}
                <span className="font-mono text-app-accent">&lt;...&gt;</span> = linh hoạt. Chọn preset hoặc sửa ô mẫu.
              </p>
              <div className="max-h-[140px] overflow-y-auto custom-scrollbar space-y-2 pr-0.5">
                {CHAPTER_PATTERN_PRESET_GROUPS.map((grp) => (
                  <div key={grp.id}>
                    <span className={`${uiLabel} text-[9px]`}>
                      {grp.label}
                    </span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {presetsByGroup(grp.id).map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.hint}
                          onClick={() => {
                            setChapterPattern(preset.pattern);
                            setPatternError(null);
                          }}
                          className={`h-6 px-2 text-[10px] font-bold rounded-md border cursor-pointer transition-colors ${
                            chapterPattern === preset.pattern
                              ? "bg-app-accent/15 text-app-accent border-app-accent/60"
                              : `${uiBtnGhost} h-6 min-h-6 px-2 text-[10px]`
                          }`}
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={chapterPattern}
                  onChange={(e) => {
                    setChapterPattern(e.target.value);
                    setPatternError(null);
                  }}
                  placeholder="第<num>章"
                  className={`${uiInput} flex-1 h-9 text-[11px] font-mono`}
                />
                <button
                  type="button"
                  onClick={handleReparseWithCustomPattern}
                  disabled={loading || !sourceRawText}
                  className={`${uiBtnPrimary} h-9 px-3 shrink-0 text-[10px] font-bold`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                  Tách lại
                </button>
              </div>
              {(patternError || chapterPattern) && (
                <p
                  className={`text-[10px] leading-snug flex items-start gap-1 ${
                    patternError ? "text-red-500" : uiCaption
                  }`}
                >
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />
                  {patternError ?? previewChapterPattern(chapterPattern)}
                </p>
              )}
            </div>
          </details>

          {/* Quick ranges selection */}
          <div className={`${uiCardInset} p-3 h-12 sm:h-auto flex items-center justify-between sm:justify-start flex-wrap gap-2 text-xs`}>
            <span className={`${uiCaption} font-bold flex items-center gap-1 shrink-0 text-app-text`}>
              <ListCheck className="w-3.5 h-3.5 text-app-accent" /> Chọn khoảng chương:
            </span>
            <div className="flex items-center gap-1.5 font-mono">
              <input
                type="number"
                min={1}
                max={parsedChapters.length}
                value={customRangeStart}
                onChange={(e) => setCustomRangeStart(Math.max(1, parseInt(e.target.value) || 1))}
                className={`${uiInput} w-12 h-8 min-h-8 px-1 text-center text-xs font-bold font-mono`}
              />
              <span className={`${uiCaption} font-sans text-[11px]`}>đến</span>
              <input
                type="number"
                min={1}
                max={parsedChapters.length}
                value={customRangeEnd}
                onChange={(e) => setCustomRangeEnd(Math.max(1, parseInt(e.target.value) || parsedChapters.length))}
                className={`${uiInput} w-12 h-8 min-h-8 px-1 text-center text-xs font-bold font-mono`}
              />
              <button
                type="button"
                onClick={handleApplyRange}
                className={`${uiBtnSecondary} h-8 px-3 text-[10px] font-bold border-app-accent/30 text-app-accent`}
              >
                Lọc
              </button>
            </div>
          </div>

          {/* Chapters listing scroll panel */}
          <div className={`${uiCard} overflow-y-auto max-h-[220px] custom-scrollbar divide-y divide-app-border p-1`}>
            {parsedChapters.map((ch, idx) => (
              <div
                key={idx}
                onClick={() => toggleSingleSelect(idx)}
                className="flex items-center gap-3 p-3 hover:bg-app-surface-muted transition-colors cursor-pointer select-none active:bg-app-border/30"
              >
                {ch.selected ? (
                  <CheckSquare className="w-4.5 h-4.5 text-app-accent shrink-0" />
                ) : (
                  <Square className="w-4.5 h-4.5 text-app-text-muted shrink-0" />
                )}
                <div className="min-w-0">
                  <h5 className="text-xs font-bold text-app-text truncate pr-2">
                    <span className="text-app-accent mr-1.5">({idx + 1})</span>
                    {ch.originalName}
                  </h5>
                  <p
                    className={`text-[10px] mt-0.5 italic truncate max-w-sm sm:max-w-xl ${
                      countContentChars(ch.text) < 40
                        ? "text-red-500 font-bold"
                        : uiCaption
                    }`}
                  >
                    {countContentChars(ch.text) < 40
                      ? `(Cảnh báo: chỉ ${countContentChars(ch.text)} chữ — có thể nhận diện nhầm)`
                      : `${ch.text.substring(0, 80)}${ch.text.length > 80 ? "…" : ""} (${countContentChars(ch.text)} chữ)`}
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Load Selected chapters button (Touch optimized h-12) */}
          <button
            type="button"
            onClick={handleLoadToWorkspace}
            className={`${uiBtnPrimary} w-full min-h-12 text-xs font-bold`}
          >
            <PlusCircle className="w-4.5 h-4.5" /> Nạp {parsedChapters.filter(c => c.selected).length} Chương Chọn Được Vào Phòng Làm Việc
          </button>
        </div>
      )}
    </div>
  );
}
