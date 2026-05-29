import React, { useState, useEffect } from "react";
import { 
  Folder, 
  FolderOpen, 
  FileText, 
  ChevronRight, 
  ChevronDown, 
  Download, 
  Upload, 
  Save, 
  Copy, 
  RefreshCw, 
  FileJson, 
  Trash2, 
  FileCode,
  FolderTree,
  Info,
  HelpCircle,
  History,
  HardDrive,
  ArrowLeft,
  AlertTriangle
} from "lucide-react";
import JSZip from "jszip";
import { dbPromise, saveValue, deleteValue } from "../lib/persistence";
import { Novel, Chapter, DictItem, PronounMapping, TranslationSettings } from "../types";
import { paginateChapter } from "../utils/readerPaginateChapter";
import {
  buildTranslationBackupZip,
  collectTranslationBackupNovels,
  countTranslatedChapters,
  downloadBlobWithFallback,
  isFullVfsZipPath,
  isTranslationBackupZipPath,
} from "../utils/translationBackup";
import { deleteNativeExportedFile, saveBlobWithNativeFallback } from "../utils/nativeFileSave";
import {
  ExportedFileEntry,
  listExportedFiles,
  removeExportedFileById,
} from "../utils/exportedFilesRegistry";
import {
  uiPanel,
  uiCard,
  uiCardInset,
  uiInput,
  uiBtnPrimary,
  uiBtnGhost,
  uiBtnSecondary,
  uiBtnDanger,
  uiLabel,
  uiCaption,
  uiTitle,
  uiIconHeader,
  uiInfoBanner,
  uiSection,
  uiFieldLabel,
  uiInlineFeedbackInfo,
  uiInlineFeedbackSuccess,
  uiInlineFeedbackWarning,
  uiInlineFeedbackDanger,
} from "../lib/ui";

interface VFSNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: VFSNode[];
  content?: string;
  dataType?: "novel" | "chapter_src" | "chapter_trans" | "page_trans" | "dict" | "pronouns" | "settings" | "backup";
  meta?: any;
}

interface VFSManagerProps {
  novels: Novel[];
  dictItems: DictItem[];
  pronounMappings: PronounMapping[];
  settings: TranslationSettings;
  setNovels: React.Dispatch<React.SetStateAction<Novel[]>>;
  setDictItems: React.Dispatch<React.SetStateAction<DictItem[]>>;
  setPronounMappings: React.Dispatch<React.SetStateAction<PronounMapping[]>>;
  setSettings: React.Dispatch<React.SetStateAction<TranslationSettings>>;
  onAlert: (title: string, desc: string) => void;
  onImportTranslationBackup: (file: File) => void | Promise<void>;
}

export default function VFSManager({
  novels,
  dictItems,
  pronounMappings,
  settings,
  setNovels,
  setDictItems,
  setPronounMappings,
  setSettings,
  onAlert,
  onImportTranslationBackup,
}: VFSManagerProps) {
  const [viewMode, setViewMode] = useState<"backup" | "fileEditor">("backup");
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [activeFileContent, setActiveFileContent] = useState<string>("");
  const [editorError, setEditorError] = useState<string | null>(null);
  const [treeSearchQuery, setTreeSearchQuery] = useState("");
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({ "luu_tru": true });
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isExportingTranslation, setIsExportingTranslation] = useState(false);
  const [isImportingTranslation, setIsImportingTranslation] = useState(false);
  const [isDeletingExportedFile, setIsDeletingExportedFile] = useState<string | null>(null);
  const [panelFeedback, setPanelFeedback] = useState<{
    tone: "info" | "success" | "warning" | "danger";
    message: string;
  } | null>(null);
  
  // Stored page translations fetched directly from IndexedDB
  const [pageTranslations, setPageTranslations] = useState<Record<string, string[]>>({});
  const [backupFiles, setBackupFiles] = useState<Record<string, any>>({});
  const [exportedFiles, setExportedFiles] = useState<ExportedFileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newBackupAlert, setNewBackupAlert] = useState<{ fileName: string; backupKey: string } | null>(null);

  // Load supplemental IndexedDB elements (page translations, backup snapshots)
  const loadIndexedDBExtra = async () => {
    setIsLoading(true);
    try {
      const db = await dbPromise;
      const allRecords = await db.getAll("settings");
      
      const pageTransMap: Record<string, string[]> = {};
      const backupMap: Record<string, any> = {};

      allRecords.forEach((record: any) => {
        if (record.id.startsWith("page_trans_")) {
          const chapId = record.id.replace("page_trans_", "");
          if (Array.isArray(record.value)) {
            pageTransMap[chapId] = record.value;
          }
        } else if (record.id.startsWith("vfs_backup_")) {
          backupMap[record.id] = record.value;
        }
      });

      setPageTranslations(pageTransMap);
      setBackupFiles(backupMap);
      setExportedFiles(await listExportedFiles());
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIndexedDBExtra();
  }, [novels]);

  // Generate cleaned filename/slug name helper
  const cleanSlug = (name: string): string => {
    return name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9_\-ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠàáâãèéêìíòóôõùúăđĩũơƯĂÂÊÔƠưăâêôơđ]/gu, "_")
      .replace(/_+/g, "_")
      .slice(0, 35);
  };

  // Build Virtual File System (VFS) Tree structure from databases state
  const buildVFSTree = (): VFSNode => {
    const root: VFSNode = {
      name: "luu_tru",
      path: "luu_tru",
      type: "folder",
      children: [],
    };

    // 1. Settings subfolder
    const settingsFolder: VFSNode = {
      name: "settings",
      path: "luu_tru/settings",
      type: "folder",
      children: [
        {
          name: "cau_hinh_he_thong.json",
          path: "luu_tru/settings/cau_hinh_he_thong.json",
          type: "file",
          dataType: "settings",
          content: JSON.stringify(settings, null, 2),
        }
      ],
    };
    root.children?.push(settingsFolder);

    // 2. Dictionaries subfolder
    const dictionariesFolder: VFSNode = {
      name: "dictionaries",
      path: "luu_tru/dictionaries",
      type: "folder",
      children: [
        {
          name: "tu_dien_rieng.json",
          path: "luu_tru/dictionaries/tu_dien_rieng.json",
          type: "file",
          dataType: "dict",
          content: JSON.stringify(dictItems, null, 2),
        },
        {
          name: "tu_dien_nhan_xung.json",
          path: "luu_tru/dictionaries/tu_dien_nhan_xung.json",
          type: "file",
          dataType: "pronouns",
          content: JSON.stringify(pronounMappings, null, 2),
        }
      ],
    };
    root.children?.push(dictionariesFolder);

    // 3. Books (Novels) subfolder
    const booksFolder: VFSNode = {
      name: "books",
      path: "luu_tru/books",
      type: "folder",
      children: [],
    };

    novels.forEach((novel) => {
      const bookSlug = `${cleanSlug(novel.title)}_${novel.id.slice(0, 5)}`;
      const bookFolder: VFSNode = {
        name: bookSlug,
        path: `luu_tru/books/${bookSlug}`,
        type: "folder",
        children: [],
      };

      // novel info metadata json file
      const metaInfo = {
        id: novel.id,
        title: novel.title,
        author: novel.author,
        sourceUrl: novel.sourceUrl || "",
        createdAt: novel.createdAt,
        lastReadChapterId: novel.lastReadChapterId || "",
        lastReadPageIndex: novel.lastReadPageIndex ?? null,
        lastReadMode: novel.lastReadMode || "",
        lastReadPercentage: novel.lastReadPercentage || 0,
      };

      bookFolder.children?.push({
        name: "meta.json",
        path: `luu_tru/books/${bookSlug}/meta.json`,
        type: "file",
        dataType: "novel",
        content: JSON.stringify(metaInfo, null, 2),
        meta: { novelId: novel.id },
      });

      // chapters subfolder
      const chaptersFolder: VFSNode = {
        name: "chapters",
        path: `luu_tru/books/${bookSlug}/chapters`,
        type: "folder",
        children: [],
      };

      novel.chapters.forEach((chap, cIdx) => {
        const chapSlug = `chuong_${cIdx + 1}_${cleanSlug(chap.title)}`;
        
        // original chinese text
        chaptersFolder.children?.push({
          name: `${chapSlug}_trung.txt`,
          path: `luu_tru/books/${bookSlug}/chapters/${chapSlug}_trung.txt`,
          type: "file",
          dataType: "chapter_src",
          content: chap.sourceText || "",
          meta: { novelId: novel.id, chapterId: chap.id },
        });

        // compiled translated vietnamese text (or fallback to cached pages merge if chap is untranslated but has page cache)
        let vietTxt = chap.translatedText || "";
        if (!vietTxt.trim() && pageTranslations[chap.id]) {
          vietTxt = pageTranslations[chap.id].filter(Boolean).join("\n\n");
        }

        chaptersFolder.children?.push({
          name: `${chapSlug}_viet.txt`,
          path: `luu_tru/books/${bookSlug}/chapters/${chapSlug}_viet.txt`,
          type: "file",
          dataType: "chapter_trans",
          content: vietTxt,
          meta: { novelId: novel.id, chapterId: chap.id },
        });

        // specific page translation files or simulated pages from fully translated chapter text
        let finalPagesArray = pageTranslations[chap.id] || [];
        if ((!finalPagesArray || finalPagesArray.every(p => !p || !p.trim())) && vietTxt.trim()) {
          try {
            const segmented = paginateChapter(vietTxt, settings, 600, 800);
            finalPagesArray = segmented.map(page => page.paragraphs.map(p => p.text).join("\n\n"));
          } catch (e) {
            finalPagesArray = vietTxt.split("\n\n").filter(Boolean);
          }
        }

        if (finalPagesArray && finalPagesArray.some(p => p && p.trim().length > 0)) {
          const pagesFolder: VFSNode = {
            name: `pages_cache_${chapSlug}`,
            path: `luu_tru/books/${bookSlug}/chapters/${chapSlug}_pages`,
            type: "folder",
            children: [],
          };

          finalPagesArray.forEach((pText, pIdx) => {
            if (pText && pText.trim()) {
              pagesFolder.children?.push({
                name: `trang_${pIdx + 1}.txt`,
                path: `luu_tru/books/${bookSlug}/chapters/${chapSlug}_pages/trang_${pIdx + 1}.txt`,
                type: "file",
                dataType: "page_trans",
                content: pText,
                meta: { novelId: novel.id, chapterId: chap.id, pageIndex: pIdx },
              });
            }
          });

          if (pagesFolder.children && pagesFolder.children.length > 0) {
            chaptersFolder.children?.push(pagesFolder);
          }
        }
      });

      if (chaptersFolder.children && chaptersFolder.children.length > 0) {
        bookFolder.children?.push(chaptersFolder);
      }

      booksFolder.children?.push(bookFolder);
    });

    root.children?.push(booksFolder);

    // 4. Backups subfolder
    const backupsFolder: VFSNode = {
      name: "backups",
      path: "luu_tru/backups",
      type: "folder",
      children: [],
    };

    Object.entries(backupFiles).forEach(([backupKey, backupVal]) => {
      const bFile = backupKey.replace("vfs_backup_", "");
      backupsFolder.children?.push({
        name: `${bFile}.json`,
        path: `luu_tru/backups/${bFile}.json`,
        type: "file",
        dataType: "backup",
        content: JSON.stringify(backupVal, null, 2),
        meta: { backupKey },
      });
    });

    root.children?.push(backupsFolder);

    return root;
  };

  const vfsTree = buildVFSTree();
  const backupCount = Object.keys(backupFiles).length;
  const isFileEditorMode = viewMode === "fileEditor";
  const normalizedTreeSearchQuery = treeSearchQuery.trim().toLowerCase();

  const panelFeedbackClassName = panelFeedback
    ? panelFeedback.tone === "success"
      ? uiInlineFeedbackSuccess
      : panelFeedback.tone === "warning"
      ? uiInlineFeedbackWarning
      : panelFeedback.tone === "danger"
      ? uiInlineFeedbackDanger
      : uiInlineFeedbackInfo
    : null;

  const formatBytes = (bytes: number): string => {
    if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    const units = ["KB", "MB", "GB"];
    let value = bytes / 1024;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
  };

  const formatSavedAt = (iso: string): string => {
    const ts = Date.parse(iso);
    if (Number.isNaN(ts)) return iso;
    return new Date(ts).toLocaleString("vi-VN", {
      hour12: false,
    });
  };

  const getFileTypeHint = (node: VFSNode | null): string => {
    if (!node || node.type !== "file") {
      return "Chọn một tệp trên cây thư mục bên trái để xem hoặc chỉnh sửa.";
    }
    switch (node.dataType) {
      case "settings":
        return "Cấu hình app (model, API key, font đọc…). Sửa xong bấm «Lưu vào app» — JSON phải hợp lệ.";
      case "dict":
        return "Từ điển riêng. Định dạng: mảng JSON các mục Hán → Việt.";
      case "pronouns":
        return "Quy tắc xưng hô. Định dạng: mảng JSON.";
      case "novel":
        return "Thông tin truyện (tiêu đề, tiến độ đọc). Không sửa nội dung chương tại đây.";
      case "chapter_src":
        return "Văn bản Hán gốc của một chương. Lưu sẽ cập nhật Lab Dịch.";
      case "chapter_trans":
        return "Bản dịch Việt cả chương (Lab). Lưu sẽ xóa cache dịch từng trang của chương đó.";
      case "page_trans":
        return "Một trang đã dịch trong Phòng Đọc. Lưu chỉ cập nhật trang này.";
      case "backup":
        return "Ảnh chụp toàn bộ app tại một thời điểm. Dùng «Khôi phục bản này» — không chỉnh sửa tay file này.";
      default:
        return "Tệp hệ thống. Chỉ nên xem hoặc tải xuống.";
    }
  };

  // Find a specific node by its file path
  const findNodeByPath = (node: VFSNode, path: string): VFSNode | null => {
    if (node.path === path) return node;
    if (node.children) {
      for (const child of node.children) {
        const found = findNodeByPath(child, path);
        if (found) return found;
      }
    }
    return null;
  };

  const activeNode = activeFilePath ? findNodeByPath(vfsTree, activeFilePath) : null;
  const hasUnsavedChanges = !!(
    activeFilePath &&
    activeNode &&
    activeFileContent !== (activeNode.content || "")
  );

  useEffect(() => {
    if (!isFileEditorMode || !hasUnsavedChanges) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Một số trình duyệt vẫn cần returnValue để bật cảnh báo.
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isFileEditorMode, hasUnsavedChanges]);

  const confirmDiscardUnsavedChanges = (nextActionLabel: string): boolean => {
    if (!hasUnsavedChanges) return true;
    return confirm(
      `Bạn có thay đổi chưa lưu trong file hiện tại.\n\nBạn có muốn bỏ thay đổi để ${nextActionLabel}?`
    );
  };

  const isJsonValidationEnabled = !!(
    activeNode &&
    activeNode.type === "file" &&
    (activeNode.name.toLowerCase().endsWith(".json") ||
      activeNode.dataType === "settings" ||
      activeNode.dataType === "dict" ||
      activeNode.dataType === "pronouns" ||
      activeNode.dataType === "novel" ||
      activeNode.dataType === "backup")
  );

  const validateJsonContentForNode = (node: VFSNode, content: string): void => {
    const parsed = JSON.parse(content);
    if (node.dataType === "settings") {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("settings phải là object JSON.");
      }
      return;
    }
    if (node.dataType === "dict" || node.dataType === "pronouns") {
      if (!Array.isArray(parsed)) {
        throw new Error(`${node.dataType} phải là mảng JSON.`);
      }
      return;
    }
    if (node.dataType === "novel") {
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("meta truyện phải là object JSON.");
      }
      return;
    }
    if (node.dataType === "backup") {
      if (!Array.isArray(parsed)) {
        throw new Error("snapshot backup phải là mảng JSON.");
      }
      return;
    }
    // Default: parse thành công là hợp lệ.
  };

  // Toggle expanded/collapsed state for tree folder nodes
  const toggleNodeExpand = (path: string) => {
    setExpandedNodes((prev) => ({
      ...prev,
      [path]: !prev[path],
    }));
  };

  // Select file helper to view/edit
  const handleSelectFile = (node: VFSNode) => {
    if (node.type !== "file") return;
    if (activeFilePath === node.path) return;
    if (!confirmDiscardUnsavedChanges("mở file khác")) return;
    setActiveFilePath(node.path);
    setActiveFileContent(node.content || "");
    setEditorError(null);
  };

  const handleValidateJson = () => {
    if (!activeNode || activeNode.type !== "file") return;
    try {
      validateJsonContentForNode(activeNode, activeFileContent);
      setEditorError(null);
      onAlert("Validate JSON", "JSON hợp lệ theo định dạng của file hiện tại.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setEditorError(message);
      onAlert("Validate JSON thất bại", message);
    }
  };

  // Save changes done in file editor textarea back to local/DB storage
  const handleSaveChanges = async () => {
    if (!activeFilePath) return;
    const node = findNodeByPath(vfsTree, activeFilePath);
    if (!node || node.type !== "file") return;

    setEditorError(null);
    try {
      if (node.dataType === "settings") {
        const parsed = JSON.parse(activeFileContent);
        // Basic validators
        if (typeof parsed !== "object") throw new Error("Cú pháp tệp cấu hình phải là một đối tượng JSON.");
        setSettings(parsed);
        await saveValue("settings", parsed);
        setPanelFeedback({ tone: "success", message: "Đã lưu file cấu hình hệ thống vào app." });
        onAlert("Cây thư mục", "Lưu cấu hình hệ thống hành trình đọc giả thành công!");
      } 
      else if (node.dataType === "dict") {
        const parsed = JSON.parse(activeFileContent);
        if (!Array.isArray(parsed)) throw new Error("Cú pháp từ điển cá nhân tuyệt đối phải là một danh sách JSON.");
        setDictItems(parsed);
        await saveValue("dictItems", parsed);
        setPanelFeedback({ tone: "success", message: "Đã lưu file từ điển riêng vào app." });
        onAlert("Cây thư mục", "Đã lưu thay đổi từ điển riêng chuẩn xác vào bộ lưu trữ.");
      } 
      else if (node.dataType === "pronouns") {
        const parsed = JSON.parse(activeFileContent);
        if (!Array.isArray(parsed)) throw new Error("Bảng ánh xạ đại xưng hô bắt buộc phải cấu hình ở dạng mảng JSON.");
        setPronounMappings(parsed);
        await saveValue("pronounMappings", parsed);
        setPanelFeedback({ tone: "success", message: "Đã lưu file bảng xưng hô vào app." });
        onAlert("Cây thư mục", "Lưu bảng nhân xưng văn học thành công.");
      } 
      else if (node.dataType === "novel") {
        const parsed = JSON.parse(activeFileContent);
        const targetId = node.meta?.novelId;
        
        const updated = novels.map((n) => {
          if (n.id === targetId) {
            return {
              ...n,
              title: parsed.title || n.title,
              author: parsed.author || n.author,
              sourceUrl: parsed.sourceUrl || n.sourceUrl,
              lastReadChapterId: parsed.lastReadChapterId || n.lastReadChapterId,
              lastReadPageIndex: parsed.lastReadPageIndex ?? n.lastReadPageIndex,
              lastReadMode: parsed.lastReadMode || n.lastReadMode,
              lastReadPercentage: parsed.lastReadPercentage || n.lastReadPercentage,
            };
          }
          return n;
        });

        setNovels(updated);
        await saveValue("novels", updated);
        setPanelFeedback({ tone: "success", message: "Đã lưu metadata truyện." });
        onAlert("Cây thư mục", "Lưu thay đổi metadata tác phẩm hoàn tất!");
      } 
      else if (node.dataType === "chapter_src") {
        const targetNovelId = node.meta?.novelId;
        const targetChapId = node.meta?.chapterId;

        const updated = novels.map((n) => {
          if (n.id === targetNovelId) {
            const upChaps = n.chapters.map((ch) => 
              ch.id === targetChapId ? { ...ch, sourceText: activeFileContent, charCount: activeFileContent.length } : ch
            );
            return { ...n, chapters: upChaps };
          }
          return n;
        });

        setNovels(updated);
        await saveValue("novels", updated);
        setPanelFeedback({ tone: "success", message: "Đã lưu chương Hán văn gốc." });
        onAlert("Cây thư mục", "Cập nhật Hán văn gốc của chương thành công!");
      } 
      else if (node.dataType === "chapter_trans") {
        const targetNovelId = node.meta?.novelId;
        const targetChapId = node.meta?.chapterId;

        const updated = novels.map((n) => {
          if (n.id === targetNovelId) {
            const upChaps = n.chapters.map((ch) => 
              ch.id === targetChapId ? { ...ch, translatedText: activeFileContent } : ch
            );
            return { ...n, chapters: upChaps };
          }
          return n;
        });

        setNovels(updated);
        await saveValue("novels", updated);
        
        // Clear caches individually if updated
        await deleteValue(`page_trans_${targetChapId}`);
        loadIndexedDBExtra();

        setPanelFeedback({ tone: "success", message: "Đã lưu chương dịch và làm mới cache trang liên quan." });
        onAlert("Cây thư mục", "Lưu bản dịch hoàn thiện chương và hủy các mảnh cache trang thành công!");
      } 
      else if (node.dataType === "page_trans") {
        const targetChapId = node.meta?.chapterId;
        const pIdx = node.meta?.pageIndex;

        if (targetChapId && pIdx !== undefined) {
          const currentPages = pageTranslations[targetChapId] || [];
          const updatedPages = [...currentPages];
          updatedPages[pIdx] = activeFileContent;

          await saveValue(`page_trans_${targetChapId}`, updatedPages);
          loadIndexedDBExtra();
          setPanelFeedback({ tone: "success", message: `Đã lưu trang dịch ${pIdx + 1} của chương hiện tại.` });
          onAlert("Cây thư mục", `Cập nhật nội dung dịch thuật trang lẻ (${pIdx + 1}) thành công!`);
        }
      } else {
        throw new Error("Không thể thao tác ghi đè trực tiếp lên tệp hệ thống này.");
      }
    } catch (err: any) {
      setPanelFeedback({ tone: "danger", message: err.message || "Lỗi ghi dữ liệu. Kiểm tra lại định dạng file." });
      setEditorError(err.message || "Định dạng JSON hỏng hoặc gặp lỗi ghi luồng tệp.");
    }
  };

  // Copy text content of selected file to clipboard
  const handleCopyContent = () => {
    navigator.clipboard.writeText(activeFileContent);
    onAlert("Sao chép", "Đã sao chép nội dung tệp tin vào bộ nhớ đệm!");
  };

  // Helper to save file via modern File System Access API if supported (allows user folder selection on PC)
  const handleDownloadWithPicker = async (fileName: string, content: string): Promise<boolean> => {
    const nativeResult = await saveBlobWithNativeFallback(
      new Blob([content], { type: "text/plain;charset=utf-8" }),
      fileName,
      "text/plain"
    );
    if (nativeResult.saved || nativeResult.cancelled) {
      if (nativeResult.saved) {
        try {
          setExportedFiles(await listExportedFiles());
        } catch {
          // ignore registry refresh failure
        }
        onAlert(
          "Lưu thành công",
          `Đã lưu tệp "${fileName}".\n${
            nativeResult.uri ? `URI: ${nativeResult.uri}\n` : ""
          }Dung lượng ghi: ${nativeResult.bytesWritten ?? content.length} bytes`
        );
        setPanelFeedback({ tone: "success", message: `Đã lưu file "${fileName}" thành công.` });
      }
      return true;
    }
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [{
            description: "Tệp cấu hình hệ thống (.txt)",
            accept: {
              "text/plain": [".txt", ".json"]
            }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        onAlert("Lưu thành công", `Đã lưu tệp "${fileName}" trực tiếp vào thư mục tự chọn!`);
        setPanelFeedback({ tone: "success", message: `Đã lưu file "${fileName}" qua picker trình duyệt.` });
        return true;
      } catch (err: any) {
        if (err.name === "AbortError") {
          return true; // Decisive halt, user canceled manually
        }
        console.warn("showSaveFilePicker failed, trying normal download fallback", err);
      }
    }
    return false;
  };

  const handleDownloadBlobWithPicker = async (blob: Blob, suggestedName: string): Promise<boolean> => {
    const nativeResult = await saveBlobWithNativeFallback(
      blob,
      suggestedName,
      "application/zip"
    );
    if (nativeResult.saved || nativeResult.cancelled) {
      if (nativeResult.saved) {
        try {
          setExportedFiles(await listExportedFiles());
        } catch {
          // ignore registry refresh failure
        }
        onAlert(
          "Kết xuất thành công",
          `Đã lưu bản sao lưu .ZIP.\n${
            nativeResult.uri ? `URI: ${nativeResult.uri}\n` : ""
          }Dung lượng ghi: ${nativeResult.bytesWritten ?? blob.size} bytes`
        );
        setPanelFeedback({ tone: "success", message: `Đã lưu ZIP "${suggestedName}" thành công.` });
      }
      return true;
    }
    if (typeof window !== "undefined" && "showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName,
          types: [{
            description: "Tệp bản sao lưu nén (.zip)",
            accept: {
              "application/zip": [".zip"]
          }
        }]
      });
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      onAlert("Kết xuất thành công", "Đã lưu bản sao lưu .ZIP trực tiếp vào thư mục tùy chọn của bạn!");
      setPanelFeedback({ tone: "success", message: `Đã lưu ZIP "${suggestedName}" qua picker trình duyệt.` });
      return true;
    } catch (err: any) {
      if (err.name === "AbortError") {
        return true; // Decisive halt, user canceled manually
      }
      console.warn("showSaveFilePicker for blob failed, trying fallback", err);
    }
  }
  return false;
};

  // Download single file dynamically (Auto fallback Hybrid Picker)
  const handleDownloadFile = async (fileName: string, content: string) => {
    const success = await handleDownloadWithPicker(fileName, content);
    if (success) return;
    setPanelFeedback({ tone: "warning", message: `Không thể lưu tệp "${fileName}" trên thiết bị.` });
    onAlert("Không lưu được", `Không thể lưu tệp "${fileName}" trên thiết bị.`);
  };

  // Snapshot toàn bộ dữ liệu app (trừ các bản backup cũ) vào luu_tru/backups/
  const handleCreateVFSBackupSpec = async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const fileName = `novel_backup_${timestamp}.json`;
    const backupKey = `vfs_backup_${timestamp}`;
    
    setIsLoading(true);
    setPanelFeedback({ tone: "info", message: "Đang tạo snapshot trong máy..." });
    try {
      const db = await dbPromise;
      const allRecords = await db.getAll("settings");
      
      // Filter out other backup entries to take snap of real data only
      const snap = allRecords.filter((r) => !r.id.startsWith("vfs_backup_"));
      await saveValue(backupKey, snap);
      await loadIndexedDBExtra();
      
      setNewBackupAlert({ fileName, backupKey });
      setPanelFeedback({ tone: "success", message: `Đã tạo snapshot "${fileName}".` });
      onAlert("Sao lưu", `Đã tự động tạo tệp sao lưu: ${fileName} trong thư mục /backups/!`);
    } catch (err: any) {
      setPanelFeedback({ tone: "danger", message: err.message || "Lỗi tạo snapshot trong máy." });
      alert("Lỗi sao lưu hệ thống: " + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Open backup folder and highlight the newly selected file
  const handleOpenBackupFolder = (fileName: string) => {
    if (!confirmDiscardUnsavedChanges("mở file backup")) return;
    setViewMode("fileEditor");
    setExpandedNodes((prev) => ({
      ...prev,
      "luu_tru": true,
      "luu_tru/backups": true
    }));
    setActiveFilePath(`luu_tru/backups/${fileName}`);
    setNewBackupAlert(null); // Close banner once opened
    
    // Find file content dynamically to load into active editor
    setTimeout(() => {
      const currentTree = buildVFSTree();
      const node = findNodeByPath(currentTree, `luu_tru/backups/${fileName}`);
      if (node) {
        setActiveFileContent(node.content || "");
      }
    }, 100);
  };

  // Delete manual backup point
  const handleDeleteBackup = async (backupKey: string) => {
    if (confirm("Bạn có chắc chắn muốn xóa vĩnh viễn bản sao lưu nhanh này không?")) {
      await deleteValue(backupKey);
      loadIndexedDBExtra();
      setPanelFeedback({ tone: "success", message: "Đã xóa snapshot khỏi máy." });
      onAlert("Bản sao lưu", "Đã xóa bản sao lưu thành công.");
    }
  };

  const handleDeleteExportedFile = async (entry: ExportedFileEntry) => {
    if (!confirm(`Xóa file đã xuất "${entry.fileName}" khỏi máy?\n\nThao tác này sẽ xóa file vật lý theo URI đã lưu.`)) {
      return;
    }
    setIsDeletingExportedFile(entry.id);
    try {
      const deleted = await deleteNativeExportedFile(entry.uri);
      if (!deleted) {
        setPanelFeedback({
          tone: "warning",
          message: "Không thể xóa file vật lý. Có thể file đã bị di chuyển/xóa thủ công hoặc URI hết quyền.",
        });
        onAlert(
          "Không xóa được file",
          "Không thể xóa file vật lý. Có thể URI đã hết quyền hoặc file đã bị di chuyển/xóa thủ công."
        );
        return;
      }
      const updated = await removeExportedFileById(entry.id);
      setExportedFiles(updated);
      setPanelFeedback({ tone: "success", message: `Đã xóa file vật lý "${entry.fileName}" và cập nhật danh sách.` });
      onAlert("Đã xóa file", `Đã xóa "${entry.fileName}" khỏi thiết bị.`);
    } catch (err: unknown) {
      setPanelFeedback({ tone: "danger", message: err instanceof Error ? err.message : String(err) });
      onAlert("Lỗi xóa file", err instanceof Error ? err.message : String(err));
    } finally {
      setIsDeletingExportedFile(null);
    }
  };

  const handleRemoveExportedFileFromList = async (entry: ExportedFileEntry) => {
    if (!confirm(`Gỡ "${entry.fileName}" khỏi danh sách theo dõi?\n\nThao tác này KHÔNG xóa file vật lý trên máy.`)) {
      return;
    }
    try {
      const updated = await removeExportedFileById(entry.id);
      setExportedFiles(updated);
      setPanelFeedback({ tone: "success", message: `Đã gỡ "${entry.fileName}" khỏi danh sách theo dõi.` });
      onAlert("Đã gỡ khỏi danh sách", `"${entry.fileName}" đã được gỡ khỏi danh sách theo dõi.`);
    } catch (err: unknown) {
      setPanelFeedback({ tone: "danger", message: err instanceof Error ? err.message : String(err) });
      onAlert("Lỗi thao tác", err instanceof Error ? err.message : String(err));
    }
  };

  // Restore state from a backup point
  const handleRestoreBackup = async (backupKey: string, backupVal: any[]) => {
    if (confirm("Cảnh báo: Hành động này sẽ thay thế toàn bộ dữ liệu hiện tại bằng bản sao lưu đã chọn và tải lại ứng dụng. Bạn có muốn tiếp tục?")) {
      const db = await dbPromise;
      
      // Clear previous
      const keys = await db.getAllKeys("settings");
      for (const k of keys) {
        if (!k.toString().startsWith("vfs_backup_")) {
          await db.delete("settings", k);
        }
      }

      // Load backup data
      for (const item of backupVal) {
        await saveValue(item.id, item.value);
      }

      onAlert("Khôi phục thành công", "Hệ thống đang tải lại trang để nạp toàn vẹn cấu trúc...");
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    }
  };

  // Build recursive JSZip entries helper
  const addNodeToZip = (zip: JSZip, node: VFSNode) => {
    if (node.type === "file") {
      zip.file(node.name, node.content || "");
    } else if (node.type === "folder") {
      const folderZip = zip.folder(node.name);
      if (node.children && folderZip) {
        node.children.forEach((child) => addNodeToZip(folderZip, child));
      }
    }
  };

  const translatedChapterTotal = countTranslatedChapters(
    collectTranslationBackupNovels(novels)
  );

  const handleExportTranslationBackup = async () => {
    setIsExportingTranslation(true);
    setPanelFeedback({ tone: "info", message: "Đang đóng gói data dịch..." });
    try {
      const { blob, manifest, fileName } = await buildTranslationBackupZip(novels);
      const picked = await downloadBlobWithFallback(blob, fileName, (debugMessage) => {
        onAlert("Kết quả lưu file", debugMessage);
      });
      if (!picked) return;
      onAlert(
        "Sao lưu data dịch",
        `Đã xuất ${manifest.novelCount} truyện · ${manifest.chapterCount} chương đã dịch Lab (không gồm cấu hình).`
      );
      setPanelFeedback({
        tone: "success",
        message: `Đã lưu data dịch: ${manifest.novelCount} truyện · ${manifest.chapterCount} chương.`,
      });
    } catch (err: unknown) {
      setPanelFeedback({
        tone: "danger",
        message: err instanceof Error ? err.message : String(err),
      });
      onAlert(
        "Không xuất được",
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setIsExportingTranslation(false);
    }
  };

  const handleImportTranslationBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsImportingTranslation(true);
    setPanelFeedback({ tone: "info", message: `Đang nạp data dịch từ "${file.name}"...` });
    try {
      await onImportTranslationBackup(file);
      setPanelFeedback({ tone: "success", message: `Đã nạp xong data dịch từ "${file.name}".` });
    } catch (err: unknown) {
      setPanelFeedback({ tone: "danger", message: err instanceof Error ? err.message : String(err) });
      onAlert("Không nạp được data dịch", err instanceof Error ? err.message : String(err));
    } finally {
      setIsImportingTranslation(false);
      if (e.target) e.target.value = "";
    }
  };

  // Export lightweight system backup ZIP (without heavy books/backups payload)
  const handleExportFullZIP = async () => {
    setIsExporting(true);
    setPanelFeedback({ tone: "info", message: "Đang đóng gói ZIP cấu hình nhẹ..." });
    try {
      const zip = new JSZip();
      zip.file("settings/cau_hinh_he_thong.json", JSON.stringify(settings, null, 2));
      zip.file("dictionaries/tu_dien_rieng.json", JSON.stringify(dictItems, null, 2));
      zip.file("dictionaries/tu_dien_nhan_xung.json", JSON.stringify(pronounMappings, null, 2));

      const novelsMeta = novels.map((n) => ({
        id: n.id,
        title: n.title,
        author: n.author,
        chapterCount: n.chapters.length,
        translatedCount: n.chapters.filter((c) => !!c.translatedText?.trim()).length,
        lastReadChapterId: n.lastReadChapterId,
        lastReadMode: n.lastReadMode,
        lastReadPageIndex: n.lastReadPageIndex,
        updatedAt: new Date().toISOString(),
      }));
      zip.file("settings/novels_meta_light.json", JSON.stringify(novelsMeta, null, 2));

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const suggestedName = `cau_hinh_he_thong_nhe_${new Date().toISOString().slice(0, 10)}.zip`;

      const success = await handleDownloadBlobWithPicker(zipBlob, suggestedName);
      if (!success) {
        setPanelFeedback({ tone: "warning", message: "Không thể lưu ZIP cấu hình nhẹ trên thiết bị hiện tại." });
        onAlert("Không lưu được", "Không thể lưu ZIP cấu hình nhẹ.");
      }
    } catch (err: any) {
      setPanelFeedback({ tone: "danger", message: err.message || "Lỗi nén ZIP cấu hình." });
      alert("Lỗi nén thư mục: " + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  // Import / restore everything from uploaded zip structure
  const handleImportFullZIP = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reject non-ZIP choices if picked by accident on mobile
    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith(".zip")) {
      if (onAlert) {
        onAlert(
          "Quy cách sao lưu không đúng",
          "Vui lòng chọn một tệp bản sao lưu nén định dạng .zip hợp lệ được tải xuống từ phần mềm."
        );
      } else {
        alert("Vui lòng chọn một tệp bản sao lưu nén định dạng .zip hợp lệ được tải xuống từ phần mềm.");
      }
      e.target.value = "";
      return;
    }

    setIsImporting(true);
    setPanelFeedback({ tone: "info", message: `Đang đọc file ZIP "${file.name}"...` });
    try {
      const zip = new JSZip();
      const contents = await zip.loadAsync(file);
      const zipPaths = Object.keys(contents.files);

      if (isTranslationBackupZipPath(zipPaths) && !isFullVfsZipPath(zipPaths)) {
        onAlert(
          "Sai loại file ZIP",
          "Đây là file «data dịch» (translation_data). Hãy dùng mục «Nạp data dịch» bên dưới — không dùng «Nạp file ZIP» đầy đủ."
        );
        setPanelFeedback({
          tone: "warning",
          message: "Bạn đang chọn nhầm loại ZIP. Hãy dùng mục «Nạp data dịch» cho translation_data.",
        });
        return;
      }

      let parsedSettings: TranslationSettings | null = null;
      let parsedDict: DictItem[] = [];
      let parsedPronouns: PronounMapping[] = [];
      const novelsMap: Record<string, Novel> = {};
      const pagesMap: Record<string, string[]> = {};

      // Analyze zip paths
      for (const [relPath, zipEntry] of Object.entries(contents.files)) {
        if (zipEntry.dir) continue;

        const pParts = relPath.replace(/\/$/, "").split("/");
        
        // 1. Settings
        if (pParts[0] === "settings" && pParts[1] === "cau_hinh_he_thong.json") {
          const txt = await zipEntry.async("string");
          parsedSettings = JSON.parse(txt);
        }
        // 2. Dictionaries
        else if (pParts[0] === "dictionaries") {
          if (pParts[1] === "tu_dien_rieng.json") {
            const txt = await zipEntry.async("string");
            parsedDict = JSON.parse(txt);
          } else if (pParts[1] === "tu_dien_nhan_xung.json") {
            const txt = await zipEntry.async("string");
            parsedPronouns = JSON.parse(txt);
          }
        }
        // 3. Books
        else if (pParts[0] === "books" && pParts.length >= 3) {
          const bookFolder = pParts[1];
          const fileName = pParts[pParts.length - 1];

          // Reconstruct book meta if found
          if (fileName === "meta.json") {
            const txt = await zipEntry.async("string");
            const meta = JSON.parse(txt);
            if (!novelsMap[meta.id]) {
              novelsMap[meta.id] = {
                id: meta.id,
                title: meta.title,
                author: meta.author,
                sourceUrl: meta.sourceUrl,
                createdAt: meta.createdAt,
                lastReadChapterId: meta.lastReadChapterId,
                lastReadPageIndex: meta.lastReadPageIndex,
                lastReadMode: meta.lastReadMode,
                lastReadPercentage: meta.lastReadPercentage,
                chapters: [],
              };
            } else {
              // Copy properties
              const ch = novelsMap[meta.id].chapters;
              novelsMap[meta.id] = { ...novelsMap[meta.id], ...meta, chapters: ch };
            }
          } 
          // Reconstruct chapter sources/translations
          else if (pParts[2] === "chapters") {
            const isPageCache = pParts.includes("pages_cache") || relPath.includes("_pages/");
            
            if (!isPageCache && fileName.endsWith(".txt")) {
              const txt = await zipEntry.async("string");
              
              // Find chapter index and type 
              const isTrung = fileName.endsWith("_trung.txt");
              
              // Deduce index and chapter title
              // e.g. chuong_1_tieu_de_trung.txt
              const rawName = fileName.replace(/_(trung|viet)\.txt$/, "");
              const match = rawName.match(/^chuong_(\d+)_/);
              const chIdx = match ? parseInt(match[1], 10) - 1 : 0;
              const guessedTitle = rawName.replace(/^chuong_\d+_/, "").replace(/_/g, " ");

              // We need to match chapters to a specific book id.
              // To do that, we look at the meta file we loaded, or wait. Let's make sure we map it by book folder.
              // Let's store temporary chapter properties linked by bookFolder name
              if (!novelsMap[bookFolder]) {
                novelsMap[bookFolder] = {
                  id: bookFolder, // default ID is slug
                  title: bookFolder.replace(/_[a-z0-0]{5}$/, "").replace(/_/g, " "),
                  author: "Tác gia",
                  createdAt: new Date().toISOString(),
                  chapters: [],
                };
              }

              let targetChap = novelsMap[bookFolder].chapters[chIdx];
              if (!targetChap) {
                targetChap = {
                  id: `chap_${bookFolder}_${chIdx}_${Math.random().toString(36).slice(2, 6)}`,
                  title: guessedTitle || `Chương ${chIdx + 1}`,
                  sourceText: "",
                  translatedText: "",
                  createdAt: new Date().toISOString(),
                  charCount: 0,
                  wordCount: 0,
                };
                novelsMap[bookFolder].chapters[chIdx] = targetChap;
              }

              if (isTrung) {
                targetChap.sourceText = txt;
                targetChap.charCount = txt.length;
              } else {
                targetChap.translatedText = txt;
              }
            } 
            // Reconstruct translated page caches
            else if (isPageCache && fileName.endsWith(".txt")) {
              const txt = await zipEntry.async("string");
              const pageMatch = fileName.match(/^trang_(\d+)\.txt$/);
              const pIdx = pageMatch ? parseInt(pageMatch[1], 10) - 1 : 0;

              // Find which chapter folder this belongs to
              // e.g. pages_cache_chuong_1_tieu_de
              const chapFolderNode = pParts[pParts.length - 2];
              const match = chapFolderNode.replace("pages_cache_", "").match(/^chuong_(\d+)_/);
              const chIdx = match ? parseInt(match[1], 10) - 1 : 0;

              if (novelsMap[bookFolder]) {
                const chap = novelsMap[bookFolder].chapters[chIdx];
                if (chap) {
                  if (!pagesMap[chap.id]) {
                    pagesMap[chap.id] = [];
                  }
                  pagesMap[chap.id][pIdx] = txt;
                }
              }
            }
          }
        }
      }

      if (confirm("Phát hiện thấy tập cấu trúc cây thư mục hợp lệ. Bạn có muốn nạp toàn bộ tệp tin dịch thuật này không? (Dữ liệu cũ cùng tên sẽ bị đồng bộ ghi đè).")) {
        const db = await dbPromise;

        // 1. Write settings
        if (parsedSettings) {
          setSettings(parsedSettings);
          await saveValue("settings", parsedSettings);
        }

        // 2. Custom dictionaries
        if (parsedDict.length > 0) {
          setDictItems((prev) => {
            const merged = [...parsedDict];
            prev.forEach((p) => {
              if (!merged.some((m) => m.chinese === p.chinese)) merged.push(p);
            });
            saveValue("dictItems", merged);
            return merged;
          });
        }

        // 3. Pronouns Mapping
        if (parsedPronouns.length > 0) {
          setPronounMappings((prev) => {
            const merged = [...parsedPronouns];
            prev.forEach((p) => {
              if (!merged.some((m) => m.chinese === p.chinese)) merged.push(p);
            });
            saveValue("pronounMappings", merged);
            return merged;
          });
        }

        // 4. Books and Chapters
        const novelsList = Object.values(novelsMap).filter((n) => n.chapters.length > 0);
        if (novelsList.length > 0) {
          setNovels((prev) => {
            const merged = [...prev];
            novelsList.forEach((novelRaw) => {
              // Ensure we filter out empty indices of chapters
              novelRaw.chapters = novelRaw.chapters.filter(Boolean);
              
              // Find if already exists, else push
              const foundIdx = merged.findIndex((m) => m.id === novelRaw.id || m.title === novelRaw.title);
              if (foundIdx !== -1) {
                merged[foundIdx] = novelRaw;
              } else {
                merged.push(novelRaw);
              }
            });
            saveValue("novels", merged);
            return merged;
          });
        }

        // 5. Page translations
        for (const [chapId, pageTexts] of Object.entries(pagesMap)) {
          const cleanedText = pageTexts.map(t => t || "");
          await saveValue(`page_trans_${chapId}`, cleanedText);
        }

        setPanelFeedback({ tone: "success", message: "Đã nạp dữ liệu từ ZIP và đồng bộ vào app." });
        onAlert("Đồng bộ hoàn tất", "Cây thư mục đã được nhập thành công! Đang đồng bộ giao diện...");
        loadIndexedDBExtra();
      }
    } catch (err: any) {
      setPanelFeedback({ tone: "danger", message: err.message || "Lỗi phân tích hoặc nạp ZIP." });
      alert("Lỗi phân tích tập tin ZIP thư mục: " + err.message);
    } finally {
      setIsImporting(false);
      if (e.target) e.target.value = "";
    }
  };

  // Render file tree recursively
  const filterTreeNodeByQuery = (node: VFSNode, query: string): VFSNode | null => {
    if (!query) return node;
    const selfMatch =
      node.name.toLowerCase().includes(query) ||
      node.path.toLowerCase().includes(query);
    if (node.type === "file") {
      return selfMatch ? node : null;
    }
    const filteredChildren = (node.children || [])
      .map((child) => filterTreeNodeByQuery(child, query))
      .filter((child): child is VFSNode => !!child);
    if (selfMatch || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  };

  const filteredTreeRoot = React.useMemo(() => {
    return filterTreeNodeByQuery(vfsTree, normalizedTreeSearchQuery);
  }, [vfsTree, normalizedTreeSearchQuery]);

  const isTreeSearching = normalizedTreeSearchQuery.length > 0;

  const renderTreeNodes = (node: VFSNode, depth = 0) => {
    const isFolder = node.type === "folder";
    const isExpanded = isTreeSearching ? true : expandedNodes[node.path];
    const isSelected = activeFilePath === node.path;

    return (
      <div key={node.path} style={{ paddingLeft: `${depth * 14}px` }} className="select-none leading-relaxed">
        <div
          onClick={() => {
            if (isFolder) {
              toggleNodeExpand(node.path);
            } else {
              handleSelectFile(node);
            }
          }}
          className={`flex items-center py-1.5 px-2 rounded-lg cursor-pointer hover:bg-app-surface-muted gap-2 transition-all ${
            isSelected ? "bg-app-accent/10 border-l-2 border-app-accent text-app-accent font-bold" : "text-app-text"
          }`}
        >
          {isFolder ? (
            <span className="shrink-0 text-app-text-muted">
              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </span>
          ) : (
            <span className="w-4 shrink-0" />
          )}

          <span className="shrink-0">
            {isFolder ? (
              isExpanded ? (
                <FolderOpen className="w-4 h-4 text-app-accent" />
              ) : (
                <Folder className="w-4 h-4 text-emerald-500" />
              )
            ) : node.name.endsWith(".json") ? (
              <FileJson className="w-4 h-4 text-sky-500" />
            ) : node.dataType === "chapter_src" ? (
              <FileCode className="w-4 h-4 text-purple-400" />
            ) : (
              <FileText className="w-4 h-4 text-app-text-muted" />
            )}
          </span>

          <span className="text-xs truncate flex-1" title={node.name}>
            {node.name}
          </span>
          
          {!isFolder && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownloadFile(node.name, node.content || "");
              }}
              className="p-1 opacity-0 hover:opacity-100 group-hover:opacity-100 text-app-text-muted hover:text-app-accent rounded-md transition-opacity"
              title="Tải tệp này xuống"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {isFolder && isExpanded && node.children && (
          <div className="mt-0.5 space-y-0.5">
            {node.children.map((child) => renderTreeNodes(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  const renderBackupHistoryList = (opts?: { embedded?: boolean }) => {
    const embedded = opts?.embedded;
    return (
    <div className={embedded ? "flex flex-col" : "flex flex-col min-h-[200px]"}>
      <div className="flex items-center gap-2 mb-2">
        <History className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
        <h3 className={`${uiLabel} normal-case`}>
          {embedded ? "Khôi phục bản đã lưu" : `Các bản đã lưu trong máy (${backupCount})`}
        </h3>
      </div>
      <p className={`${uiCaption} text-[10.5px] mb-3`}>
        {embedded ? (
          <>
            Sau khi «Tạo bản trong máy», chọn <strong>Khôi phục bản này</strong> bên dưới để quay app về đúng thời điểm đó (thay thế toàn bộ dữ liệu hiện tại).
          </>
        ) : (
          <>
            Mỗi bản là <strong>ảnh chụp toàn bộ app</strong> tại một thời điểm. Khôi phục sẽ <strong>thay thế</strong> dữ liệu hiện tại và tải lại trang.
          </>
        )}
      </p>

      {backupCount === 0 ? (
        <div
          className={`border-2 border-dashed border-emerald-500/25 dark:border-emerald-500/20 rounded-xl flex flex-col items-center justify-center text-center p-4 ${
            embedded ? "" : "flex-1"
          }`}
        >
          <HardDrive className="w-7 h-7 text-app-text-muted mb-2" />
          <p className={`${uiTitle} text-xs`}>Chưa có bản snapshot</p>
          <p className={`${uiCaption} text-[10px] mt-1 max-w-[280px]`}>
            Bấm nút <strong>Tạo bản trong máy</strong> ngay phía trên.
          </p>
        </div>
      ) : (
        <div
          className={`${uiCardInset} rounded-xl overflow-hidden flex flex-col ${
            embedded ? "max-h-[min(42vh,320px)]" : "flex-1 min-h-0"
          }`}
        >
          <div className="overflow-y-auto custom-scrollbar divide-y divide-app-border flex-1 min-h-0">
            {Object.entries(backupFiles)
              .sort((a, b) => b[0].localeCompare(a[0]))
              .map(([backupKey, backupVal]) => {
                const rawName = backupKey.replace("vfs_backup_", "");
                const systemFileName = `novel_backup_${rawName}.json`;
                const formattedTime = rawName
                  .replace(/(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/, "$3/$2/$1 $4:$5:$6")
                  .replace(/(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(\d{2})/, "$3/$2/$1 $4:$5:$6")
                  .replace(/_/g, " ");

                return (
                  <div
                    key={backupKey}
                    className="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-2 hover:bg-app-surface-muted/60"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-[11px] font-bold text-app-text truncate">
                        {systemFileName}
                      </p>
                      <p className={`${uiCaption} text-[10px] mt-0.5`}>Thời điểm: {formattedTime}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenBackupFolder(systemFileName)}
                        className={`${uiBtnGhost} h-8 px-2.5 text-[10px] font-bold`}
                      >
                        Xem
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteBackup(backupKey)}
                        className={`${uiBtnGhost} h-8 w-8 min-w-8 p-0 text-red-500 border-red-500/20 hover:bg-red-500/10`}
                        title="Xóa bản này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRestoreBackup(backupKey, backupVal as any[])}
                        className={`${uiBtnPrimary} h-8 px-2.5 text-[10px] font-bold whitespace-nowrap`}
                      >
                        Khôi phục bản này
                      </button>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
    );
  };

  const renderExportedFilesList = () => {
    return (
      <div className={`${uiCardInset} p-4 flex flex-col gap-3 shrink-0`}>
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded-full bg-app-text text-app-surface text-xs font-semibold flex items-center justify-center">
            4
          </span>
          <h3 className={`${uiTitle} text-xs`}>Quản lý file đã xuất</h3>
        </div>
        <p className={`${uiCaption} text-[10.5px]`}>
          Danh sách này theo dõi các file đã lưu qua bộ lưu native (SAF). Bạn có thể xóa trực tiếp file vật lý từ đây.
        </p>
        {exportedFiles.length === 0 ? (
          <div className="border border-dashed border-app-border rounded-xl p-3">
            <p className={`${uiCaption} text-[10px]`}>
              Chưa có file nào được ghi nhận. Hãy export một file mới để bắt đầu quản lý.
            </p>
          </div>
        ) : (
          <div className="max-h-[260px] overflow-y-auto custom-scrollbar divide-y divide-app-border rounded-xl border border-app-border">
            {exportedFiles.map((entry) => {
              const deleting = isDeletingExportedFile === entry.id;
              return (
                <div key={entry.id} className="px-3 py-2.5 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[11px] font-bold text-app-text truncate">{entry.fileName}</p>
                    <p className={`${uiCaption} text-[10px] mt-0.5 truncate`}>
                      {formatBytes(entry.bytesWritten)} · {formatSavedAt(entry.savedAt)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRemoveExportedFileFromList(entry)}
                    disabled={deleting}
                    className={`${uiBtnGhost} h-8 px-2.5 text-[10px] font-bold`}
                    title="Gỡ khỏi danh sách"
                  >
                    Gỡ
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeleteExportedFile(entry)}
                    disabled={deleting}
                    className={`${uiBtnGhost} h-8 px-2.5 text-[10px] font-bold text-red-500 border-red-500/20 hover:bg-red-500/10`}
                    title="Xóa file vật lý"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    {deleting ? "Đang xóa…" : "Xóa"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={`flex flex-col gap-4 animate-fade-up-soft ${isFileEditorMode ? "h-[calc(100vh-140px)] min-h-[500px]" : ""}`}>
      <div className={`${uiSection} shrink-0 rounded-xl bg-gradient-to-r from-app-surface to-app-surface-muted/70 border border-app-border`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className={uiIconHeader}>
              <FolderTree className="w-5 h-5 text-app-accent" />
            </div>
            <div className="min-w-0">
              <h2 className={uiTitle}>Sao lưu và khôi phục</h2>
            </div>
          </div>
          {isFileEditorMode ? (
            <button
              type="button"
              onClick={() => {
                if (!confirmDiscardUnsavedChanges("quay lại màn sao lưu")) return;
                setViewMode("backup");
                setActiveFilePath(null);
                setEditorError(null);
              }}
              className={`${uiBtnGhost} h-9 px-3 text-[11px] font-bold shrink-0`}
            >
              <ArrowLeft className="w-4 h-4" />
              Quay lại
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setViewMode("fileEditor")}
              className={`${uiBtnSecondary} h-9 px-3 text-[11px] font-bold shrink-0`}
            >
              <FolderTree className="w-4 h-4" />
              Xem & Sửa Từng File
            </button>
          )}
        </div>
        <p className={`${uiCaption} mt-2`}>
          Bốn cách làm việc: <strong>snapshot trong máy</strong>, <strong>data dịch (khuyến nghị)</strong>, <strong>ZIP đầy đủ</strong>, <strong>nạp ZIP</strong>. Data dịch không gồm cấu hình — an toàn sau cài lại app.
        </p>
      </div>

      {newBackupAlert && (
        <div className={uiInfoBanner}>
          <p className={`${uiCaption} text-xs flex-1`}>
            Đã tạo bản: <span className="font-mono font-bold text-app-text">{newBackupAlert.fileName}</span>
          </p>
          <button
            type="button"
            onClick={() => handleOpenBackupFolder(newBackupAlert.fileName)}
            className={`${uiBtnPrimary} h-8 px-3 text-[11px] font-bold shrink-0`}
          >
            Xem trong cây thư mục
          </button>
        </div>
      )}

      {panelFeedback && panelFeedbackClassName ? (
        <div className={panelFeedbackClassName}>
          {panelFeedback.message}
        </div>
      ) : null}

      {isFileEditorMode ? (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-0 overflow-hidden">
          <div className={`lg:col-span-4 ${uiPanel} min-h-[280px] lg:min-h-0 order-2 lg:order-1`}>
            <div className="shrink-0 mb-3">
              <div className="flex items-center justify-between gap-2">
                <span className={uiLabel}>Xem & sửa từng file</span>
                <button
                  type="button"
                  onClick={loadIndexedDBExtra}
                  className="text-[10px] font-bold text-app-accent hover:opacity-90 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
                  Làm mới
                </button>
              </div>
              <p className={`${uiCaption} text-[10px] mt-1`}>
                Dành cho người quen file: bấm tên file → sửa bên phải → «Lưu vào app». Icon ↓ = tải một file.
              </p>
            </div>

            <div className="shrink-0 mb-2 flex items-center gap-2">
              <input
                value={treeSearchQuery}
                onChange={(e) => setTreeSearchQuery(e.target.value)}
                placeholder="Tìm nhanh theo tên file/thư mục..."
                className={`${uiInput} h-8 text-[11px] flex-1`}
              />
              {treeSearchQuery.trim() ? (
                <button
                  type="button"
                  onClick={() => setTreeSearchQuery("")}
                  className={`${uiBtnGhost} h-8 px-2 text-[10px] font-bold`}
                >
                  Xóa
                </button>
              ) : null}
            </div>

            <details className={`shrink-0 mb-2 ${uiCaption} text-[10px]`}>
              <summary className="cursor-pointer font-bold text-app-text select-none">Ý nghĩa từng thư mục</summary>
              <ul className="mt-1.5 space-y-0.5 pl-3 list-disc leading-relaxed">
                <li><code className="text-[9px]">settings/</code> — Cấu hình app</li>
                <li><code className="text-[9px]">dictionaries/</code> — Từ điển & xưng hô</li>
                <li><code className="text-[9px]">books/</code> — Truyện, chương Hán/Việt, trang đọc</li>
                <li><code className="text-[9px]">backups/</code> — Snapshot đã tạo</li>
              </ul>
            </details>

            <div className="flex-1 overflow-y-auto custom-scrollbar pr-1 space-y-0.5 min-h-0">
              {filteredTreeRoot ? (
                renderTreeNodes(filteredTreeRoot)
              ) : (
                <div className={`${uiCaption} text-[10.5px] py-2`}>
                  Không tìm thấy mục phù hợp với từ khóa hiện tại.
                </div>
              )}
            </div>
          </div>

          <div className={`lg:col-span-8 ${uiPanel} md:p-5 order-1 lg:order-2`}>
            {activeFilePath ? (
              <div className="flex flex-col h-full min-h-0">
                <div className="flex items-center justify-between gap-3 border-b border-app-border pb-3 mb-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      if (!confirmDiscardUnsavedChanges("bỏ chọn file hiện tại")) return;
                      setActiveFilePath(null);
                      setEditorError(null);
                    }}
                    className={`${uiBtnGhost} h-9 px-2.5 text-[11px] font-bold shrink-0`}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Chọn file khác
                  </button>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyContent}
                      className={`${uiBtnGhost} p-2 min-h-0 min-w-0`}
                      title="Sao chép"
                    >
                      <Copy className="w-4 h-4 text-app-text-muted" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const name = activeFilePath.split("/").pop() || "source.txt";
                        handleDownloadFile(name, activeFileContent);
                      }}
                      className={`${uiBtnGhost} p-2 min-h-0 min-w-0`}
                      title="Tải file này"
                    >
                      <Download className="w-4 h-4 text-app-text-muted" />
                    </button>
                    {isJsonValidationEnabled && (
                      <button
                        type="button"
                        onClick={handleValidateJson}
                        className={`${uiBtnGhost} h-9 px-2.5 text-[10px] font-bold`}
                        title="Kiểm tra JSON"
                      >
                        Validate JSON
                      </button>
                    )}
                    {activeNode?.dataType !== "backup" && (
                      <button
                        type="button"
                        onClick={handleSaveChanges}
                        className={`${uiBtnPrimary} h-9 px-3 text-xs font-bold`}
                      >
                        <Save className="w-3.5 h-3.5" />
                        Lưu vào app
                      </button>
                    )}
                  </div>
                </div>

                <div className={`${uiInfoBanner} mb-3 p-2.5 shrink-0 border-sky-500/20 bg-sky-500/8`}>
                  <div className="mb-1 w-full flex items-center gap-2 min-w-0">
                    <p className="text-[10px] font-mono text-app-accent truncate flex-1 min-w-0">{activeFilePath}</p>
                    {hasUnsavedChanges ? (
                      <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/12 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                        Chưa lưu
                      </span>
                    ) : null}
                  </div>
                  <p className={`${uiCaption} text-[10.5px] flex gap-1.5 text-app-text`}>
                    <HelpCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-sky-500" />
                    {getFileTypeHint(activeNode)}
                  </p>
                </div>

                {activeFilePath.includes("/backups/") && (
                  <div className={`${uiInfoBanner} mb-3 shrink-0 space-y-2 flex-col items-stretch`}>
                    <p className={`${uiCaption} text-[10.5px] flex gap-2 text-app-text`}>
                      <AlertTriangle className="w-4 h-4 text-app-accent shrink-0" />
                      File snapshot — không sửa tay. Khôi phục cũng có trong <strong>mục 1</strong> (danh sách bản đã lưu).
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const node = findNodeByPath(vfsTree, activeFilePath);
                          if (node?.meta?.backupKey) {
                            handleDeleteBackup(node.meta.backupKey);
                            setActiveFilePath(null);
                          }
                        }}
                        className={`${uiBtnGhost} h-8 px-3 text-red-600 font-bold text-[10px] border-red-500/25`}
                      >
                        Xóa bản
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const node = findNodeByPath(vfsTree, activeFilePath);
                          if (node?.meta?.backupKey) {
                            try {
                              const parsed = JSON.parse(activeFileContent);
                              handleRestoreBackup(node.meta.backupKey, parsed);
                            } catch (err: unknown) {
                              alert("File backup lỗi: " + (err instanceof Error ? err.message : String(err)));
                            }
                          }
                        }}
                        className={`${uiBtnPrimary} h-8 px-3 text-[10px] font-bold`}
                      >
                        Khôi phục bản này
                      </button>
                    </div>
                  </div>
                )}

                {editorError && (
                  <div className="mb-3.5 p-2.5 bg-red-500/10 border border-red-600/20 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold leading-normal shrink-0">
                    {editorError}
                  </div>
                )}

                <div className="flex-1 relative min-h-0 bg-app-text/95 rounded-lg border border-app-border p-4.5 overflow-hidden flex flex-col">
                  <textarea
                    value={activeFileContent}
                    onChange={(e) => {
                      setActiveFileContent(e.target.value);
                      setEditorError(null);
                    }}
                    className="w-full flex-1 bg-transparent border-none text-app-bg font-mono text-[11px] leading-relaxed resize-none focus:outline-none focus:ring-0 custom-scrollbar overflow-y-auto"
                    placeholder="Ghi nội dung hoặc mã cấu trúc văn bản tại đây..."
                    spellCheck={false}
                  />
                </div>

                <div className="mt-2 text-right shrink-0">
                  <span className={`${uiCaption} text-[9px] font-bold font-serif lowercase`}>
                    quy mô tệp: {activeFileContent.length} ký tự
                  </span>
                </div>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center text-center">
                <div className="max-w-md">
                  <p className={uiTitle}>Xem & Sửa Từng File</p>
                  <p className={`${uiCaption} mt-2 text-[11px]`}>
                    Chọn một file ở cột trái để xem/sửa dữ liệu nâng cao. Khi xong có thể bấm «Quay lại» để trở về màn Sao lưu & Khôi phục.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className={`${uiPanel} md:p-5`}>
          <div className="flex flex-col gap-4">
            <div className={`${uiCard} border-2 border-app-accent/30 bg-app-accent/5 p-4 flex flex-col gap-3`}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-app-accent text-white text-xs font-semibold flex items-center justify-center shrink-0">1</span>
                <h3 className={`${uiTitle} text-xs`}>Lưu & khôi phục trong máy</h3>
              </div>
              <p className={`${uiCaption} text-[10.5px]`}>
                <strong>Mục đích:</strong> Điểm quay lại trên cùng thiết bị — trước cập nhật app hoặc dịch hàng loạt.
              </p>
              <details className={uiCaption}>
                <summary className="cursor-pointer font-bold text-app-accent">Gồm những gì?</summary>
                <ul className="mt-1 pl-3 list-disc space-y-0.5 leading-relaxed">
                  <li>Truyện & bản dịch chương</li>
                  <li>Dịch từng trang (Phòng Đọc)</li>
                  <li>Cấu hình, API key, từ điển</li>
                </ul>
              </details>
              <button
                type="button"
                onClick={handleCreateVFSBackupSpec}
                disabled={isLoading}
                className={`${uiBtnPrimary} w-full min-h-10 text-xs font-bold`}
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
                Tạo bản trong máy
              </button>
              <div className="border-t border-app-accent/20 pt-3 mt-1">
                {renderBackupHistoryList({ embedded: true })}
              </div>
            </div>

            <div className={`${uiCard} border-2 border-app-accent/35 bg-app-accent/8 p-4 flex flex-col gap-3`}>
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-app-accent text-white text-xs font-semibold flex items-center justify-center shrink-0">★</span>
                <h3 className={`${uiTitle} text-xs`}>Sao lưu / Nạp data dịch (an toàn)</h3>
              </div>
              <p className={`${uiCaption} text-[10.5px] leading-relaxed`}>
                <strong>Khuyến nghị sau cài lại app:</strong> chỉ truyện + chương đã dịch Lab — <strong>không</strong> gồm cấu hình, API, từ điển, cache phân trang.
              </p>
              <p className={uiCaption}>
                Hiện có <span className="font-bold text-app-text">{translatedChapterTotal}</span> chương đã dịch có thể sao lưu.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleExportTranslationBackup}
                  disabled={isExportingTranslation || translatedChapterTotal === 0}
                  className={`${uiBtnPrimary} w-full min-h-10 text-xs font-bold`}
                >
                  <Download className="w-4 h-4" />
                  {isExportingTranslation ? "Đang đóng gói…" : "Tải data dịch (.zip)"}
                </button>
                <label
                  className={`${uiBtnSecondary} w-full min-h-10 text-xs font-bold cursor-pointer justify-center ${
                    isImportingTranslation ? "opacity-60 pointer-events-none" : ""
                  }`}
                >
                  <Upload className="w-4 h-4" />
                  {isImportingTranslation ? "Đang nạp…" : "Nạp data dịch"}
                  <input
                    type="file"
                    accept={
                      typeof navigator !== "undefined" &&
                      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                        ? "*/*"
                        : ".zip"
                    }
                    className="hidden"
                    onChange={handleImportTranslationBackupFile}
                    disabled={isImportingTranslation}
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className={`${uiCard} border-app-accent/35 bg-app-accent/5 p-4 flex flex-col gap-3`}>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-app-accent text-white text-xs font-semibold flex items-center justify-center">2</span>
                  <h3 className={`${uiTitle} text-xs`}>Tải ZIP cấu hình nhẹ</h3>
                </div>
                <p className={`${uiCaption} text-[10.5px] flex-1`}>
                  <strong>Mục đích:</strong> Backup nhanh cấu hình hệ thống + từ điển để di chuyển giữa thiết bị.
                </p>
                <p className={uiCaption}>
                  Bao gồm <strong>settings + từ điển + metadata truyện nhẹ</strong>. Không gồm dữ liệu chương/caches nặng.
                </p>
                <button
                  type="button"
                  onClick={handleExportFullZIP}
                  disabled={isExporting}
                  className={`${uiBtnPrimary} w-full min-h-10 text-xs font-bold`}
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? "Đang đóng gói…" : "Tải ZIP cấu hình"}
                </button>
              </div>

              <div className={`${uiCardInset} p-4 flex flex-col gap-3`}>
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-app-text text-app-surface text-xs font-semibold flex items-center justify-center">3</span>
                  <h3 className={`${uiTitle} text-xs`}>Nạp file ZIP</h3>
                </div>
                <p className={`${uiCaption} text-[10.5px] flex-1`}>
                  <strong>Mục đích:</strong> Đưa dữ liệu từ ZIP (do app này xuất) vào app hiện tại.
                </p>
                <p className={`${uiCaption} text-app-accent flex gap-1`}>
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />
                  Gộp thêm truyện/từ — không xóa sạch như «Khôi phục».
                </p>
                <label className={`${uiBtnSecondary} w-full min-h-10 text-xs font-bold cursor-pointer bg-app-text text-app-surface hover:opacity-90`}>
                  <Upload className="w-4 h-4" />
                  {isImporting ? "Đang nạp…" : "Chọn file ZIP"}
                  <input
                    type="file"
                    accept={
                      typeof navigator !== "undefined" &&
                      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
                        ? "*/*"
                        : ".zip"
                    }
                    className="hidden"
                    onChange={handleImportFullZIP}
                    disabled={isImporting}
                  />
                </label>
              </div>
            </div>

            {renderExportedFilesList()}

            <div className={`${uiCardInset} p-3 rounded-xl`}>
              <p className={`${uiCaption} text-[10.5px]`}>
                <strong className="text-app-text">So sánh nhanh:</strong> Quay app trên <em>cùng máy</em> → mục 1 («Tạo bản» + «Khôi phục bản này» trong khối accent). Mang sang máy khác → mục 2 rồi mục 3. Sửa từng file → bấm «Mở Xem & Sửa Từng File».
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
