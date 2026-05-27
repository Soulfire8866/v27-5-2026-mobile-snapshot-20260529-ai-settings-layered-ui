/** Trạng thái «đọc tuần tự» Phòng Đọc — giữ khi đổi tab Lab ↔ Reader (1A). */

export type ReaderSequentialPersist = {
  armed: boolean;
  novelId: string;
  chapterId: string;
  updatedAt: number;
};

const keyFor = (novelId: string) => `reader_seq_${novelId}`;

export function saveReaderSequentialState(
  novelId: string,
  armed: boolean,
  chapterId: string
): void {
  if (!novelId) return;
  try {
    const payload: ReaderSequentialPersist = {
      armed,
      novelId,
      chapterId,
      updatedAt: Date.now(),
    };
    sessionStorage.setItem(keyFor(novelId), JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadReaderSequentialState(novelId: string): ReaderSequentialPersist | null {
  if (!novelId) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(novelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReaderSequentialPersist;
    if (parsed?.novelId !== novelId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearReaderSequentialState(novelId: string): void {
  if (!novelId) return;
  try {
    sessionStorage.removeItem(keyFor(novelId));
  } catch {
    /* ignore */
  }
}
