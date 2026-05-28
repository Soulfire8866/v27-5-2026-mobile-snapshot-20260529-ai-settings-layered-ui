# UI/UX Micro Polish Spec (Phase 1)

Tài liệu này khóa chuẩn vi mô để nâng độ hoàn thiện thị giác và tính nhất quán UX.

## 1) Spacing & control scale (1B)

- Grid spacing chuẩn: `4 / 8 / 12 / 16 / 24`.
- Input/select/button mặc định: `min-h-10`.
- CTA chính ở card thao tác: ưu tiên `min-h-10` hoặc `min-h-11`.
- Header/section không trộn ngẫu nhiên nhiều cỡ chữ; giữ 3 nấc: `title`, `label`, `caption`.

## 2) CTA hierarchy + microcopy (2A + 2B)

- Mỗi card chỉ nên có 1 nút primary rõ ràng.
- Cặp hành động dùng chuẩn động từ:
  - `Tải` (download/export)
  - `Nạp` (import/load)
  - `Lưu` (save)
  - `Khôi phục` (restore)
  - `Gỡ` (remove from list, no physical delete)
  - `Xóa` (destructive, physical delete/data delete)

## 3) State spec cho controls (3B)

- Button:
  - hover/active/focus-visible thống nhất từ `uiBtnBase`.
  - disabled phải giảm opacity + chặn pointer.
  - loading nên dùng `aria-busy='true'` + copy trạng thái (`Đang ...`).
- Input:
  - ring/focus border rõ và nhất quán.
- Action list row:
  - hover nền nhẹ, không đổi layout.

## 4) Inline feedback theo ngữ cảnh (4B)

- Tránh chỉ dựa vào alert popup.
- Mỗi màn chức năng có 1 vùng phản hồi inline:
  - info: đang xử lý
  - success: hoàn tất
  - warning: cần user chỉnh input/chọn đúng luồng
  - danger: lỗi thao tác

## 5) Information architecture mobile (5B)

- Chức năng cơ bản hiển thị mặc định.
- Chức năng kỹ thuật nâng cao tách màn phụ hoặc vùng mở rộng.
- Không để card dài và nhiều thao tác chính cạnh tranh trên cùng viewport nhỏ.

## 6) Typography polish (6A + 6B)

- Label dùng uppercase nhẹ cho nhóm kỹ thuật.
- Caption ưu tiên ngắn gọn, tránh câu dài > 2 dòng trên mobile.
- Path/ID dài dùng truncation, giữ thông tin quan trọng ở cuối/tên file.

## 7) Safe-area baseline (7B)

- Mọi bề mặt full-screen/modal top-chrome dùng class chuẩn:
  - `.app-chrome-safe-top`
  - `.app-chrome-safe-bottom`
- Không hardcode top/bottom tuyệt đối cho phần chrome nếu không có lý do đặc thù.

## 8) Motion vi mô (8B)

- Transition mặc định: `150ms ease-out`.
- Modal xuất hiện: fade/scale nhẹ, không hiệu ứng phô.
- Không dùng motion gây trễ thao tác (ưu tiên cảm giác responsive).

## Scope đã áp ở đợt này

- `StoryLibrary` (Library tools modal): safe-area baseline + inline feedback + CTA clarity.
- `VFSManager`: editor safety + inline feedback + hierarchy/action clarity.
- `ui.ts`: state behavior nền cho button/input/card.
