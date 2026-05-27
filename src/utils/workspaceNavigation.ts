/** Khóa localStorage đồng bộ Lab ↔ Phòng Đọc */
export const WORKSPACE_LS = {
  editorChapter: (novelId: string) => `last_editor_chapter_${novelId}`,
  readChapter: (novelId: string) => `last_read_chapter_${novelId}`,
  readProgress: (novelId: string) => `last_read_progress_${novelId}`,
  readPage: (novelId: string) => `last_read_page_${novelId}`,
  labOpenFocus: (novelId: string) => `lab_open_focus_${novelId}`,
} as const;

export type LabOpenFocus = "han_pinyin" | "compare";

export const persistLabOpenFocus = (novelId: string, focus: LabOpenFocus): void => {
  try {
    localStorage.setItem(WORKSPACE_LS.labOpenFocus(novelId), focus);
  } catch {
    /* ignore */
  }
};

export const consumeLabOpenFocus = (novelId: string): LabOpenFocus | null => {
  try {
    const raw = localStorage.getItem(WORKSPACE_LS.labOpenFocus(novelId));
    localStorage.removeItem(WORKSPACE_LS.labOpenFocus(novelId));
    if (raw === "han_pinyin" || raw === "compare") return raw;
  } catch {
    /* ignore */
  }
  return null;
};

export const syncChapterAcrossWorkspaces = (
  novelId: string,
  chapterId: string,
  pageIndex = 0
): void => {
  try {
    localStorage.setItem(WORKSPACE_LS.editorChapter(novelId), chapterId);
    localStorage.setItem(WORKSPACE_LS.readChapter(novelId), chapterId);
    localStorage.setItem(WORKSPACE_LS.readProgress(novelId), chapterId);
    localStorage.setItem(WORKSPACE_LS.readPage(novelId), String(pageIndex));
  } catch {
    /* ignore */
  }
};
