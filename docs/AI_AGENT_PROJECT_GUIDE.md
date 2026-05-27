# Hướng dẫn dự án cho AI Agent

**Dự án:** Novel Translator for Fun  
**Repo hiện tại:** `v27.5.2026 mobile` (thư mục gốc, ví dụ `E:\v27.5.2026 mobile`) — kế thừa codebase từ `mobile_v3` / `v24.5.2026 mobile_v3`.  
**Mục đích tài liệu:** Ghi nhận nguyên tắc, quyết định đã chốt, kiến trúc và hướng xử lý bắt buộc khi tiếp quản sửa lỗi / nâng cấp / tối ưu.  
**Ngôn ngữ sản phẩm:** UI và nội dung người dùng chủ yếu **tiếng Việt**.  
**Cập nhật:** 2026-05-27 (đổi tên repo; Lab chrome, quét tên PA-3, sửa APK thực tế).

---

## 1. Tổng quan sản phẩm

Ứng dụng dịch và đọc tiểu thuyết Trung → Việt trên **Web + Capacitor Android**:

| Tab / vùng | Vai trò |
|------------|---------|
| **Home** | Menu điều hướng |
| **Thư viện** | Quản lý tác phẩm, nạp chương |
| **Lab Dịch** (`editor`) | So sánh song song Hán–Việt, dịch chương (API), hiệu đính |
| **Phòng Đọc** (`reader`) | Đọc offline; **chỉ hiển thị** `translatedText` từ Lab (không dịch trang qua API) |
| **Từ điển** | Từ vựng riêng + **quét tên riêng** |
| **Xưng hô / Cấu hình / VFS** | Quy tắc, API, sao lưu IndexedDB |

**Luồng dữ liệu cốt lõi:** Chương có `sourceText` + `translatedText` (1:1 dòng trong Lab). Phòng Đọc và tra song ngữ phụ thuộc căn chỉnh dòng Lab.

---

## 2. Stack kỹ thuật

- **Frontend:** React 19, Vite 6, Tailwind CSS 4 (`@theme` token trong `src/index.css`)
- **Mobile:** Capacitor 8 (`@capacitor/status-bar`), build APK qua `npm run android:release`
- **Persistence:** IndexedDB (`src/lib/persistence.ts`)
- **Dịch AI:** `@google/genai`, logic trong `src/utils/chapterTranslationEngine.ts`
- **QA:** `npm run qa` → `scripts/qa-user-scenarios.mjs` (tsx)
- **Lint:** `npm run lint` → `tsc --noEmit` (không ESLint riêng)

---

## 3. Nguyên tắc thiết kế (BẮT BUỘC)

### 3.1 Code

1. **Diff tối thiểu** — Chỉ sửa phạm vi liên quan yêu cầu; không refactor lan man.
2. **Theo convention hiện có** — Dùng `src/lib/ui.ts` (`uiBtnPrimary`, `uiPanel`, `uiInput`…), token `app-*`, không tự ý thêm palette lạ.
3. **Không over-engineer** — Tránh abstraction một–hai dòng; không bọc try/catch cho edge case cực hiếm.
4. **Tách module có chủ đích** — Ví dụ HV offline: `src/utils/hanVietOffline.ts` (không nhét lại `ReaderView.tsx`).
5. **Không commit / push** trừ khi user yêu cầu rõ.

### 3.2 UI / UX (Kindle-inspired)

- Nền giấy / dark zinc; accent teal `app-accent`.
- Nút: `min-h-10`, `truncate` cho text dài; tiêu đề chương **luôn `truncate`**.
- **Tương phản:** Chỉ dùng class Tailwind **hợp lệ** (`text-sky-600`, không `text-sky-650`). Overlay modal: `z-[55]` hoặc `z-50`, không `z-55`.
- **Safe area Android:** `env(safe-area-inset-top)` + tối thiểu 28px; **không** dùng `!pt-0` trên phần tử có class `lab-chrome-safe-top` (sẽ xóa padding và đè status bar).

### 3.3 Sản phẩm dịch

- **Lab là nguồn sự thật** cho bản dịch chương (`translatedText`).
- Phòng Đọc **không** gọi API dịch từng trang khi chưa có bản Lab.
- Dịch hàng loạt / tự dịch chương kế: cần API key; có hàng đợi và gap tối thiểu (xem `chapterTranslationEngine`, `labAutoTranslateNext`).

---

## 4. Cấu trúc file quan trọng

```
src/
  App.tsx                 # Tab, Lab header, history back, system chrome
  index.css               # Token màu, lab-chrome-safe-top, reader safe area
  lib/ui.ts               # Design system className
  components/
    CompareView.tsx       # Lab: đối chiếu & hiệu đính
    ReaderView.tsx        # Phòng Đọc (re-export getHanVietOffline)
    DictManager.tsx       # Từ điển + quét tên popup
  utils/
    chapterTranslationEngine.ts
    nameScanPipeline.ts   # PA-3, 5B Lab, 6BC noise, 10A/B/C
    hanVietOffline.ts     # HV từng chữ (4B)
    dictScanConstants.ts  # Blacklist Hán chung
    systemChrome.ts       # Status bar Capacitor
scripts/
  qa-user-scenarios.mjs
docs/
  AI_AGENT_PROJECT_GUIDE.md   # File này
```

---

## 5. Lab Dịch — quy tắc UI & hành vi

### 5.1 Tên hiển thị

- Tab/menu: **「Lab Dịch」** — **không** dùng 「Biên dịch song song」 làm tiêu đề chính header mở chương.

### 5.2 Header khi mở chương (`#lab-chapter-header`)

**Bố cục 2 hàng (đã chốt):**

1. **Hàng trên:** `✍️ Lab Dịch` | tên chương (truncate) | `ChapterReadinessBadge`
2. **Hàng dưới:** Nút icon Home, icon List (danh sách chương), Phòng Đọc, Dịch chương

**Safe area (CSS):**

```css
#lab-chapter-header.lab-chrome-safe-top {
  padding-top: max(env(safe-area-inset-top, 0px), 28px);
}
```

- Cùng công thức safe-top với `.lab-chrome-safe-top` — hàng tiêu đề sát status bar tương tự Từ điển / Cấu hình (chốt **1A**, 2026-05-27).
- **Cấm** `!pt-0` trên `#lab-chapter-header`.

### 5.3 Nút điều hướng

| Nút | Hành vi |
|-----|---------|
| **Home** | `setActiveTab("home")`, `setActiveChapterId(undefined)`, `history.replaceState(null)` — **không** `history.back()` (tránh mở drawer danh sách) |
| **List** | Mở drawer chương mobile / quay danh sách desktop (`handleLabOpenChapterList`) |
| **Phòng Đọc** | Mở reader đúng chương |
| **Dịch chương** | `handleTranslateActiveChapter` |

### 5.4 Chế độ chi tiết

- `isDetailMode` = reader immersive **hoặ** Lab có `activeChapterId` → ẩn `uiHeader` global.
- System chrome: `applyReaderSystemChrome` (reader) / `applyAppSystemChrome` (còn lại) trong `App.tsx`.

### 5.5 Drawer chương mobile

- `lab-chrome-safe-top` **không** có `!pt-0`.
- z-index overlay `z-[60]`, aside `z-[70]`.

---

## 6. Quét tên riêng (DictManager + nameScanPipeline)

### 6.1 Hai checkbox file Vietphrase (đã chốt — PA-3)

| Checkbox | State | Tác dụng |
|----------|-------|----------|
| **Dùng file để điền «Tên trong bản dịch» (PA-3)** | `useRefDictForLookup` | Truyền `refDict` vào `buildNameScanRow` |
| **Ẩn cụm đã có trong file khỏi danh sách quét** | `excludeRefWords` | `continue` trong vòng đếm `counts` |

**Mặc định sau upload `.txt` thành công:**

- `useRefDictForLookup = true`
- `excludeRefWords = false`

**Lý do:** Cùng một `refDict` không được vừa loại trừ quét vừa tra PA-3 — trước đây `excludeRefWords=true` mặc định đã **vô hiệu hóa PA-3**.

**Upload file:** Chỉ **`.txt`** (UTF-8 / GB18030). **Không** hỗ trợ `.docx` thật (ZIP/XML).

### 6.2 Thứ tự điền «Tên trong bản dịch» (PA-3)

Trong `buildNameScanRow` (`src/utils/nameScanPipeline.ts`):

1. **Vietphrase** (`refDict`) nếu `isLikelyNameFromVietphrase()` pass → badge **VP**
2. **Lab** — `resolveTranslationFromLabCorpus` + `isLabMatchPlausible()` → badge **LAB**
3. **HV offline** — `getHanVietOffline` nếu pass filter → badge **HV**
4. Trống → **Nhập tay**

**Lưu ý sản phẩm:** VP **ưu tiên hơn Lab** khi cả hai khác nhau — đã chốt PA-3; đổi cần thảo luận user (vd. ưu tiên Lab khi confidence cao).

### 6.3 Cột «Hán Việt (gợi ý · offline)»

- Chỉ **tham khảo**; ghép từng chữ qua `getHanVietOffline`.
- **Không** nhầm với badge VP (Vietphrase file).
- Ghép 1:1 đúng **cho tên cổ điển** nhưng: đa âm, họ đặc biệt, cụm **không phải tên** (`十分`, `身体`) vẫn cho âm vô nghĩa nếu không lọc.

### 6.4 Lọc nhiễu & Lab (đã sửa theo APK test)

- `isScanNoiseChinesePhrase` + blacklist mở rộng (`十分`, `身体`, `却已经`, …).
- `resolveTranslationFromLabCorpus`: **bỏ** fallback bắt mọi cụm viết hoa; bắt buộc `isLabMatchPlausible` (số từ Việt ~ số chữ Hán).
- `inferEntityKind`: trả `other` nếu cụm là noise.
- **Badge 10B** trên popup: Nhân vật / Địa danh / Tông môn / Tước vị / Võ công (`entityKindLabel`, `entityKindBadgeClass`).

### 6.5 HV offline — override pinyin quan trọng

Trong `hanVietOffline.ts` `charToHanViet`, ví dụ:

- `楚` + pinyin `chu` → **Sở** (không Xuất)
- `欢` → Hoan; `琳`/`琅`; `可` → Khả; `卿` → Khanh

Khi user báo âm HV sai: bổ sung nhánh theo **ký tự Hán**, không chỉ map pinyin chung.

### 6.6 CVDICT — ĐÃ GỠ (không khôi phục trừ khi user yêu cầu)

- Đã xóa `cvdict-index.json`, `cvdictLookup.ts`, build script.
- Lý do: không phù hợp lọc tên riêng; HV offline = dict tích hợp + user dict + char map.

---

## 7. Phòng Đọc

- `getHanVietOffline` import từ `hanVietOffline.ts`; `ReaderView` re-export để tương thích.
- Safe area: `#reader-view-panel[data-reader-overlay="true"]` → `--reader-safe-top`.
- **Smoke test bắt buộc** sau thay đổi HV/Lab: popup tra từ khi bôi chữ.

---

## 8. Lỗi / regression đã sửa (không tái phạm)

| Vấn đề | Cách xử lý |
|--------|------------|
| `excludeRefWords` mặc định chặn PA-3 | Tách checkbox + mặc định sau upload |
| `!pt-0` xóa safe-area Lab | Gỡ; CSS `#lab-chapter-header` có padding-top calc |
| Home → drawer thay vì Home gốc | `handleLabExitToHome` set tab home trực tiếp |
| `value="history font-bold"` | Sửa `value="history"` |
| `text-sky-650`, `z-55` | `text-sky-600`, `z-[55]` |
| Lab gán nhầm tên (十分→Sở Hoan) | `isLabMatchPlausible`, noise set, bỏ loose regex |
| Tiêu đề dọc / «Biên dịch song song» | Header 2 hàng, đổi tên Lab Dịch |

---

## 9. Việc có thể tối ưu tiếp (chưa chốt)

| Ưu tiên | Nội dung |
|---------|----------|
| P2 | Khi VP ≠ Lab: tùy chọn ưu tiên Lab hoặc cảnh báo |
| P2 | Nới / tinh chỉnh `isLikelyNameFromVietphrase` theo file Vietphrase 36MB thật |
| P2 | Migrate category DB cũ `history font-bold` → `history` |
| P3 | Smoke APK: notch khác nhau — nếu Lab vẫn lệch Từ điển/Cấu hình, tinh safe-top (không dùng `!pt-0`) |
| P3 | Parser `.docx` thật hoặc gỡ hẳn mention trên mọi màn |
| P3 | Hiển thị confidence Lab trên popup quét |
| Dev | QA script: sửa import path nếu `chapterPattern` thiếu khi chạy full `npm run qa` |

---

## 10. Kiểm thử & build Android

```powershell
cd "E:\v27.5.2026 mobile"
npm run lint
npm run qa          # nếu môi trường resolve đủ module
npm run build
npx cap sync android
npm run android:release   # hoặc script release.ps1
```

**Trên máy thật:** INTERNET, API key trong Cấu hình, Lab safe-area, quét tên sau upload Vietphrase `.txt`.

---

## 11. Quy tắc khi AI agent nhận task mới

0. **Vấn đề / đề xuất mới (chưa chốt):** Phân tích khả thi → phương án **1A, 2B, …** + khuyến nghị → **chờ user xác nhận** rồi mới sửa code (chi tiết: `.cursor/rules/project-guide.mdc`, mục «Quy trình khi user nêu vấn đề»).
1. **Đọc file này** + grep vùng liên quan (`nameScanPipeline`, `App.tsx` Lab header, `DictManager`).
2. **Không** bật lại `excludeRefWords=true` mặc định khi có PA-3.
3. **Không** thêm `!pt-0` lên `lab-chrome-safe-top`.
4. Sửa UI: dùng `src/lib/ui.ts`, token `app-*`.
5. Sửa logic quét tên: cập nhật test trong `scripts/qa-user-scenarios.mjs` nếu đổi hành vi PA-3/5B/6BC.
6. Giải thích bằng tiếng Việt cho user; diff nhỏ, có ví dụ cụ thể Hán–Việt khi thảo luận tên riêng.
7. Phân biệt rõ **VP / LAB / HV** khi debug — ba nguồn khác nhau.

---

## 12. Thuật ngữ nhanh

| Ký hiệu | Ý nghĩa |
|---------|----------|
| PA-3 | Pipeline điền tên: VP → Lab → HV |
| 5B | Khớp tên từ corpus Lab cùng dòng |
| 6BC | Lọc cụm Hán nhiễu |
| 10A/B/C | Mở rộng hậu tố Việt / entityKind / map category |
| 4B | HV offline tách module |
| 1B/2A/3B | Lab safe chrome, Home, system chrome |

---

## 13. Liên hệ quyết định với chủ sở hữu

Các điểm **đã chốt với user** trong phiên làm việc:

- PA-3 **có** lọc Vietphrase (không chỉ exclude).
- Gỡ CVDICT.
- Hai checkbox refDict tách biệt.
- Lab header: tên Lab Dịch, 2 hàng, safe-area calc.
- Home về màn hình gốc.

Mọi thay đổi **đảo ngược** các điểm trên cần xác nhận user trước.

---

*Tài liệu này bổ sung, không thay thế, đọc code tại `src/` khi implement.*
