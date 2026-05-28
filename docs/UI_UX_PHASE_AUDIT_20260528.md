# UI/UX Phase Audit — 2026-05-28

## Mục tiêu audit

Xác nhận các đợt nâng cấp UI/UX vi mô không làm hỏng chức năng thiết kế, không gây conflict, không vô hiệu hóa các luồng chính.

## Phạm vi thay đổi đã audit

- `src/lib/ui.ts`
- `src/index.css`
- `src/components/StoryLibrary.tsx`
- `src/components/VFSManager.tsx`
- `src/components/SettingsTab.tsx`
- `src/App.tsx`

## Gate kỹ thuật

- `npm run lint` ✅ pass
- `npm run build` ✅ pass
- `npx cap sync android` ✅ pass
- `npm run qa` ⚠ smoke pass, nhưng fail ở bước script Node do `indexedDB is not defined` (môi trường Node không có IndexedDB runtime)

## Kết quả smoke (QA script)

- Reader lazy chunk check: ✅
- Dist assets check: ✅
- Android public assets after `cap sync`: ✅
- Cảnh báo còn lại:
  - preload ReaderView sớm (khuyến nghị kỹ thuật, không phải fail)
  - bundle chính còn lớn (khuyến nghị hiệu năng, không phải fail)

## Regression checklist theo chức năng

### 1) Thư Viện
- Mở `Bảng điều khiển Thư Viện`: ✅
- Header/modal không chèn status bar (safe-area): ✅
- Xuất ebook các định dạng: ✅ (không đổi logic export)
- Sao lưu/Nạp data dịch trong modal: ✅ (thêm inline feedback, không đổi luồng)

### 2) Sao lưu & Khôi phục (VFS)
- Tạo snapshot trong máy: ✅
- Khôi phục snapshot: ✅
- Tải ZIP cấu hình nhẹ / Nạp ZIP: ✅
- Quản lý file đã xuất: Xóa file vật lý + Gỡ khỏi danh sách: ✅
- Xem & Sửa Từng File:
  - search tree: ✅
  - validate JSON: ✅
  - cảnh báo unsaved (nội bộ + beforeunload): ✅

### 3) Cấu hình
- Nhập API keys đa dòng: ✅
- Chọn model/provider: ✅
- Điều chỉnh tham số dịch (temperature/max threads): ✅
- Prompt directives: ✅

### 4) App-level modal/dialog
- Alert/Confirm/Import prompt/Model popup: ✅
- Safe-area top/bottom cho card modal: ✅
- Không thay đổi logic xử lý xác nhận hành động: ✅

## Đánh giá rủi ro hiện tại

- Rủi ro thấp cho logic nghiệp vụ (đợt này chủ yếu UI state + feedback layer).
- Rủi ro trung bình cho trải nghiệm nếu có màn mới chưa áp `app-chrome-safe-top/bottom`.
- Không phát hiện thay đổi làm mất chức năng cốt lõi qua các gate hiện có.

## Hành động tiếp theo (khuyến nghị)

1. Duy trì gate: `lint + build + cap sync + smoke` cho mỗi đợt.
2. Tách một đợt tối ưu hiệu năng bundle chính (không trộn với đợt polish UI).
3. Áp chuẩn safe-area + inline feedback cho các modal mới phát sinh.

---

## Cập nhật đợt hardening kế tiếp (same day)

### Bổ sung phạm vi

- `src/components/DictManager.tsx`

### Nâng cấp đã áp

- Thêm `role="dialog"` + `aria-modal="true"` cho các modal chính trong:
  - `App.tsx`
  - `StoryLibrary.tsx`
  - `DictManager.tsx`
- Chuẩn hóa safe-area top/bottom cho modal xóa truyện và popup từ điển.
- Chuẩn hóa nút đóng popup trong `DictManager` về `uiBtnGhost` để đồng nhất behavior trạng thái.
- Rà và làm sạch thêm microcopy trong `SettingsTab`.

### Gate kỹ thuật (đợt bổ sung)

- `npm run lint` ✅ pass
- `npm run build` ✅ pass
- `npx cap sync android` ✅ pass
- `npm run qa` ⚠ smoke pass; vẫn dừng ở script Node do `indexedDB is not defined` (không phải regression UI)

### Kết luận rủi ro đợt bổ sung

- Không phát hiện conflict chức năng cốt lõi qua gate hiện có.
- Tác động nghiệp vụ thấp; thay đổi tập trung accessibility + safe-area + consistency.
