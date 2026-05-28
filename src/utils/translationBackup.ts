import JSZip from "jszip";
import type { Chapter, Novel } from "../types";
import { saveBlobWithNativeFallback } from "./nativeFileSave";

/** Phiên bản schema backup data dịch (4A). Tăng khi đổi cấu trúc export/import. */
export const TRANSLATION_BACKUP_SCHEMA_VERSION = 1;

export const TRANSLATION_BACKUP_KIND = "translation-data" as const;

/** Thư mục gốc trong ZIP — tách khỏi cây VFS `luu_tru/`. */
export const TRANSLATION_BACKUP_ROOT = "translation_data";

const APP_VERSION = "0.0.0";

export type TranslationBackupManifest = {
  schemaVersion: number;
  kind: typeof TRANSLATION_BACKUP_KIND;
  exportedAt: string;
  appVersion: string;
  novelCount: number;
  chapterCount: number;
  /** novelId → đường dẫn tương đối trong ZIP */
  files: Record<string, string>;
};

/** `overwrite`: ghi đè chương trùng id (mặc định). `add_only`: chỉ thêm chương/truyện mới. */
export type TranslationBackupMergeMode = "overwrite" | "add_only";

export type TranslationBackupMergeOptions = {
  mode?: TranslationBackupMergeMode;
};

export type TranslationBackupMergeStats = {
  novelsAdded: number;
  novelsUpdated: number;
  chaptersAdded: number;
  chaptersUpdated: number;
  /** Chương trong backup trùng id — bỏ qua khi `add_only` */
  chaptersSkipped: number;
};

export type TranslationBackupParseResult = {
  manifest: TranslationBackupManifest;
  novels: Novel[];
};

export type TranslationBackupMergeResult = {
  novels: Novel[];
  stats: TranslationBackupMergeStats;
  /** Chương cần xóa cache page_trans sau khi ghi đè bản dịch */
  clearedPageCacheChapterIds: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickChapterForBackup(raw: unknown): Chapter | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id.trim()) return null;

  const translatedText = typeof raw.translatedText === "string" ? raw.translatedText : "";
  if (!translatedText.trim()) return null;

  const sourceText = typeof raw.sourceText === "string" ? raw.sourceText : "";
  const title = typeof raw.title === "string" && raw.title.trim() ? raw.title : "Chương";

  return {
    id: raw.id,
    title,
    sourceText,
    translatedTitle: typeof raw.translatedTitle === "string" ? raw.translatedTitle : undefined,
    translatedText,
    createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
    charCount:
      typeof raw.charCount === "number"
        ? raw.charCount
        : sourceText.length || translatedText.length,
    wordCount: typeof raw.wordCount === "number" ? raw.wordCount : 0,
    isCompleted: raw.isCompleted === true ? true : undefined,
  };
}

function pickNovelMetaForBackup(raw: Partial<Novel>, chapters: Chapter[]): Novel {
  return {
    id: raw.id!,
    title: raw.title?.trim() || "Không tên",
    author: raw.author?.trim() || "",
    sourceUrl: typeof raw.sourceUrl === "string" ? raw.sourceUrl : undefined,
    createdAt: raw.createdAt || new Date().toISOString(),
    chapters,
    lastReadChapterId:
      typeof raw.lastReadChapterId === "string" ? raw.lastReadChapterId : undefined,
    lastReadScrollOffset:
      typeof raw.lastReadScrollOffset === "number" ? raw.lastReadScrollOffset : undefined,
    lastReadPercentage:
      typeof raw.lastReadPercentage === "number" ? raw.lastReadPercentage : undefined,
    lastReadPageIndex:
      typeof raw.lastReadPageIndex === "number" ? raw.lastReadPageIndex : undefined,
    lastReadMode: raw.lastReadMode === "scroll" || raw.lastReadMode === "page" ? raw.lastReadMode : undefined,
    chapterHeaderPattern:
      typeof raw.chapterHeaderPattern === "string" ? raw.chapterHeaderPattern : undefined,
  };
}

/** 1D — chỉ chương đã có translatedText; giữ sourceText nếu có. */
export function novelToTranslationBackupPayload(novel: Novel): Novel | null {
  if (!novel?.id) return null;

  const chapters = novel.chapters
    .map((ch) => pickChapterForBackup(ch))
    .filter((ch): ch is Chapter => ch !== null);

  if (chapters.length === 0) return null;

  return pickNovelMetaForBackup(novel, chapters);
}

export function collectTranslationBackupNovels(
  novels: Novel[],
  options?: { novelId?: string }
): Novel[] {
  const source = options?.novelId
    ? novels.filter((n) => n.id === options.novelId)
    : novels;

  return source
    .map((n) => novelToTranslationBackupPayload(n))
    .filter((n): n is Novel => n !== null);
}

export function countTranslatedChapters(novels: Novel[]): number {
  return novels.reduce((sum, n) => sum + n.chapters.length, 0);
}

function buildManifest(novels: Novel[], files: Record<string, string>): TranslationBackupManifest {
  return {
    schemaVersion: TRANSLATION_BACKUP_SCHEMA_VERSION,
    kind: TRANSLATION_BACKUP_KIND,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    novelCount: novels.length,
    chapterCount: countTranslatedChapters(novels),
    files,
  };
}

/** 1C — ZIP + manifest, không ghi settings/dict/page_trans. */
export async function buildTranslationBackupZip(
  novels: Novel[],
  options?: { novelId?: string }
): Promise<{ blob: Blob; manifest: TranslationBackupManifest; fileName: string }> {
  const payloadNovels = collectTranslationBackupNovels(novels, options);

  if (payloadNovels.length === 0) {
    throw new Error("Không có chương nào đã dịch Lab để sao lưu.");
  }

  const zip = new JSZip();
  const root = zip.folder(TRANSLATION_BACKUP_ROOT);
  if (!root) throw new Error("Không tạo được ZIP.");

  const files: Record<string, string> = {};

  for (const novel of payloadNovels) {
    const relPath = `novels/${novel.id}.json`;
    files[novel.id] = relPath;
    root.file(relPath, JSON.stringify(novel, null, 2));
  }

  const manifest = buildManifest(payloadNovels, files);
  root.file("backup_manifest.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const date = new Date().toISOString().slice(0, 10);
  const suffix =
    options?.novelId && payloadNovels[0]
      ? `_${sanitizeFileToken(payloadNovels[0].title)}`
      : "_toan_bo";
  const fileName = `data_dich${suffix}_${date}.zip`;

  return { blob, manifest, fileName };
}

function sanitizeFileToken(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/_+/g, "_")
      .slice(0, 28) || "truyen"
  );
}

function normalizeZipPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+/, "");
}

function findManifestPath(paths: string[]): string | null {
  const normalized = paths.map(normalizeZipPath);
  const exact = normalized.find((p) => p === `${TRANSLATION_BACKUP_ROOT}/backup_manifest.json`);
  if (exact) return exact;

  const nested = normalized.find(
    (p) => p.endsWith("/translation_data/backup_manifest.json") || p.endsWith("translation_data/backup_manifest.json")
  );
  if (nested) return nested;

  const rootManifest = normalized.find((p) => p === "backup_manifest.json");
  return rootManifest ?? null;
}

function parseManifest(raw: unknown): TranslationBackupManifest {
  if (!isRecord(raw)) throw new Error("Manifest backup không hợp lệ.");

  if (raw.kind !== TRANSLATION_BACKUP_KIND) {
    throw new Error("File ZIP không phải bản sao lưu data dịch (translation-data).");
  }

  const schemaVersion = Number(raw.schemaVersion);
  if (!Number.isFinite(schemaVersion) || schemaVersion > TRANSLATION_BACKUP_SCHEMA_VERSION) {
    throw new Error(
      `Schema backup (${raw.schemaVersion}) mới hơn app hiện tại — hãy cập nhật app rồi thử lại.`
    );
  }

  if (!isRecord(raw.files)) throw new Error("Manifest thiếu danh sách file truyện.");

  return {
    schemaVersion,
    kind: TRANSLATION_BACKUP_KIND,
    exportedAt: typeof raw.exportedAt === "string" ? raw.exportedAt : "",
    appVersion: typeof raw.appVersion === "string" ? raw.appVersion : "",
    novelCount: Number(raw.novelCount) || 0,
    chapterCount: Number(raw.chapterCount) || 0,
    files: Object.fromEntries(
      Object.entries(raw.files).filter(([, v]) => typeof v === "string")
    ) as Record<string, string>,
  };
}

function parseNovelPayload(raw: unknown): Novel | null {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id.trim()) return null;
  if (!Array.isArray(raw.chapters)) return null;

  const chapters = raw.chapters
    .map((ch) => pickChapterForBackup(ch))
    .filter((ch): ch is Chapter => ch !== null);

  if (chapters.length === 0) return null;

  return pickNovelMetaForBackup(raw as Partial<Novel>, chapters);
}

export function isTranslationBackupZipPath(paths: string[]): boolean {
  return findManifestPath(paths) !== null;
}

export function isFullVfsZipPath(paths: string[]): boolean {
  const normalized = paths.map(normalizeZipPath);
  return normalized.some(
    (p) =>
      p === "luu_tru/settings/cau_hinh_he_thong.json" ||
      p === "settings/cau_hinh_he_thong.json" ||
      (p.startsWith("books/") && p.endsWith("/meta.json"))
  );
}

export async function parseTranslationBackupZip(file: File): Promise<TranslationBackupParseResult> {
  if (!file.name.toLowerCase().endsWith(".zip")) {
    throw new Error("Vui lòng chọn file .zip sao lưu data dịch.");
  }

  const zip = new JSZip();
  const contents = await zip.loadAsync(file);
  const paths = Object.keys(contents.files);

  if (isFullVfsZipPath(paths) && !isTranslationBackupZipPath(paths)) {
    throw new Error(
      "Đây là ZIP sao lưu đầy đủ (VFS). Dùng «Nạp file ZIP» ở mục 3, không phải «Nạp data dịch»."
    );
  }

  const manifestPath = findManifestPath(paths);
  if (!manifestPath) {
    throw new Error("Không tìm thấy backup_manifest.json — file không phải data dịch hợp lệ.");
  }

  const manifestEntry = contents.files[manifestPath];
  if (!manifestEntry || manifestEntry.dir) {
    throw new Error("Manifest backup bị lỗi hoặc trống.");
  }

  const manifest = parseManifest(JSON.parse(await manifestEntry.async("string")));
  const manifestDir = manifestPath.includes("/")
    ? manifestPath.slice(0, manifestPath.lastIndexOf("/") + 1)
    : "";

  const novels: Novel[] = [];

  for (const relFile of Object.values(manifest.files)) {
    const fullPath = normalizeZipPath(`${manifestDir}${relFile}`);
    const entry =
      contents.files[fullPath] ??
      contents.files[normalizeZipPath(`${TRANSLATION_BACKUP_ROOT}/${relFile}`)];

    if (!entry || entry.dir) continue;

    const novel = parseNovelPayload(JSON.parse(await entry.async("string")));
    if (novel) novels.push(novel);
  }

  if (novels.length === 0) {
    throw new Error("ZIP không chứa chương dịch hợp lệ.");
  }

  return { manifest, novels };
}

export function previewTranslationBackupMerge(
  existing: Novel[],
  imported: Novel[],
  options?: TranslationBackupMergeOptions
): TranslationBackupMergeStats {
  const addOnly = (options?.mode ?? "overwrite") === "add_only";
  const stats: TranslationBackupMergeStats = {
    novelsAdded: 0,
    novelsUpdated: 0,
    chaptersAdded: 0,
    chaptersUpdated: 0,
    chaptersSkipped: 0,
  };

  for (const impNovel of imported) {
    const target = existing.find((n) => n.id === impNovel.id);
    if (!target) {
      stats.novelsAdded++;
      stats.chaptersAdded += impNovel.chapters.length;
      continue;
    }

    stats.novelsUpdated++;
    for (const impCh of impNovel.chapters) {
      if (target.chapters.some((c) => c.id === impCh.id)) {
        if (addOnly) stats.chaptersSkipped++;
        else stats.chaptersUpdated++;
      } else {
        stats.chaptersAdded++;
      }
    }
  }

  return stats;
}

/** 2A — merge theo novel.id / chapter.id; không đụng settings/dict. */
export function mergeTranslationBackup(
  existing: Novel[],
  imported: Novel[],
  options?: TranslationBackupMergeOptions
): TranslationBackupMergeResult {
  const addOnly = (options?.mode ?? "overwrite") === "add_only";
  const merged = existing.map((n) => ({ ...n, chapters: [...n.chapters] }));
  const stats: TranslationBackupMergeStats = {
    novelsAdded: 0,
    novelsUpdated: 0,
    chaptersAdded: 0,
    chaptersUpdated: 0,
    chaptersSkipped: 0,
  };
  const clearedPageCacheChapterIds: string[] = [];

  for (const impNovel of imported) {
    const idx = merged.findIndex((n) => n.id === impNovel.id);

    if (idx === -1) {
      merged.push({ ...impNovel, chapters: [...impNovel.chapters] });
      stats.novelsAdded++;
      stats.chaptersAdded += impNovel.chapters.length;
      continue;
    }

    stats.novelsUpdated++;
    const target = merged[idx];
    const preservedDeleted = target.deletedFromLibrary;

    if (!addOnly) {
      target.title = impNovel.title;
      target.author = impNovel.author;
      if (impNovel.sourceUrl) target.sourceUrl = impNovel.sourceUrl;
      if (impNovel.chapterHeaderPattern) target.chapterHeaderPattern = impNovel.chapterHeaderPattern;
      if (impNovel.lastReadChapterId) target.lastReadChapterId = impNovel.lastReadChapterId;
      if (typeof impNovel.lastReadPageIndex === "number") {
        target.lastReadPageIndex = impNovel.lastReadPageIndex;
      }
      if (impNovel.lastReadMode) target.lastReadMode = impNovel.lastReadMode;
      if (typeof impNovel.lastReadPercentage === "number") {
        target.lastReadPercentage = impNovel.lastReadPercentage;
      }
    }
    target.deletedFromLibrary = preservedDeleted;

    for (const impCh of impNovel.chapters) {
      const chIdx = target.chapters.findIndex((c) => c.id === impCh.id);
      if (chIdx === -1) {
        target.chapters.push(impCh);
        stats.chaptersAdded++;
        continue;
      }

      if (addOnly) {
        stats.chaptersSkipped++;
        continue;
      }

      const prev = target.chapters[chIdx];
      target.chapters[chIdx] = {
        ...prev,
        title: impCh.title || prev.title,
        translatedText: impCh.translatedText,
        translatedTitle: impCh.translatedTitle ?? prev.translatedTitle,
        sourceText: impCh.sourceText.trim() ? impCh.sourceText : prev.sourceText,
        charCount: impCh.charCount || prev.charCount,
        wordCount: impCh.wordCount || prev.wordCount,
        isCompleted: impCh.isCompleted ?? prev.isCompleted,
      };
      stats.chaptersUpdated++;
      clearedPageCacheChapterIds.push(impCh.id);
    }
  }

  return { novels: merged, stats, clearedPageCacheChapterIds };
}

export function formatTranslationBackupMergeSummary(stats: TranslationBackupMergeStats): string {
  const parts = [
    `Thêm ${stats.novelsAdded} truyện`,
    `Cập nhật ${stats.novelsUpdated} truyện có sẵn`,
    `Thêm ${stats.chaptersAdded} chương dịch`,
  ];
  if (stats.chaptersUpdated > 0) {
    parts.push(`Ghi đè ${stats.chaptersUpdated} chương dịch`);
  }
  if (stats.chaptersSkipped > 0) {
    parts.push(`Bỏ qua ${stats.chaptersSkipped} chương trùng id`);
  }
  return parts.join(" · ");
}

export async function downloadBlobWithFallback(
  blob: Blob,
  suggestedName: string,
  onSuccess?: (message: string) => void
): Promise<boolean> {
  const result = await saveBlobWithNativeFallback(
    blob,
    suggestedName,
    "application/zip"
  );
  if (result.cancelled) return true;
  if (!result.saved) return false;
  onSuccess?.(
    result.uri
      ? `Đã lưu file ZIP.\nURI: ${result.uri}\nDung lượng ghi: ${result.bytesWritten ?? blob.size} bytes`
      : `Đã tải file ZIP thành công.\nDung lượng: ${result.bytesWritten ?? blob.size} bytes`
  );
  return true;
}
