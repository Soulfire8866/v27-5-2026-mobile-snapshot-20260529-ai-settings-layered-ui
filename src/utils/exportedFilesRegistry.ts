import { getValue, saveValue } from "../lib/persistence";

export type ExportedFileEntry = {
  id: string;
  fileName: string;
  mimeType: string;
  bytesWritten: number;
  uri: string;
  savedAt: string;
};

const EXPORTED_FILES_REGISTRY_KEY = "exported_files_registry_v1";
const EXPORTED_FILES_REGISTRY_LIMIT = 300;

function normalizeRegistry(value: unknown): ExportedFileEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ExportedFileEntry => {
    return (
      typeof item === "object" &&
      item !== null &&
      typeof (item as ExportedFileEntry).id === "string" &&
      typeof (item as ExportedFileEntry).fileName === "string" &&
      typeof (item as ExportedFileEntry).mimeType === "string" &&
      typeof (item as ExportedFileEntry).bytesWritten === "number" &&
      typeof (item as ExportedFileEntry).uri === "string" &&
      typeof (item as ExportedFileEntry).savedAt === "string"
    );
  });
}

function sortNewestFirst(entries: ExportedFileEntry[]): ExportedFileEntry[] {
  return entries.slice().sort((a, b) => {
    if (a.savedAt === b.savedAt) {
      return b.id.localeCompare(a.id);
    }
    return b.savedAt.localeCompare(a.savedAt);
  });
}

export async function listExportedFiles(): Promise<ExportedFileEntry[]> {
  const raw = await getValue(EXPORTED_FILES_REGISTRY_KEY);
  return sortNewestFirst(normalizeRegistry(raw));
}

export async function trackExportedFile(entry: Omit<ExportedFileEntry, "id" | "savedAt">): Promise<void> {
  const existing = await listExportedFiles();
  const nextEntry: ExportedFileEntry = {
    ...entry,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    savedAt: new Date().toISOString(),
  };
  const dedup = existing.filter((item) => item.uri !== nextEntry.uri);
  const merged = [nextEntry, ...dedup].slice(0, EXPORTED_FILES_REGISTRY_LIMIT);
  await saveValue(EXPORTED_FILES_REGISTRY_KEY, merged);
}

export async function removeExportedFileById(id: string): Promise<ExportedFileEntry[]> {
  const existing = await listExportedFiles();
  const updated = existing.filter((entry) => entry.id !== id);
  await saveValue(EXPORTED_FILES_REGISTRY_KEY, updated);
  return updated;
}
