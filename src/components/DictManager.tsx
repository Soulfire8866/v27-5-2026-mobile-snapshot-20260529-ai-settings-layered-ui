import React, { useState } from "react";
import { 
  Plus, 
  Trash2, 
  BookOpen, 
  Download, 
  AlertTriangle, 
  Search, 
  Sparkles, 
  FolderPlus, 
  Upload, 
  Edit2, 
  Check, 
  X,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import { DictItem, Novel, PronounMapping } from "../types";
import {
  buildNameScanRow,
  chaptersToScanSlices,
  entityKindBadgeClass,
  entityKindLabel,
  inferEntityKind,
  inferScanCategory,
  isScanNoiseChinesePhrase,
  prepareNameScanResources,
} from "../utils/nameScanPipeline";
import { COMMON_CHINESE_WORDS_BLACKLIST } from "../utils/dictScanConstants";
import {
  applyReplacementsToChapters,
  buildDictReplacementPreview,
  buildDictExportTxtContent,
  decodeTxtArrayBuffer,
  dictItemsToImportEntries,
  downloadDictTxtFile,
  parseDictTxtContent,
  type DictReplacePreviewRow,
} from "../utils/novelDictImport";
import {
  uiPageRoot,
  uiPageHeader,
  uiIconHeader,
  uiCaption,
  uiSection,
  uiFieldLabel,
  uiInput,
  uiBtnPrimary,
  uiBtnGhost,
  uiBtnSecondary,
  uiBtnDanger,
  uiCard,
  uiCardInset,
  uiLabel,
  uiPanel,
  uiTitle,
  uiSegmentedTrack,
  uiSegmentedBtnActive,
  uiSegmentedBtnIdle,
} from "../lib/ui";

export const DICT_PRESETS: { name: string; category: DictItem["category"]; description: string; items: Record<string, string> }[] = [
  {
    name: "Tiên Hiệp (Xianxia)",
    category: "sect",
    description: "Các thuật ngữ Tu Chân, Cảnh Giới, Tông Môn và Linh Bảo cổ trang.",
    items: {
      "飞剑": "phi kiếm",
      "筑基": "Trúc Cơ",
      "元婴": "Nguyên Anh",
      "金丹": "Kim Đan",
      "化神": "Hóa Thần",
      "大乘": "Đại Thừa",
      "渡劫": "Độ Kiếp",
      "宗门": "Tông môn",
      "洞府": "động phủ",
      "散修": "tán tu",
      "逆天": "nghịch thiên",
      "夺舍": "đoạt xá",
      "灵草": "linh thảo",
      "天劫": "thiên kiếp",
      "储物袋": "túi chứa đồ",
      "乾坤袋": "túi Càn khôn",
      "妖兽": "yêu thú"
    }
  },
  {
    name: "Huyền Huyễn (Xuanhuan)",
    category: "item",
    description: "Các danh từ thế giới dị năng, huyết mạch, võ hồn kì bí.",
    items: {
      "功法": "công pháp",
      "武魂": "võ hồn",
      "魂环": "hồn hoàn",
      "血脉": "huyết mạch",
      "神邸": "thần để",
      "禁地": "cấm địa",
      "魔兽": "ma thú",
      "至尊": "chí tôn",
      "神体": "thần thể",
      "圣女": "Thánh nữ",
      "圣子": "Thánh tử",
      "传承": "truyền thừa",
      "法则": "pháp tắc"
    }
  },
  {
    name: "Ngôn Tình & Đô Thị",
    category: "custom",
    description: "Môi trường hào môn thế gia, tổng tài kiêu ngạo, cuộc sống hiện đại.",
    items: {
      "总裁": "tổng tài",
      "闺蜜": "khuê mật",
      "金手指": "kim thủ chỉ",
      "金主": "kim chủ",
      "金牌": "kim bài",
      "白富美": "bạch phú mỹ",
      "高富帅": "cao phú soái",
      "绿茶": "trà xanh",
      "影帝": "ảnh đế",
      "影后": "ảnh hậu",
      "重生": "trọng sinh",
      "逆袭": "nghịch tập"
    }
  },
  {
    name: "Lịch Sử - Quân Sự",
    category: "military",
    description: "Bộ thuật ngữ hành quân, quan chức, quân đội cổ đại.",
    items: {
      "大将军": "lục quân đại tướng quân",
      "宰相": "Tể tướng",
      "兵马俑": "Binh mã dũng",
      "烽火台": "Phong hỏa đài",
      "锦衣卫": "Cẩm y vệ",
      "百户": "Bách hộ",
      "校尉": "Hiệu úy",
      "军饷": "quân hưởng",
      "粮草": "lương thảo",
      "攻城": "công thành",
      "退兵": "lui binh"
    }
  }
];

interface DictItemForm {
  chinese: string;
  vietnamese: string;
  category: DictItem["category"];
  novelId?: string;
}

interface DictManagerProps {
  dictItems: DictItem[];
  onAddWord: (zh: string, vi: string, cat: DictItem["category"], novelId?: string) => void;
  onUpdateWord: (id: string, zh: string, vi: string, cat: DictItem["category"], novelId?: string) => void;
  onDeleteWord: (id: string) => void;
  onClearDict: () => void;
  onLoadPreset: (items: Record<string, string>, cat?: DictItem["category"]) => void;
  onImportDictTxt: (
    items: Record<string, string>,
    scope: "chung" | "rieng"
  ) => Promise<{ added: { chinese: string; vietnamese: string }[]; skipped: number }>;
  onApplyNovelDictReplacements: (
    novelId: string,
    updates: { chapterId: string; translatedText: string }[]
  ) => Promise<void>;
  activeNovelId?: string;
  novels?: Novel[];
  pronounMappings?: PronounMapping[];
}

export { COMMON_CHINESE_WORDS_BLACKLIST } from "../utils/dictScanConstants";

export default function DictManager({
  dictItems,
  onAddWord,
  onUpdateWord,
  onDeleteWord,
  onClearDict,
  onLoadPreset,
  onImportDictTxt,
  onApplyNovelDictReplacements,
  activeNovelId,
  novels = [],
  pronounMappings = []
}: DictManagerProps) {
  const [chinese, setChinese] = useState("");
  const [vietnamese, setVietnamese] = useState("");

  // States for reference dictionary loading & filtering
  const [refDict, setRefDict] = useState<Record<string, string>>({});
  const [refDictFileName, setRefDictFileName] = useState<string>("");
  /** PA-3: dùng file để điền «Tên trong bản dịch» (tách khỏi loại trừ quét). */
  const [useRefDictForLookup, setUseRefDictForLookup] = useState<boolean>(false);
  /** Ẩn cụm đã có trong file khỏi danh sách quét (blacklist — mặc định tắt). */
  const [excludeRefWords, setExcludeRefWords] = useState<boolean>(false);
  const [excludeCommonWords, setExcludeCommonWords] = useState<boolean>(true);

  const handleRefDictUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate the file extension to protect against accidental image/media selection on mobile
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".txt")) {
      alert("Vui lòng chọn tệp .txt (mỗi dòng HánTự=NghĩaDịch). File .docx chưa được hỗ trợ.");
      e.target.value = "";
      return;
    }

    setRefDictFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) return;

      let content = "";
      try {
        const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
        content = utf8Decoder.decode(buffer);
      } catch (err) {
        try {
          const gbkDecoder = new TextDecoder("gb18030");
          content = gbkDecoder.decode(buffer);
        } catch (gbkErr) {
          const rawDecoder = new TextDecoder("utf-8");
          content = rawDecoder.decode(buffer);
        }
      }

      if (!content) return;

      const lines = content.split("\n");
      const loadedRef: Record<string, string> = {};

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;

        let splitChar = "";
        if (trimmed.includes("=")) splitChar = "=";
        else if (trimmed.includes("->")) splitChar = "->";
        else if (trimmed.includes("=>")) splitChar = "=>";
        else if (trimmed.includes("\t")) splitChar = "\t";

        if (splitChar) {
          const parts = trimmed.split(splitChar);
          const zh = parts[0]?.trim();
          const vi = parts[1]?.trim();
          if (zh && vi) {
            loadedRef[zh] = vi;
          }
        } else {
          const firstSpace = trimmed.indexOf(" ");
          if (firstSpace !== -1) {
            const zh = trimmed.substring(0, firstSpace).trim();
            const vi = trimmed.substring(firstSpace).trim();
            if (zh && vi) {
              loadedRef[zh] = vi;
            }
          }
        }
      });

      const count = Object.keys(loadedRef).length;
      setRefDict(loadedRef);
      setUseRefDictForLookup(count > 0);
      setExcludeRefWords(false);
      alert(
        `Đã nạp ${count} cụm từ từ "${file.name}".\n` +
          "• Tra «Tên trong bản dịch» (PA-3): đã bật.\n" +
          "• Ẩn cụm khỏi danh sách quét: tắt — bật thủ công nếu chỉ muốn file làm blacklist."
      );
    };
    reader.readAsArrayBuffer(file);
  };
  const [category, setCategory] = useState<DictItem["category"]>("name");
  const [searchTerm, setSearchTerm] = useState("");
  const [dictScope, setDictScope] = useState<"riêng" | "chung">(activeNovelId ? "riêng" : "chung");
  const [filterSubset, setFilterSubset] = useState<"all" | "chung" | "riêng">("all");

  const [isImportPreviewOpen, setIsImportPreviewOpen] = useState(false);
  const [importPreviewRows, setImportPreviewRows] = useState<DictReplacePreviewRow[]>([]);
  const [isImportApplying, setIsImportApplying] = useState(false);
  const commonDictFileInputRef = React.useRef<HTMLInputElement>(null);
  const novelDictFileInputRef = React.useRef<HTMLInputElement>(null);

  // Editing state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editChinese, setEditChinese] = useState("");
  const [editVietnamese, setEditVietnamese] = useState("");
  const [editCategory, setEditCategory] = useState<DictItem["category"]>("name");
  const [editNovelId, setEditNovelId] = useState<string | undefined>(undefined);

  const activeNovel = novels.find(n => n.id === activeNovelId);

  // States for automated Chinese proper-name scanning (Bước 1 -> Bước 5)
  const [scanStartChapter, setScanStartChapter] = useState("1");
  const [scanEndChapter, setScanEndChapter] = useState("");
  const [scanMinLength, setScanMinLength] = useState("2");
  const [scanMaxLength, setScanMaxLength] = useState("5");
  const [scanMinOccurrence, setScanMinOccurrence] = useState("20");

  interface ExtractedWord {
    chinese: string;
    hanViet: string;
    vietnamese: string;
    translationSource: "vietphrase" | "lab" | "hv" | "none";
    entityKind?: "character" | "place" | "sect" | "title" | "skill" | "other";
    count: number;
    category: DictItem["category"];
    selected: boolean;
  }

  const [scanResults, setScanResults] = useState<ExtractedWord[]>([]);
  const [isScanPopupOpen, setIsScanPopupOpen] = useState(false);
  const [isScanRunning, setIsScanRunning] = useState(false);

  React.useEffect(() => {
    if (activeNovel && activeNovel.chapters.length > 0) {
      setScanEndChapter(activeNovel.chapters.length.toString());
    } else {
      setScanEndChapter("");
    }
  }, [activeNovelId, novels]);

  const handleRunScan = async () => {
    if (!activeNovel || activeNovel.chapters.length === 0) {
      alert("Không tìm thấy tác phẩm hoặc dữ liệu chương mục gốc để quét.");
      return;
    }

    setIsScanRunning(true);
    try {
    const startIdx = parseInt(scanStartChapter);
    const endIdx = parseInt(scanEndChapter);
    const minLen = parseInt(scanMinLength);
    const maxLen = parseInt(scanMaxLength);
    const minOcc = parseInt(scanMinOccurrence);

    if (isNaN(startIdx) || startIdx < 1 || startIdx > activeNovel.chapters.length) {
      alert(`Số thứ tự chương bắt đầu phải từ 1 đến ${activeNovel.chapters.length}.`);
      return;
    }

    if (isNaN(endIdx) || endIdx < startIdx || endIdx > activeNovel.chapters.length) {
      alert(`Số thứ tự chương kết thúc phải từ ${startIdx} đến ${activeNovel.chapters.length}.`);
      return;
    }

    if (isNaN(minLen) || minLen < 1) {
      alert("Độ dài tối thiểu cụm từ phải lớn hơn hoặc bằng 1.");
      return;
    }

    if (isNaN(maxLen) || maxLen < minLen) {
      alert("Độ dài tối đa cụm từ phải lớn hơn hoặc bằng độ dài tối thiểu.");
      return;
    }

    if (isNaN(minOcc) || minOcc < 1) {
      alert("Số lần lặp lại tối thiểu của cụm từ phải lớn hơn hoặc bằng 1.");
      return;
    }

    await prepareNameScanResources().catch(() => undefined);

    const chaptersToScan = activeNovel.chapters.slice(startIdx - 1, endIdx);
    const scanSlices = chaptersToScanSlices(chaptersToScan);
    const fullText = chaptersToScan.map(ch => ch.sourceText).join("\n");

    const segments = fullText.match(/[\u4e00-\u9fa5]+/g) || [];
    const counts: Record<string, number> = {};

    const blacklistChars = new Set([
      "的", "了", "呢", "吧", "呀", "吗", "么", "我", "ni", "他", "她", "tử", "们",
      "这", "那", "是", "在", "不", "有", "个", "和", "与", "之", "而", "以", "于",
      "并", "得", "着", "过", "里", "外", "上", "下", "去", "来", "都", "tại", "也", "就",
      "说", "道", "听", "见", "只", "要", "会", "能", "可", "好", "没", "多", "少",
      "大", "小", "头", "作", "自", "向", "从", "他", "她", "们", "其", "它"
    ]);

    for (const seg of segments) {
      const len = seg.length;
      for (let i = 0; i < len; i++) {
        for (let l = minLen; l <= maxLen; l++) {
          if (i + l > len) break;
          const sub = seg.substring(i, i + l);
          
          // Cross-reference with our pre-loaded common words blacklist
          if (excludeCommonWords && COMMON_CHINESE_WORDS_BLACKLIST.has(sub)) {
            continue;
          }

          // Cross-reference with the user's uploaded reference dictionary
          if (excludeRefWords && refDict[sub]) {
            continue;
          }

          const firstChar = sub[0];
          const lastChar = sub[sub.length - 1];
          if (blacklistChars.has(firstChar) || blacklistChars.has(lastChar)) {
            continue;
          }

          let hasBlacklist = false;
          for (let charIdx = 0; charIdx < sub.length; charIdx++) {
            if (blacklistChars.has(sub[charIdx])) {
              hasBlacklist = true;
              break;
            }
          }
          if (hasBlacklist) continue;

          if (isScanNoiseChinesePhrase(sub)) continue;

          counts[sub] = (counts[sub] || 0) + 1;
        }
      }
    }

    const candidates = Object.entries(counts)
      .filter(([_, count]) => count >= minOcc)
      .map(([word, count]) => ({ word, count }));

    const sorted = candidates.sort((a, b) => b.word.length - a.word.length);
    const uniqueCandidates: { word: string; count: number }[] = [];

    for (const cand of sorted) {
      const duplicate = uniqueCandidates.find(
        existing => existing.word.includes(cand.word) && Math.abs(existing.count - cand.count) <= Math.max(2, existing.count * 0.15)
      );
      if (!duplicate) {
        uniqueCandidates.push(cand);
      }
    }

    const finalSorted = uniqueCandidates.sort((a, b) => b.count - a.count);

    const mapped: ExtractedWord[] = finalSorted
      // Scope-aware: cho phép đề xuất thêm vào «Riêng» của truyện hiện tại
      // ngay cả khi «Chung» đã có cùng Hán tự.
      .filter((cand) => {
        const candZh = cand.word;
        if (!activeNovelId) {
          return !dictItems.some((item) => item.chinese === candZh);
        }
        return !dictItems.some(
          (item) => item.chinese === candZh && item.novelId === activeNovelId
        );
      })
      .map((cand) =>
        buildNameScanRow(
          cand.word,
          cand.count,
          scanSlices,
          dictItems,
          pronounMappings,
          useRefDictForLookup ? refDict : undefined
        )
      );

    setScanResults(mapped);
    setIsScanPopupOpen(true);
    } finally {
      setIsScanRunning(false);
    }
  };

  const handleConfirmImport = () => {
    const toImport = scanResults.filter(r => r.selected && r.chinese.trim() && r.vietnamese.trim());
    if (toImport.length === 0) {
      alert("Không có từ mới nào được chọn để thêm vào từ điển.");
      return;
    }

    toImport.forEach(item => {
      onAddWord(item.chinese.trim(), item.vietnamese.trim(), item.category, activeNovelId);
    });

    setIsScanPopupOpen(false);
    alert(`Đã thêm thành công ${toImport.length} thuật ngữ riêng biệt áp dụng cho tác phẩm này!`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chinese.trim() || !vietnamese.trim()) return;
    const scopeNovelId = dictScope === "riêng" ? activeNovelId : undefined;
    onAddWord(chinese.trim(), vietnamese.trim(), category, scopeNovelId);
    setChinese("");
    setVietnamese("");
  };

  const handleStartEdit = (item: DictItem) => {
    setEditingId(item.id);
    setEditChinese(item.chinese);
    setEditVietnamese(item.vietnamese);
    setEditCategory(item.category);
    setEditNovelId(item.novelId);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
  };

  const handleSaveEdit = (id: string) => {
    if (!editChinese.trim() || !editVietnamese.trim()) return;
    onUpdateWord(id, editChinese.trim(), editVietnamese.trim(), editCategory, editNovelId);
    setEditingId(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, uploadCat: DictItem["category"]) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate the file extension to protect against accidental image/media selection on mobile
    const lowerName = file.name.toLowerCase();
    const isObviouslyWrong = lowerName.endsWith(".png") || lowerName.endsWith(".jpg") || lowerName.endsWith(".jpeg") || lowerName.endsWith(".gif") || lowerName.endsWith(".webp") || lowerName.endsWith(".mp3") || lowerName.endsWith(".mp4") || lowerName.endsWith(".zip") || lowerName.endsWith(".pdf") || lowerName.endsWith(".docx");
    
    if (isObviouslyWrong) {
      alert("Vui lòng chọn một tệp văn bản thô dạng .txt hợp lệ.");
      e.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) return;

      let content = "";
      try {
        const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
        content = utf8Decoder.decode(buffer);

        const fffdCount = (content.match(/\uFFFD/g) || []).length;
        if (fffdCount > 10 && fffdCount > content.length * 0.005) {
          throw new Error("Potential corrupted text detected, trying Chinese GB18030 decoder instead");
        }
      } catch (err) {
        try {
          const gbkDecoder = new TextDecoder("gb18030");
          content = gbkDecoder.decode(buffer);
        } catch (gbkErr) {
          const rawDecoder = new TextDecoder("utf-8");
          content = rawDecoder.decode(buffer);
        }
      }

      if (!content) return;

      const lines = content.split("\n");
      const loadedItems: Record<string, string> = {};

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) return;

        let splitChar = "";
        if (trimmed.includes("=")) splitChar = "=";
        else if (trimmed.includes("->")) splitChar = "->";
        else if (trimmed.includes("=>")) splitChar = "=>";
        else if (trimmed.includes("\t")) splitChar = "\t";

        if (splitChar) {
          const parts = trimmed.split(splitChar);
          const zh = parts[0]?.trim();
          const vi = parts[1]?.trim();
          if (zh && vi) {
            loadedItems[zh] = vi;
          }
        } else {
          const firstSpace = trimmed.indexOf(" ");
          if (firstSpace !== -1) {
            const zh = trimmed.substring(0, firstSpace).trim();
            const vi = trimmed.substring(firstSpace).trim();
            if (zh && vi) {
              loadedItems[zh] = vi;
            }
          }
        }
      });

      const count = Object.keys(loadedItems).length;
      if (count > 0) {
        onLoadPreset(loadedItems, uploadCat);
        alert(`Tải thành công ${count} từ vựng mới vào từ điển!`);
      } else {
        alert("Không tìm thấy cấu trúc từ vựng hợp lệ (Định dạng mẫu: HánTự=DịchNghĩa).");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const visibleItems = dictItems.filter((item) => {
    if (!item.novelId) return true;
    return activeNovelId ? item.novelId === activeNovelId : false;
  });

  const subsetItems = visibleItems.filter((item) => {
    if (filterSubset === "chung") return !item.novelId;
    if (filterSubset === "riêng") return !!item.novelId;
    return true;
  });

  const filteredItems = subsetItems.filter(
    (item) =>
      item.chinese.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.vietnamese.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatDictImportToast = (
    scope: "chung" | "rieng",
    added: number,
    skipped: number
  ): string => {
    const label = scope === "chung" ? "từ điển chung" : "từ điển riêng truyện này";
    let msg = `Đã thêm ${added} mục vào ${label}.`;
    if (skipped > 0) msg += ` Bỏ qua ${skipped} dòng (trùng hoặc không hợp lệ).`;
    return msg;
  };

  const handleDictTxtFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    scope: "chung" | "rieng"
  ) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (scope === "rieng" && !activeNovelId) {
      alert("Vui lòng chọn tác phẩm trong Thư viện trước khi nhập từ điển riêng.");
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".txt")) {
      alert("Vui lòng chọn tệp .txt (mỗi dòng: HánTự=TênViệt).");
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (!buffer) return;

      const content = decodeTxtArrayBuffer(buffer);
      if (!content.trim()) {
        alert("Tệp trống hoặc không đọc được.");
        return;
      }

      const loaded = parseDictTxtContent(content);
      if (Object.keys(loaded).length === 0) {
        alert("Không tìm thấy dòng hợp lệ (vd. 贾珩=Giả Hành).");
        return;
      }

      try {
        const { added, skipped } = await onImportDictTxt(loaded, scope);
        alert(formatDictImportToast(scope, added.length, skipped));
      } catch {
        alert("Không thể nhập từ điển. Vui lòng thử lại.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleNormalizeNovelTranslations = () => {
    if (!activeNovelId || !activeNovel) {
      alert("Vui lòng chọn tác phẩm trong Thư viện.");
      return;
    }

    const entries = dictItemsToImportEntries(dictItems, activeNovelId);
    if (entries.length === 0) {
      alert("Chưa có mục từ điển riêng cho truyện này. Hãy nhập file hoặc thêm thủ công trước.");
      return;
    }

    const chapters = activeNovel.chapters ?? [];
    const translatedCount = chapters.filter((ch) => ch.translatedText?.trim()).length;
    if (translatedCount === 0) {
      alert(
        "Chưa có chương nào được dịch trong Lab.\n\nChương chưa dịch sẽ dùng từ điển qua prompt khi dịch — từ riêng ưu tiên hơn từ chung."
      );
      return;
    }

    const preview = buildDictReplacementPreview(entries, chapters);
    if (preview.length === 0) {
      alert(
        "Không phát hiện biến thể tên khác trong các chương đã dịch (căn dòng Hán–Việt).\n\nNếu vừa sửa từ điển, hãy kiểm tra lại bản dịch Lab hoặc dịch chương mới."
      );
      return;
    }

    setImportPreviewRows(preview);
    setIsImportPreviewOpen(true);
  };

  const handleExportDictSubset = () => {
    let items: { chinese: string; vietnamese: string }[] = [];
    let fileName = "tu_dien.txt";

    if (filterSubset === "chung") {
      items = dictItems
        .filter((it) => !it.novelId)
        .map((it) => ({ chinese: it.chinese, vietnamese: it.vietnamese }));
      fileName = "tu_dien_chung.txt";
    } else if (filterSubset === "riêng") {
      if (!activeNovelId) {
        alert("Vui lòng chọn tác phẩm trong Thư viện để xuất từ điển riêng.");
        return;
      }
      const slug = (activeNovel?.title || "truyen")
        .replace(/[^\p{L}\p{N}]+/gu, "_")
        .replace(/_+/g, "_")
        .slice(0, 40);
      items = dictItems
        .filter((it) => it.novelId === activeNovelId)
        .map((it) => ({ chinese: it.chinese, vietnamese: it.vietnamese }));
      fileName = `tu_dien_rieng_${slug}.txt`;
    } else {
      return;
    }

    if (items.length === 0) {
      alert("Không có mục nào để xuất trong tab hiện tại.");
      return;
    }

    const content = buildDictExportTxtContent(items);
    downloadDictTxtFile(fileName, content);
  };

  const handleConfirmImportApply = async () => {
    if (!activeNovelId || !activeNovel) return;
    const selected = importPreviewRows.filter((r) => r.selected);
    if (selected.length === 0) {
      alert("Chưa chọn mục nào để áp dụng.");
      return;
    }

    const replacements = selected.map((r) => ({ from: r.from, to: r.to }));
    const updates = applyReplacementsToChapters(activeNovel.chapters, replacements);
    if (updates.length === 0) {
      alert("Không có thay đổi nào trên bản dịch.");
      setIsImportPreviewOpen(false);
      return;
    }

    if (
      !confirm(
        `Áp dụng ${selected.length} quy tắc thay tên vào ${updates.length} chương đã dịch?\nHành động này ghi đè bản dịch Lab — nên sao lưu VFS trước nếu cần.`
      )
    ) {
      return;
    }

    setIsImportApplying(true);
    try {
      await onApplyNovelDictReplacements(activeNovelId, updates);
      setIsImportPreviewOpen(false);
      setImportPreviewRows([]);
      alert(`Đã cập nhật bản dịch cho ${updates.length} chương.`);
    } finally {
      setIsImportApplying(false);
    }
  };

  return (
    <div className={`relative ${uiPageRoot}`} id="dict-manager-panel">
      
      {/* Title block */}
      <div className={`${uiPageHeader} mb-4`}>
        <div className="flex items-center gap-2.5">
          <div className={uiIconHeader}>
            <BookOpen className="w-5 h-5 text-app-accent" />
          </div>
          <div>
            <h2 className={`${uiTitle} font-bold`}>
              Từ Điển Thuật Ngữ (Vietphrase)
            </h2>
            <p className={`${uiCaption} mt-1`}>
              Ghi danh từ gốc Hán tự và các định nghĩa Việt hóa để AI bám nghĩa chuẩn phát âm và phong thái.
            </p>
          </div>
        </div>

        <p className={`${uiCaption} !text-[10px] mt-2 max-w-xl`}>
          Nhập / xuất file .txt theo tab <strong>Chung</strong> hoặc <strong>Riêng</strong> bên dưới. Chuẩn hóa bản dịch đã có chỉ trên tab Riêng.
        </p>
      </div>

      {/* Preset Packs cards */}
      <div className={`mb-5 ${uiSection}`}>
        <span className={`${uiLabel} flex items-center gap-1.5 mb-3 text-app-accent`}>
          <Sparkles className="w-4 h-4 animate-spin-slow text-app-accent" /> Thể loại từ điển chuyên ngành định sẵn:
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {DICT_PRESETS.map((preset, idx) => (
            <div
              key={idx}
              className={`${uiCard} p-3.5 rounded-xl hover:border-app-accent hover:shadow-xs transition-all flex flex-col justify-between`}
            >
              <div>
                <h4 className="text-xs font-bold text-app-text">{preset.name}</h4>
                <p className="text-[10px] text-app-text-muted mt-1 lines-clamp-2 leading-relaxed">
                  {preset.description}
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`Bạn có chắc muốn nạp thêm ${preset.name} vào từ điển cá nhân?`)) {
                    onLoadPreset(preset.items, preset.category);
                  }
                }}
                className={`mt-3.5 w-full ${uiBtnSecondary} !min-h-8 !text-[10px]`}
              >
                <FolderPlus className="w-3.5 h-3.5" /> Nạp {Object.keys(preset.items).length} từ
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Form and search columns - Adaptive Stack */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1 min-h-0">
        {/* Form add on left */}
        <div className="lg:col-span-4 border-b lg:border-b-0 lg:border-r border-app-border pb-5 lg:pb-0 lg:pr-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <h3 className={uiLabel}>Thêm từ khóa thủ công</h3>
            
            <div>
              <label className={uiFieldLabel}>
                Từ gốc Trung Văn (Hán tự)
              </label>
              <input
                type="text"
                required
                value={chinese}
                onChange={(e) => setChinese(e.target.value.trim())}
                placeholder="Ví dụ: 元婴"
                className={`${uiInput} !text-xs`}
              />
            </div>

            <div>
              <label className={uiFieldLabel}>
                Dịch nghĩa Việt (Vietphrase)
              </label>
              <input
                type="text"
                required
                value={vietnamese}
                onChange={(e) => setVietnamese(e.target.value)}
                placeholder="Ví dụ: Nguyên Anh"
                className={`${uiInput} !text-xs`}
              />
            </div>

            <div>
              <label className={uiFieldLabel}>
                Phân loại từ điển
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as DictItem["category"])}
                className={`${uiInput} !text-xs cursor-pointer font-medium`}
              >
                <option value="name">Tên Nhân Vật (Name)</option>
                <option value="sect">Cảnh Giới / Tông Môn (Sect)</option>
                <option value="item">Pháp Bảo / Bảo Vật (Items)</option>
                <option value="military">Lịch Sử - Quân Sự (Military)</option>
                <option value="history">Huyền Huyễn / Thần Thoại</option>
                <option value="custom">Đô Thị & Ngôn Tình</option>
                <option value="other">Loại Khác (Other)</option>
              </select>
            </div>

            {activeNovelId && (
              <div className="space-y-1.5">
                <label className={uiFieldLabel}>
                  Phạm vi áp dụng thuật ngữ:
                </label>
                <div className={uiSegmentedTrack}>
                  <button
                    type="button"
                    onClick={() => setDictScope("chung")}
                    className={`flex-1 text-xs font-bold cursor-pointer ${
                      dictScope === "chung" ? uiSegmentedBtnActive : uiSegmentedBtnIdle
                    }`}
                  >
                    🌐 Toàn Cục
                  </button>
                  <button
                    type="button"
                    onClick={() => setDictScope("riêng")}
                    className={`flex-1 text-xs font-bold cursor-pointer truncate ${
                      dictScope === "riêng" ? uiSegmentedBtnActive : uiSegmentedBtnIdle
                    }`}
                    title={`Chỉ dịch cho riêng truyện: ${activeNovel?.title || ""}`}
                  >
                    📌 Riêng Truyện
                  </button>
                </div>
              </div>
            )}

            {/* Submit h-11 */}
            <button
              type="submit"
              className={`w-full ${uiBtnPrimary} !min-h-11 font-bold !text-xs shadow-md`}
            >
              <Plus className="w-4.5 h-4.5" /> Thêm Vào Từ Điển
            </button>
          </form>

          {dictItems.length > 0 && (
            <div className="mt-4 pt-3.5 border-t border-app-border">
              <button
                onClick={() => {
                  if (confirm("Hành động này sẽ xóa toàn bộ từ điển tùy chỉnh của bạn. Bạn có muốn tiếp tục?")) {
                    onClearDict();
                  }
                }}
                className={`w-full ${uiBtnDanger} !text-xs font-bold`}
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa sạch từ điển ({dictItems.length})
              </button>
            </div>
          )}

          {/* Proper name scanner setup */}
          <div className="mt-5 pt-4 border-t border-app-border" id="automated-name-scanner">
            <h3 className={`${uiLabel} mb-3 flex items-center gap-1.5`}>
              <Sparkles className="w-4 h-4 text-app-accent" /> Quét & Lọc Tên Riêng Tự Động
            </h3>
            
            {!activeNovelId ? (
              <div className={`${uiCaption} ${uiCardInset} p-3.5 italic select-none`}>
                Vui lòng nhập/chọn tác phẩm trong thư viện trước khi thực hiện chức năng quét tên riêng tự động.
              </div>
            ) : (
              <div className="space-y-3.5">
                <div>
                  <label className={uiFieldLabel}>
                    Phạm vi chương quét
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="relative">
                      <span className="text-[10px] text-app-text-muted absolute left-2 top-0.5 font-sans">Từ:</span>
                      <input
                        type="number"
                        min="1"
                        max={activeNovel?.chapters.length || 1}
                        value={scanStartChapter}
                        onChange={(e) => setScanStartChapter(e.target.value)}
                        className={`${uiInput} !min-h-9 !text-xs pl-9 pr-2 font-bold`}
                      />
                    </div>
                    <div className="relative">
                      <span className="text-[10px] text-app-text-muted absolute left-2 top-0.5 font-sans">Đến:</span>
                      <input
                        type="number"
                        min="1"
                        max={activeNovel?.chapters.length || 1}
                        value={scanEndChapter}
                        onChange={(e) => setScanEndChapter(e.target.value)}
                        className={`${uiInput} !min-h-9 !text-xs pl-9 pr-2 font-bold`}
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className={`${uiFieldLabel} !text-[10px]`}>Độ dài gốc (Chữ)</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={scanMinLength}
                        onChange={(e) => setScanMinLength(e.target.value)}
                        className={`${uiInput} !min-h-8 text-center !text-xs font-mono font-bold`}
                      />
                      <span className="text-app-text-muted">-</span>
                      <input
                        type="number"
                        min="1"
                        max="15"
                        value={scanMaxLength}
                        onChange={(e) => setScanMaxLength(e.target.value)}
                        className={`${uiInput} !min-h-8 text-center !text-xs font-mono font-bold`}
                      />
                    </div>
                  </div>

                  <div>
                    <label className={`${uiFieldLabel} !text-[10px]`}>Tần suất tối thiểu</label>
                    <input
                      type="number"
                      min="1"
                      value={scanMinOccurrence}
                      onChange={(e) => setScanMinOccurrence(e.target.value)}
                      className={`${uiInput} !min-h-8 text-center !text-xs font-mono font-bold`}
                    />
                  </div>
                </div>

                {/* Reference dictionary — tra cứu PA-3 vs loại trừ quét (tách riêng) */}
                <div className={`${uiCardInset} p-3 space-y-2.5`}>
                  <span className={`${uiLabel} !text-[10px] leading-none`}>
                    File đối chiếu &amp; lọc quét:
                  </span>

                  <div className="pt-0.5">
                    <label className={`${uiBtnGhost} w-full !min-h-8.5 border-dashed hover:border-app-accent hover:text-app-accent !text-[10px] font-bold cursor-pointer`}>
                      <Upload className="w-3.5 h-3.5 text-app-text-muted" />
                      {refDictFileName ? `Đã nạp: ${refDictFileName}` : "Nạp file Vietphrase / từ điển (.txt)"}
                      <input
                        type="file"
                        accept={typeof navigator !== "undefined" && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? "text/plain,.txt" : ".txt"}
                        onChange={handleRefDictUpload}
                        className="hidden"
                      />
                    </label>
                    <span className={`block ${uiCaption} !text-[9px] mt-1 font-medium`}>
                      Định dạng: mỗi dòng <span className="font-mono">HánTự=NghĩaDịch</span> (UTF-8 hoặc GB18030).
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-0.5">
                    <label className="flex items-start gap-2 text-xs font-semibold text-app-text cursor-pointer select-none leading-tight">
                      <input
                        type="checkbox"
                        checked={excludeCommonWords}
                        onChange={(e) => setExcludeCommonWords(e.target.checked)}
                        className="w-3.5 h-3.5 mt-0.5 rounded border-app-border text-app-accent focus:ring-app-accent/35 cursor-pointer accent-app-accent shrink-0"
                      />
                      Lọc bỏ từ thông dụng tích hợp sẵn (80+ từ)
                    </label>

                    <label className={`flex items-start gap-2 text-xs font-semibold cursor-pointer select-none leading-tight ${
                      Object.keys(refDict).length === 0 ? "opacity-50 text-app-text-muted" : "text-app-text"
                    }`}>
                      <input
                        type="checkbox"
                        disabled={Object.keys(refDict).length === 0}
                        checked={useRefDictForLookup}
                        onChange={(e) => setUseRefDictForLookup(e.target.checked)}
                        className="w-3.5 h-3.5 mt-0.5 rounded border-app-border text-app-accent focus:ring-app-accent/35 cursor-pointer accent-app-accent shrink-0 disabled:opacity-50"
                      />
                      Dùng file để điền «Tên trong bản dịch» (PA-3) — {Object.keys(refDict).length} cụm
                    </label>

                    <label className={`flex items-start gap-2 text-xs font-semibold cursor-pointer select-none leading-tight ${
                      Object.keys(refDict).length === 0 ? "opacity-50 text-app-text-muted" : "text-app-text"
                    }`}>
                      <input
                        type="checkbox"
                        disabled={Object.keys(refDict).length === 0}
                        checked={excludeRefWords}
                        onChange={(e) => setExcludeRefWords(e.target.checked)}
                        className="w-3.5 h-3.5 mt-0.5 rounded border-app-border text-app-accent focus:ring-app-accent/35 cursor-pointer accent-app-accent shrink-0 disabled:opacity-50"
                      />
                      Ẩn cụm đã có trong file khỏi danh sách quét (blacklist)
                    </label>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleRunScan()}
                  disabled={isScanRunning}
                  className={`w-full ${uiBtnPrimary} !text-xs font-bold shadow-sm disabled:opacity-60`}
                >
                  <Search className="w-3.5 h-3.5" />
                  {isScanRunning
                    ? useRefDictForLookup && Object.keys(refDict).length > 0
                      ? "Đang quét & tra file đối chiếu…"
                      : "Đang quét…"
                    : "Chạy Quét Nhận Diện Tên"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* List scroll panel on right (lg:col-span-8) */}
        <div className="lg:col-span-8 flex flex-col h-[500px] lg:h-auto min-h-0 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <h3 className={`${uiLabel} font-sans`}>
              Kho Thuật Ngữ Đã Lưu ({filteredItems.length} Từ)
            </h3>
            
            {/* Search term dict */}
            <div className="relative w-full sm:w-56 shrink-0">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-app-text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm từ vựng nhanh..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`${uiInput} !text-xs pl-9 font-medium`}
              />
            </div>
          </div>

          {/* Scope selection controls tabs */}
          <div className={`${uiSegmentedTrack} gap-1.5 shrink-0 select-none`}>
            <button
              type="button"
              onClick={() => setFilterSubset("all")}
              className={`flex-1 font-bold cursor-pointer ${
                filterSubset === "all" ? uiSegmentedBtnActive : uiSegmentedBtnIdle
              }`}
            >
              Tất Cả ({visibleItems.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterSubset("chung")}
              className={`flex-1 font-bold cursor-pointer ${
                filterSubset === "chung" ? uiSegmentedBtnActive : uiSegmentedBtnIdle
              }`}
            >
              🌐 Chung ({dictItems.filter(i => !i.novelId).length})
            </button>
            {activeNovelId && (
              <button
                type="button"
                onClick={() => setFilterSubset("riêng")}
                className={`flex-1 font-bold cursor-pointer truncate ${
                  filterSubset === "riêng" ? uiSegmentedBtnActive : uiSegmentedBtnIdle
                }`}
                title={`Từ vựng riêng của: ${activeNovel?.title}`}
              >
                📌 Riêng ({dictItems.filter(i => i.novelId === activeNovelId).length})
              </button>
            )}
          </div>

          <input
            ref={commonDictFileInputRef}
            type="file"
            accept={typeof navigator !== "undefined" && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? "*/*" : ".txt"}
            onChange={(e) => handleDictTxtFileUpload(e, "chung")}
            className="hidden"
          />
          <input
            ref={novelDictFileInputRef}
            type="file"
            accept={typeof navigator !== "undefined" && /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ? "*/*" : ".txt"}
            onChange={(e) => handleDictTxtFileUpload(e, "rieng")}
            className="hidden"
          />

          {filterSubset === "chung" && (
            <div className="shrink-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => commonDictFileInputRef.current?.click()}
                  className={`${uiBtnSecondary} !text-xs font-bold`}
                  title="Mỗi dòng HánTự=TênViệt. Trùng Hán trong từ chung sẽ bỏ qua."
                >
                  <Upload className="w-4 h-4" /> Import từ điển
                </button>
                <button
                  type="button"
                  onClick={handleExportDictSubset}
                  className={`${uiBtnGhost} !text-xs font-bold`}
                  title="Xuất file .txt"
                >
                  <Download className="w-4 h-4" /> Export từ điển
                </button>
              </div>
              <p className={`${uiCaption} !text-[10px] leading-relaxed`}>
                Từ chung dùng cho mọi truyện khi dịch. Chương chưa dịch nhận từ qua prompt AI — không có nút sửa hàng loạt trên tab này.
              </p>
            </div>
          )}

          {filterSubset === "riêng" && activeNovelId && (
            <div className="shrink-0 space-y-2">
              <div
                className={`${uiCardInset} px-3 py-2.5 border border-purple-500/20 bg-purple-500/5`}
                title={activeNovel?.title}
              >
                <p className={`${uiCaption} !text-[10px] font-bold uppercase tracking-wide text-purple-600 dark:text-purple-400`}>
                  Từ điển riêng đang áp dụng cho
                </p>
                <p className="text-xs font-bold text-app-text mt-0.5 line-clamp-2 break-words">
                  {activeNovel?.title || "—"}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => novelDictFileInputRef.current?.click()}
                  className={`${uiBtnSecondary} !text-xs font-bold`}
                  title="Chỉ thêm vào từ điển riêng — không tự mở sửa bản dịch."
                >
                  <Upload className="w-4 h-4" /> Import từ điển
                </button>
                <button
                  type="button"
                  onClick={handleExportDictSubset}
                  className={`${uiBtnGhost} !text-xs font-bold`}
                >
                  <Download className="w-4 h-4" /> Export từ điển
                </button>
                <button
                  type="button"
                  onClick={handleNormalizeNovelTranslations}
                  className={`${uiBtnPrimary} !text-xs font-bold shadow-sm`}
                  title="Quét chương đã dịch (Lab), đề xuất thay tên cũ theo từ điển riêng."
                >
                  <RefreshCw className="w-4 h-4" /> Chuẩn hóa bản dịch đã có
                </button>
              </div>
              <p className={`${uiCaption} !text-[10px] leading-relaxed`}>
                Import chỉ cập nhật kho từ. Chuẩn hóa mở xem trước thay tên trên chương đã dịch — nên sao lưu VFS trước. Chương chưa dịch: từ riêng ưu tiên hơn chung trong prompt.
              </p>
            </div>
          )}

          {filterSubset === "riêng" && !activeNovelId && (
            <p className={`${uiCaption} !text-[10px]`}>
              Chọn tác phẩm trong Thư viện để dùng từ điển riêng.
            </p>
          )}

          {activeNovelId && filterSubset === "all" && (
            <p className={`${uiCaption} !text-[10px]`}>
              Mẹo: chuyển sang tab 📌 Riêng để Import / Export / Chuẩn hóa bản dịch theo truyện.
            </p>
          )}

          <div className="overflow-y-auto flex-1 custom-scrollbar border-y md:border border-app-border rounded-none md:rounded-lg bg-app-surface-muted/50 min-h-[300px]">
            {filteredItems.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-app-text-muted p-8 text-center select-none">
                <AlertTriangle className="w-8 h-8 mb-2.5 text-app-text-muted" />
                <p className="text-xs italic font-bold">Chưa tìm thấy thuật ngữ tương ứng.</p>
                <p className="text-[10px] mt-1 max-w-xs text-app-text-muted leading-relaxed font-normal">
                  {filterSubset === "riêng" && activeNovel?.title ? (
                    <>
                      Chưa có mục riêng cho «{activeNovel.title}». Thêm thủ công, nhập file .txt, hoặc bôi chữ khi đọc để tạo nhanh.
                    </>
                  ) : (
                    <>
                      Chưa có dữ liệu từ điển khớp. Hãy chọn bôi cụm từ Hán văn trực tiếp khi đọc chương tại Giao Diện Độc Giả để tạo nhanh!
                    </>
                  )}
                </p>
              </div>
            ) : (
              <div className="p-2 gap-2 flex flex-col">
                {filteredItems.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl ${uiCard} group ${
                        isEditing ? "aligned-row-editing-card border-app-accent bg-app-accent/5" : ""
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex-1 grid grid-cols-1 sm:grid-cols-4 gap-2 text-xs animate-scale-up">
                          <input
                            type="text"
                            value={editChinese}
                            onChange={(e) => setEditChinese(e.target.value.trim())}
                            className={`${uiInput} !min-h-0 px-2 py-1.5 !text-xs font-bold`}
                          />
                          <input
                            type="text"
                            value={editVietnamese}
                            onChange={(e) => setEditVietnamese(e.target.value)}
                            className={`${uiInput} !min-h-0 px-2 py-1.5 !text-xs font-bold text-emerald-600 dark:text-emerald-400`}
                          />
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value as DictItem["category"])}
                            className={`${uiInput} !min-h-0 px-2 py-1.5 !text-xs font-semibold`}
                          >
                            <option value="name">Tên</option>
                            <option value="sect">Cảnh Giới</option>
                            <option value="item">Pháp Bảo</option>
                            <option value="military">Lịch Sử</option>
                            <option value="history">Thần Thoại</option>
                            <option value="custom">Ngôn Tình</option>
                            <option value="other">Loại Khác</option>
                          </select>
                          {activeNovelId && (
                            <select
                              value={editNovelId || ""}
                              onChange={(e) => setEditNovelId(e.target.value ? e.target.value : undefined)}
                              className={`${uiInput} !min-h-0 px-2 py-1.5 !text-xs font-bold`}
                            >
                              <option value="">🌐 Chung</option>
                              <option value={activeNovelId}>📌 Riêng</option>
                            </select>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2 overflow-hidden flex-1 select-all">
                          <span className="font-bold text-app-text text-xs shrink-0 bg-app-surface-muted px-2.5 py-1 rounded-lg font-mono border border-app-border">
                            {item.chinese}
                          </span>
                          <span className="text-app-text-muted font-sans text-xs select-none">&rarr;</span>
                          <span className="font-bold text-app-text text-xs truncate mr-1">
                            {item.vietnamese}
                          </span>
                          <span className="text-[10px] font-mono px-2 py-0.5 bg-app-accent/10 border border-app-accent/25 text-app-accent rounded-md font-bold uppercase tracking-wider scale-90 select-none shrink-0">
                            {item.category === "name" && "Tên"}
                            {item.category === "sect" && "Cảnh Giới"}
                            {item.category === "item" && "Pháp Bảo"}
                            {item.category === "military" && "Lịch Sử"}
                            {item.category === "history" && "Thần Thoại"}
                            {item.category === "custom" && "Ngôn Tình"}
                            {item.category === "other" && "Khác"}
                          </span>
                          <span className={`text-[10px] font-mono px-2 py-0.5 rounded-md font-bold uppercase tracking-wider scale-90 select-none shrink-0 border ${
                            item.novelId
                              ? "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400"
                              : "bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400"
                          }`}>
                            {item.novelId ? "📌 Riêng" : "🌍 Chung"}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-1 shrink-0 ml-auto select-none">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(item.id)}
                              className="p-2 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 rounded-lg cursor-pointer active:scale-90"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="p-2 text-app-text-muted hover:bg-app-surface-muted rounded-lg cursor-pointer active:scale-90"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="p-2 text-app-text-muted hover:text-app-accent hover:bg-app-surface-muted rounded-lg cursor-pointer active:scale-90"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Xóa cụm từ "${item.chinese}" khỏi bộ nhớ từ điển?`)) {
                                  onDeleteWord(item.id);
                                }
                              }}
                              className="p-2 text-app-text-muted hover:text-red-600 hover:bg-red-500/10 rounded-lg cursor-pointer active:scale-95"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal chuẩn hóa tên trong bản dịch đã có (tab Riêng) */}
      {isImportPreviewOpen && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[55] rounded-lg animate-fade-in">
          <div
            className={`${uiPanel} shadow-2xl w-full max-w-2xl h-full max-h-[92dvh] !p-0 text-app-text flex flex-col`}
            id="novel-dict-import-preview-modal"
          >
            <div className="p-4 border-b border-app-border flex items-center justify-between bg-app-surface-muted shrink-0">
              <div className="min-w-0 pr-2">
                <h3 className="text-sm font-bold text-app-text flex items-center gap-1.5 font-sans">
                  <FileSpreadsheet className="w-4.5 h-4.5 text-app-accent" /> Chuẩn hóa tên trong bản dịch đã có
                </h3>
                <p className={`${uiCaption} !text-[10px] mt-0.5 line-clamp-2`} title={activeNovel?.title}>
                  Truyện: {activeNovel?.title || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsImportPreviewOpen(false)}
                disabled={isImportApplying}
                className="h-9 w-9 hover:bg-app-surface-muted rounded-lg text-app-text-muted hover:text-app-text flex items-center justify-center cursor-pointer shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-app-border bg-app-surface flex flex-wrap items-center justify-between gap-2 text-xs shrink-0">
              <span className="text-app-text-muted font-bold">
                {importPreviewRows.filter((r) => r.selected).length}/{importPreviewRows.length} quy tắc ·{" "}
                {importPreviewRows.filter((r) => r.confidence === "high").length} tin cậy ·{" "}
                {importPreviewRows.filter((r) => r.confidence === "low").length} nghi ngờ
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setImportPreviewRows((prev) =>
                      prev.map((r) => ({ ...r, selected: r.confidence === "high" }))
                    )
                  }
                  className={`${uiBtnSecondary} !min-h-0 !px-2.5 !py-1 !text-[10px] font-bold`}
                >
                  Chỉ tin cậy
                </button>
                <button
                  type="button"
                  onClick={() => setImportPreviewRows((prev) => prev.map((r) => ({ ...r, selected: true })))}
                  className={`${uiBtnSecondary} !min-h-0 !px-2.5 !py-1 !text-[10px] font-bold`}
                >
                  Chọn tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setImportPreviewRows((prev) => prev.map((r) => ({ ...r, selected: false })))}
                  className={`${uiBtnSecondary} !min-h-0 !px-2.5 !py-1 !text-[10px] font-bold`}
                >
                  Bỏ hết
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-app-surface-muted shadow-inner custom-scrollbar">
              {importPreviewRows.map((row) => (
                <label
                  key={row.id}
                  className={`flex items-start gap-2.5 p-3 border rounded-xl cursor-pointer ${uiCard} ${
                    row.selected ? "border-app-accent bg-app-accent/5" : "border-app-border opacity-60"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={row.selected}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setImportPreviewRows((prev) =>
                        prev.map((r) => (r.id === row.id ? { ...r, selected: checked } : r))
                      );
                    }}
                    className="w-4 h-4 mt-0.5 accent-app-accent shrink-0"
                  />
                  <div className="min-w-0 flex-1 text-xs">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono font-bold text-app-text bg-app-surface-muted px-1.5 py-0.5 rounded border border-app-border">
                        {row.chinese}
                      </span>
                      <span
                        className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                          row.confidence === "high"
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-amber-500/15 text-amber-700 dark:text-amber-400"
                        }`}
                      >
                        {row.confidence === "high" ? "Tin cậy" : "Nghi ngờ"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-app-text">
                      <span className="text-app-text-muted">«{row.from}»</span>
                      <span className="mx-1.5 text-app-text-muted">&rarr;</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">«{row.to}»</span>
                    </p>
                    <p className={`${uiCaption} !text-[10px] mt-1`}>
                      {row.occurrences} lần · {row.chapterCount} chương
                    </p>
                  </div>
                </label>
              ))}
            </div>

            <div className="p-4 border-t border-app-border bg-app-surface flex gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsImportPreviewOpen(false)}
                disabled={isImportApplying}
                className={`flex-1 ${uiBtnGhost} font-bold !text-xs`}
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={handleConfirmImportApply}
                disabled={isImportApplying || importPreviewRows.every((r) => !r.selected)}
                className={`flex-1 ${uiBtnPrimary} font-bold !text-xs`}
              >
                {isImportApplying ? "Đang áp dụng…" : "Áp dụng vào bản dịch"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Proper Name Scanner popup */}
      {isScanPopupOpen && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 z-[55] rounded-lg animate-fade-in">
          <div className={`${uiPanel} shadow-2xl w-full max-w-2xl h-full max-h-[92dvh] !p-0 text-app-text flex flex-col`} id="scan-popup-modal">
            
            {/* Header */}
            <div className="p-4 border-b border-app-border flex items-center justify-between bg-app-surface-muted shrink-0">
              <div>
                <h3 className="text-sm font-bold text-app-text flex items-center gap-1.5 font-sans uppercase">
                  <Sparkles className="w-4.5 h-4.5 text-app-accent" /> Kết quả quét & lọc tên riêng
                </h3>
                <p className={`${uiCaption} !text-[10px] mt-0.5 font-mono`}>
                  Phạm vi: chương {scanStartChapter} &rarr; {scanEndChapter} | Độ dài: {scanMinLength} - {scanMaxLength} chữ | Tần suất &ge; {scanMinOccurrence}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsScanPopupOpen(false)}
                className="h-9 w-9 hover:bg-app-surface-muted rounded-lg text-app-text-muted hover:text-app-text flex items-center justify-center cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Actions tab selection */}
            <div className="px-4 py-2 border-b border-app-border bg-app-surface flex items-center justify-between text-xs shrink-0 select-none">
              <span className="text-app-text-muted font-bold">
                Tìm thấy <strong className="text-app-accent">{scanResults.length}</strong> từ chưa có trong từ điển:
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setScanResults(prev => prev.map(r => ({ ...r, selected: true })))}
                  className={`${uiBtnSecondary} !min-h-0 !px-2.5 !py-1 !text-[10px] font-bold`}
                >
                  Chọn Tất Cả
                </button>
                <button
                  type="button"
                  onClick={() => setScanResults(prev => prev.map(r => ({ ...r, selected: false })))}
                  className={`${uiBtnSecondary} !min-h-0 !px-2.5 !py-1 !text-[10px] font-bold`}
                >
                  Bỏ Hết
                </button>
              </div>
            </div>

            {/* List Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-app-surface-muted shadow-inner custom-scrollbar">
              {scanResults.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                  <AlertTriangle className="w-8 h-8 text-app-text-muted mb-2" />
                  <p className="text-xs text-app-text-muted font-bold italic">Không tìm thấy từ nào thỏa mãn điều kiện lọc.</p>
                  <p className={`${uiCaption} !text-[10px] mt-1 max-w-sm`}>Hãy thử giảm tần suất tối thiểu hoặc nới rộng khoảng chương.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {scanResults.map((res, index) => (
                    <div
                      key={`${res.chinese}-${index}`}
                      className={`flex flex-col gap-2.5 p-3 border rounded-xl transition-all ${uiCard} ${
                        res.selected
                          ? "border-app-accent bg-app-accent/5"
                          : "border-app-border opacity-60"
                      }`}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="checkbox"
                          checked={res.selected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setScanResults((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, selected: checked } : r))
                            );
                          }}
                          className="w-4 h-4 text-app-accent border-app-border rounded focus:ring-app-accent cursor-pointer accent-app-accent shrink-0"
                        />
                        <span className="font-mono font-bold text-sm text-app-text bg-app-surface-muted px-2.5 py-1 rounded-md border border-app-border select-all">
                          {res.chinese}
                        </span>
                        <span className="text-[10px] font-mono text-app-text-muted font-bold">
                          ({res.count} lần)
                        </span>
                        {res.entityKind && res.entityKind !== "other" ? (
                          <span
                            className={entityKindBadgeClass(res.entityKind)}
                            title="Gợi ý phân loại thực thể (10B)"
                          >
                            {entityKindLabel(res.entityKind)}
                          </span>
                        ) : null}
                        <select
                          value={res.category}
                          onChange={(e) => {
                            const cat = e.target.value as DictItem["category"];
                            setScanResults((prev) =>
                              prev.map((r, i) => (i === index ? { ...r, category: cat } : r))
                            );
                          }}
                          className={`${uiInput} !min-h-8 !text-[11px] !px-2 font-bold ml-auto shrink-0`}
                        >
                          <option value="name">Tên</option>
                          <option value="sect">Cảnh/Tông</option>
                          <option value="item">Pháp Bảo</option>
                          <option value="military">Quân sự</option>
                          <option value="history">Huyền huyễn</option>
                          <option value="custom">Ngôn tình</option>
                          <option value="other">Yếu tố khác</option>
                        </select>
                      </div>

                      <div className="w-full min-w-0">
                        <label className={`${uiCaption} !text-[10px] font-bold uppercase tracking-wide text-app-text-muted`}>
                          Hán Việt (gợi ý · offline)
                        </label>
                        <div
                          className="mt-1 w-full rounded-lg border border-app-border bg-app-surface-muted px-3 py-2 text-sm font-bold text-app-text leading-relaxed break-words whitespace-normal select-all"
                          title="Chỉ tham khảo âm Hán Việt — không dùng làm bản dịch tự động"
                        >
                          {res.hanViet || "—"}
                        </div>
                      </div>

                      <div className="w-full min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <label className={`${uiCaption} !text-[10px] font-bold uppercase tracking-wide text-app-text-muted`}>
                            Tên trong bản dịch (lưu từ điển)
                          </label>
                          {res.translationSource === "lab" ? (
                            <span className="text-[9px] font-bold uppercase text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                              Lab
                            </span>
                          ) : res.translationSource === "vietphrase" ? (
                            <span className="text-[9px] font-bold uppercase text-sky-600 dark:text-sky-400 px-1.5 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                              VP
                            </span>
                          ) : res.translationSource === "hv" ? (
                            <span className="text-[9px] font-bold uppercase text-purple-600 dark:text-purple-400 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                              HV
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20">
                              Nhập tay
                            </span>
                          )}
                        </div>
                        <input
                          type="text"
                          value={res.vietnamese}
                          onChange={(e) => {
                            const val = e.target.value;
                            setScanResults((prev) =>
                              prev.map((r, i) => {
                                if (i !== index) return r;
                                const entityKind = val.trim()
                                  ? inferEntityKind(r.chinese, val)
                                  : "other";
                                return {
                                  ...r,
                                  vietnamese: val,
                                  translationSource: "none" as const,
                                  entityKind,
                                  category: inferScanCategory(r.chinese, entityKind),
                                };
                              })
                            );
                          }}
                          className={`${uiInput} !min-h-10 !text-sm w-full mt-1 font-bold`}
                          placeholder="Khớp từ chương đã dịch Lab hoặc nhập tên…"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer with touch height 12 confirm */}
            <div className="p-4 border-t border-app-border flex items-center justify-between bg-app-surface-muted shrink-0 select-none">
              <button
                type="button"
                onClick={() => setIsScanPopupOpen(false)}
                className={`${uiBtnGhost} !text-xs font-bold`}
              >
                Hủy Bỏ
              </button>
              
              <button
                type="button"
                disabled={scanResults.filter(r => r.selected).length === 0}
                onClick={handleConfirmImport}
                className={`${uiBtnPrimary} !min-h-11 px-5 !text-xs font-bold shadow-sm disabled:opacity-50`}
                title="Lưu tất cả các cụm quét vào từ điển"
              >
                <Check className="w-4 h-4" /> Xác Nhận Nạp ({scanResults.filter(r => r.selected).length})
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
