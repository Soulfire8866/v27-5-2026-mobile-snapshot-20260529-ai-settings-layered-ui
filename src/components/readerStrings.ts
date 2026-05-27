/**
 * Chuỗi UI Phòng Đọc (UTF-8). Giữ tập trung để tránh lỗi encoding khi sửa ReaderView.tsx.
 */
export const readerStrings = {
  loadingChapter: "Đang tải chương đọc gần nhất…",
  noChapterSelected: "Chưa chọn…",
  backTitle: "Quay lại",
  settingsTitle: "Tùy chỉnh cỡ chữ, lề, font",
  labHanTitle: "Xem chữ Hán gốc + Pinyin trong Lab Dịch (cùng chương)",
  labHanShort: "Lab · Hán",
  readModePage: "Dạng phân trang",
  readModeScroll: "Dạng cuộn dọc",
  pageModeLabel: "Phân Trang",
  scrollModeLabel: "Cuộn Dọc",

  settings: {
    panelTitle: "Cấu hình Trang Sách",
    labBilingualButton: "Lab Dịch — Hán gốc + Pinyin (chương này)",
    fontStyleLabel: "Kiểu chữ hiển thị:",
    paperColorLabel: "Màu giấy Phòng Đọc:",
    paperColorHint:
      "Menu / Lab dùng mục «Giao diện khung» trong tab Cài đặt.",
    autoTranslateLabel: "Tự dịch chương kế (Lab)",
    autoTranslateHint:
      "Sau khi đọc tuần tự (Chương sau/trước) đủ thời gian, app dịch ngầm một chương liền kề theo quy tắc Lab. Nhảy chương từ menu ⋯ không kích hoạt cho đến khi bạn bấm Chương sau/trước liền kề một lần.",
    minDelayLabel: "Tối thiểu (giây)",
    minDelayAlert: (minSec: number) =>
      `Vui lòng nhập số giây tối thiểu bằng ${minSec}.`,
    fontSizeLabel: "Cỡ chữ",
    decreaseFontTitle: "Giảm cỡ chữ",
    increaseFontTitle: "Tăng cỡ chữ",
    widthLabel: "Khung đọc (Bề ngang)",
    lineHeightLabel: "Giãn dòng",
    paragraphGapLabel: "Khoảng cách đoạn",
    indentLabel: "Thụt đầu dòng",
    alignmentLabel: "Căn lề",
    readModeSectionLabel: "Cần đoạn:",
    scrollReadLabel: "Cuộn dọc",
    swipeReadLabel: "Đọc vuốt (Mobile):",
    swipeHorizontal: "Vuốt Ngang",
    swipeVertical: "Vuốt Dọc",
  },

  themeLabels: {
    light: "Fluent",
    cream: "Vàng Sách",
    dark: "Đêm Tối",
    "pure-white": "Trắng",
    "contrast-black": "Đen",
  } as Record<string, string>,

  chrome: {
    chapterListTitle: "Danh sách chương",
    labTitle: "Lab Dịch — Hán + Pinyin",
    prevPage: "Trước",
    prevChapter: "Chương Trước",
    nextPage: "Kế tiếp",
    nextChapter: "Chương Sau",
    pageOf: (cur: number, total: number, pct: string) =>
      `Trang ${cur}/${total} (${pct}%)`,
    chapterOf: (cur: number, total: number) => `Chương ${cur}/${total}`,
    emptyPageTitle: "Trang trống",
    emptyPageBody: "Chương không có nội dung ở trang này.",
    labBannerPaged:
      "Chưa có bản dịch Lab — đang hiển thị bản Hán. Mở Lab Dịch → «Dịch chương» để đọc song ngữ chuẩn.",
    labBannerScroll:
      "Chưa có bản dịch Lab — hiển thị bản Hán. Lab Dịch → «Dịch chương» hoặc bật tự dịch chương kế trong Cấu hình Trang Sách.",
    untranslatedParaTitle: "Đoạn văn này có chứa Hán tự chưa dịch.",
    translateGapBtn: "Dịch đoạn sót",
    translatingGapBtn: "Đang dịch…",
  },

  selection: {
    translateBtn: "Dịch",
    addDictBtn: "Thêm từ điển",
    closeTitle: "Đóng",
    closeLookupTitle: "Đóng tra cứu",
    labLookupHint:
      "Chưa có bản dịch Lab cho chương này — tra cứu dựa trên đoạn Hán gốc và từ điển. Dịch chương trong Lab để khớp dòng chính xác hơn.",
    expandedSelection: (raw: string, vi: string) =>
      `Đã mở rộng «${raw}» → «${vi}»`,
    useRawOnly: (raw: string) => `Chỉ dùng «${raw}»`,
    pickChineseTitle: "Bôi đen chữ Trung để gán vào ô từ gốc",
    chinesePlaceholder: "Từ gốc Trung (vd. 黛眉)",
    vietnamesePlaceholder: "Bản dịch Việt",
    vietphrasePlaceholder: "Vietphrase…",
    hanVietPlaceholder: "Hán Việt…",
    popupComment:
      "Popup tra cứu / Vietphrase khi bấm «Dịch» (portal — tránh bị cắt bởi overflow Phòng Đọc)",
  },

  chapterDrawer: {
    noTitle: "(Không có tiêu đề)",
    translatedLab: "Đã dịch Lab",
    notTranslatedLab: "Chưa dịch Lab",
  },

  autoTranslate: {
    translating: (title: string) => `Đang dịch chương kế: ${title}…`,
    failed: (reason: string) => `Không dịch được chương kế: ${reason}`,
    done: "Đã dịch xong chương kế (Lab).",
  },

  alerts: {
    noLabBilingualLine: "Chưa có dòng song ngữ Lab cho đoạn này.",
    noLabLineMatch: "Không khớp được dòng Lab — hãy chỉnh tay trong popup «Dịch».",
    dictProperNameOnly:
      "«Thêm từ điển» chỉ dùng cho cụm tên riêng (mỗi từ viết hoa chữ đầu).",
    chapterNeedsLab:
      "Chương chưa có bản dịch Lab — không thể khớp từ Hán. Dịch chương trong Lab trước.",
    chineseUnknown:
      "Chưa xác định được từ gốc tiếng Trung. Bấm «Dịch» để tra cứu đầy đủ.",
    dictAdded: (zh: string, vi: string) =>
      `Đã thêm "${zh}" → "${vi}" vào từ điển (riêng truyện, tên riêng).`,
    noChineseParagraph:
      "Không tìm thấy đoạn gốc Trung văn tương ứng để gửi dịch thuật.",
    gapTranslated: "Đã dịch và cập nhật thành công câu văn bị sót!",
    aiEmpty:
      "Máy chủ AI đã nhận yêu cầu nhưng trả về nội dung rống hoặc dịch hỏng. Vui lòng kiểm tra phím API.",
    aiUnreachable: "Không thể kết nối đến máy chủ AI để xử lý câu này.",
    autoLookupBusy:
      "Hệ thống đang tự động tìm kiếm từ gốc tiếng Trung tương thích. Vui lòng chờ vài giây hoặc tự điền từ gốc thủ công!",
    fillBothFields: "Vui lòng nhập đầy đủ từ gốc Trung văn và từ dịch Việt hóa!",
    dictSaved: (zh: string, vi: string, scope: string) =>
      `Đã thêm "${zh}" → "${vi}" vào từ điển (${scope}).`,
    validationPrompt: (msg: string, suggested: string, current: string) =>
      `${msg}\n\nOK = dùng gợi ý «${suggested}» và lưu\nCancel = lưu đúng như ô hiện tại «${current}»`,
  },

  lookup: {
    searching: "Đang tra cứu...",
    noHanParagraph: "Không tìm thấy đoạn Hán văn...",
  },
} as const;
