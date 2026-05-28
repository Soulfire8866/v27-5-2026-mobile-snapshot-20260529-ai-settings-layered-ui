import { openDB } from 'idb';

const DB_NAME = 'NovelAppDB';
const DB_VERSION = 1;
const NOVELS_MANIFEST_KEY = "novels_chunk_manifest_v1";
const NOVELS_CHUNK_PREFIX = "novels_chunk_data_";
const MAX_CHAPTERS_PER_CHUNK = 100;
const MAX_RAW_CHARS_PER_CHUNK = 1_200_000;

export const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    db.createObjectStore('settings', { keyPath: 'id' });
  },
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function estimateChapterRawChars(chapter: unknown): number {
  if (!isRecord(chapter)) return 0;
  const sourceText = typeof chapter.sourceText === "string" ? chapter.sourceText : "";
  const translatedText = typeof chapter.translatedText === "string" ? chapter.translatedText : "";
  const title = typeof chapter.title === "string" ? chapter.title : "";
  return sourceText.length + translatedText.length + title.length + 256;
}

type ChapterRef = { chunkKey: string; offset: number };
type ChunkManifestNovel = {
  id: string;
  meta: Record<string, unknown>;
  chapterRefs: ChapterRef[];
};
type ChunkManifest = {
  version: number;
  novels: ChunkManifestNovel[];
  chunkKeys: string[];
  updatedAt: string;
};

async function saveNovelsAsChunks(value: unknown): Promise<void> {
  if (!Array.isArray(value)) {
    return;
  }
  const db = await dbPromise;
  const allKeys = (await db.getAllKeys("settings")) as string[];
  const oldChunkKeys = allKeys
    .map((k) => String(k))
    .filter((k) => k.startsWith(NOVELS_CHUNK_PREFIX) || k === NOVELS_MANIFEST_KEY);

  const novels = value.filter((n) => isRecord(n));
  const chunkEntries: { key: string; chapters: unknown[] }[] = [];
  const manifestNovels: ChunkManifestNovel[] = [];

  for (const rawNovel of novels) {
    const novelId = typeof rawNovel.id === "string" && rawNovel.id.trim() ? rawNovel.id : "";
    if (!novelId) continue;
    const rawChapters = Array.isArray(rawNovel.chapters) ? rawNovel.chapters : [];
    const chapterRefs: ChapterRef[] = [];

    let currentChunk: unknown[] = [];
    let currentRawChars = 0;
    let chunkIndex = 0;

    const flushChunk = () => {
      if (currentChunk.length === 0) return;
      const key = `${NOVELS_CHUNK_PREFIX}${novelId}_${String(chunkIndex).padStart(4, "0")}`;
      chunkEntries.push({ key, chapters: currentChunk });
      for (let i = 0; i < currentChunk.length; i++) {
        chapterRefs.push({ chunkKey: key, offset: i });
      }
      chunkIndex += 1;
      currentChunk = [];
      currentRawChars = 0;
    };

    for (const chapter of rawChapters) {
      const chapterRaw = estimateChapterRawChars(chapter);
      const shouldSplit =
        currentChunk.length >= MAX_CHAPTERS_PER_CHUNK ||
        (currentChunk.length > 0 && currentRawChars + chapterRaw > MAX_RAW_CHARS_PER_CHUNK);
      if (shouldSplit) flushChunk();
      currentChunk.push(chapter);
      currentRawChars += chapterRaw;
    }
    flushChunk();

    const { chapters: _omit, ...meta } = rawNovel;
    manifestNovels.push({ id: novelId, meta, chapterRefs });
  }

  const manifest: ChunkManifest = {
    version: 1,
    novels: manifestNovels,
    chunkKeys: chunkEntries.map((c) => c.key),
    updatedAt: new Date().toISOString(),
  };

  // Write new entries first
  await db.put("settings", { id: NOVELS_MANIFEST_KEY, value: manifest });
  for (const chunk of chunkEntries) {
    await db.put("settings", { id: chunk.key, value: chunk.chapters });
  }
  // Remove stale chunk keys after successful write
  const used = new Set([NOVELS_MANIFEST_KEY, ...manifest.chunkKeys]);
  for (const old of oldChunkKeys) {
    if (!used.has(old)) {
      await db.delete("settings", old);
    }
  }
}

async function loadNovelsFromChunks(): Promise<unknown[] | null> {
  const db = await dbPromise;
  const manifestRecord = await db.get("settings", NOVELS_MANIFEST_KEY);
  const manifest = manifestRecord?.value as ChunkManifest | undefined;
  if (!manifest || manifest.version !== 1 || !Array.isArray(manifest.novels)) {
    return null;
  }

  const chunkCache = new Map<string, unknown[]>();
  const novels: unknown[] = [];
  for (const novel of manifest.novels) {
    if (!novel || typeof novel.id !== "string" || !Array.isArray(novel.chapterRefs)) continue;
    const chapters: unknown[] = [];
    for (const ref of novel.chapterRefs) {
      if (!ref || typeof ref.chunkKey !== "string" || typeof ref.offset !== "number") continue;
      let chunk = chunkCache.get(ref.chunkKey);
      if (!chunk) {
        const chunkRecord = await db.get("settings", ref.chunkKey);
        chunk = Array.isArray(chunkRecord?.value) ? chunkRecord.value : [];
        chunkCache.set(ref.chunkKey, chunk);
      }
      const chapter = chunk[ref.offset];
      if (chapter !== undefined) chapters.push(chapter);
    }
    novels.push({ ...(novel.meta || {}), id: novel.id, chapters });
  }
  return novels;
}

export const saveValue = async (key: string, value: any) => {
  if (key === "novels") {
    await saveNovelsAsChunks(value);
    return;
  }
  const db = await dbPromise;
  await db.put('settings', { id: key, value });
};

export const getValue = async (key: string) => {
  if (key === "novels") {
    const chunked = await loadNovelsFromChunks();
    if (chunked) return chunked;
  }
  const db = await dbPromise;
  const result = await db.get('settings', key);
  return result?.value;
};

export const deleteValue = async (key: string) => {
  if (key === "novels") {
    const db = await dbPromise;
    const allKeys = (await db.getAllKeys("settings")) as string[];
    for (const k of allKeys) {
      const id = String(k);
      if (id === NOVELS_MANIFEST_KEY || id.startsWith(NOVELS_CHUNK_PREFIX)) {
        await db.delete("settings", id);
      }
    }
  }
  const db = await dbPromise;
  await db.delete('settings', key);
};
