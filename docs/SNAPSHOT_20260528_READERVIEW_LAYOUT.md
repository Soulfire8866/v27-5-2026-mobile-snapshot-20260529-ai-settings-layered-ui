# Snapshot 2026-05-28 - ReaderView Layout Overhaul

## Scope

- ReaderView page-mode layout refactor for Android WebView rendering issues.
- Integer quantization for line-height and page height calculations.
- Overlay menu architecture stabilization (top/bottom bars do not resize text stage).
- Slider fill-level range extended to 100%.

## Key Files Updated

- `src/components/ReaderView.tsx`
- `src/utils/readerPageLayout.ts`
- `src/utils/readerDomPagination.ts`
- `src/index.css`
- `src/App.tsx`
- `scripts/qa-user-scenarios.mjs`

## Technical Notes

- Page wrapper uses safe-area-based fixed anchoring on page mode.
- Pagination math uses integer line-height (`Math.round(fontSize * lineHeightRatio)`).
- Page content height uses a safety buffer (`+2px`) to reduce Blink fragmentation/cut-off.
- Column container enforces `display:block`, `column-fill:auto`, `overflow:hidden`.
- Paragraphs are normalized with zero margin/padding, justify, and orphan/widow guards.

## Validation Status

- TypeScript check passed (`npx tsc --noEmit`).
- QA script passed (`npm run qa`).

## Intent

This snapshot preserves the current ReaderView layout iteration before migrating backup/export file writes to Android native save APIs.
