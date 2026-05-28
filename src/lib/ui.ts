/**
 * Lớp giao diện thống nhất — tham khảo Kindle mobile:
 * nền giấy, chữ tối giản, viền mảnh, nút có chiều cao cố định, accent teal dịu.
 * Chỉ className — không đổi logic.
 */

/** Shell & layout */
export const uiShell =
  "min-h-screen flex flex-col font-sans antialiased bg-app-bg text-app-text selection:bg-app-accent/20 pb-[env(safe-area-inset-bottom,0px)]";

export const uiHeader =
  "sticky top-0 z-40 shrink-0 px-3 flex items-center justify-between gap-3 border-b border-app-border bg-app-surface/95 backdrop-blur-sm pt-[env(safe-area-inset-top,0px)] min-h-[calc(3rem+env(safe-area-inset-top,0px))]";

export const uiMain = "flex-1 w-full mx-auto min-h-0 flex flex-col custom-scrollbar";

export const uiCard =
  "bg-app-surface border border-app-border rounded-lg shadow-sm transition-colors duration-150 ease-out";

export const uiCardInset =
  "bg-app-surface-muted border border-app-border rounded-lg transition-colors duration-150 ease-out";

/** Typography */
export const uiTitle = "text-base font-semibold text-app-text tracking-tight";

export const uiSubtitle = "text-sm text-app-text-muted leading-relaxed";

export const uiLabel =
  "text-[11px] font-medium uppercase tracking-wide text-app-text-muted";

export const uiCaption = "text-xs text-app-text-muted leading-snug";

/** Buttons — min height + text size tránh tràn */
export const uiBtnBase =
  "inline-flex items-center justify-center gap-1.5 min-h-10 max-w-full px-3 text-sm font-medium rounded-md transition-all duration-150 ease-out cursor-pointer active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/35 focus-visible:ring-offset-1 focus-visible:ring-offset-app-bg disabled:opacity-55 disabled:pointer-events-none disabled:cursor-not-allowed [&[aria-busy='true']]:opacity-75";

export const uiBtnGhost =
  `${uiBtnBase} border border-app-border bg-app-surface text-app-text hover:bg-app-surface-muted`;

export const uiBtnPrimary =
  `${uiBtnBase} border border-app-accent bg-app-accent text-white hover:opacity-90`;

export const uiBtnSecondary =
  `${uiBtnBase} border border-app-border bg-app-surface-muted text-app-text hover:bg-app-border/40`;

export const uiBtnDanger =
  `${uiBtnBase} border border-red-600/30 bg-red-600 text-white hover:bg-red-700`;

/** Inputs */
export const uiInput =
  "w-full min-h-10 px-3 text-sm rounded-md border border-app-border bg-app-surface text-app-text placeholder:text-app-text-muted transition-colors duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-app-accent/35 focus:border-app-accent disabled:opacity-60 disabled:cursor-not-allowed";

/** Menu row (home) */
export const uiMenuRow =
  "w-full min-h-[52px] px-3 py-2 rounded-lg flex items-center gap-3 text-left border border-app-border bg-app-surface hover:bg-app-surface-muted transition-colors cursor-pointer touch-manipulation active:scale-[0.99]";

export const uiMenuRowActive =
  "w-full min-h-[52px] px-3 py-2 rounded-lg flex items-center gap-3 text-left border border-app-accent bg-app-accent text-white shadow-sm transition-colors cursor-pointer";

export const uiIconBox =
  "h-9 w-9 shrink-0 rounded-md flex items-center justify-center bg-app-surface-muted text-app-text-muted border border-app-border";

export const uiIconBoxActive = "h-9 w-9 shrink-0 rounded-md flex items-center justify-center bg-white/20 text-white";

/** Panel (Lab sidebar, VFS, settings sections) */
export const uiPanel =
  "bg-app-surface border border-app-border rounded-lg md:rounded-xl p-4 shadow-sm flex flex-col min-h-0 overflow-hidden";

/** Vùng cuộn nội dung Lab Dịch — giữ flex-1 min-h-0 (không thu nhỏ chiều cao) */
export const uiCompareStage =
  "flex-1 min-h-0 no-callout overflow-y-auto custom-scrollbar border-y md:border border-app-border rounded-none md:rounded-lg bg-app-surface-muted/50 divide-y divide-app-border";

export const uiSegmentedTrack =
  "bg-app-surface-muted p-1 rounded-lg flex border border-app-border text-xs w-full sm:w-auto shrink-0";

export const uiSegmentedBtnActive =
  "flex-1 sm:flex-initial px-3 py-2 min-h-10 rounded-md flex items-center justify-center gap-1.5 text-sm font-medium bg-app-surface text-app-text border border-app-border shadow-sm cursor-pointer";

export const uiSegmentedBtnIdle =
  "flex-1 sm:flex-initial px-3 py-2 min-h-10 rounded-md flex items-center justify-center gap-1.5 text-sm font-medium text-app-text-muted hover:text-app-text cursor-pointer";

export const uiInfoBanner =
  "shrink-0 mb-2 p-3 rounded-lg border border-app-accent/30 bg-app-accent/10 text-app-text text-xs leading-relaxed flex items-start justify-between gap-3";

export const uiInlineFeedbackBase =
  "rounded-md border px-3 py-2 text-[11px] leading-relaxed";

export const uiInlineFeedbackInfo =
  `${uiInlineFeedbackBase} border-app-accent/25 bg-app-accent/10 text-app-text`;

export const uiInlineFeedbackSuccess =
  `${uiInlineFeedbackBase} border-emerald-600/25 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300`;

export const uiInlineFeedbackWarning =
  `${uiInlineFeedbackBase} border-amber-600/25 bg-amber-600/10 text-amber-700 dark:text-amber-300`;

export const uiInlineFeedbackDanger =
  `${uiInlineFeedbackBase} border-red-600/25 bg-red-600/10 text-red-700 dark:text-red-300`;

export const uiSafeTopChrome = "pt-[max(env(safe-area-inset-top,0px),28px)]";
export const uiSafeBottomChrome = "pb-[max(env(safe-area-inset-bottom,0px),12px)]";

/** Khối trang shell (tab nội dung) */
export const uiPageRoot =
  "bg-transparent border-0 rounded-none p-0 md:p-3 shadow-none overflow-hidden flex flex-col h-full animate-fade-in";

export const uiPageHeader =
  "flex flex-col md:flex-row md:items-center justify-between border-b border-app-border pb-4 gap-4";

export const uiIconHeader =
  "p-2.5 bg-app-accent/10 text-app-accent rounded-lg shrink-0";

export const uiSection =
  "bg-app-surface-muted/80 p-4 border-y md:border border-app-border rounded-none md:rounded-lg space-y-4 shadow-sm";

export const uiFieldLabel =
  "block text-[11px] text-app-text-muted mb-1 font-bold uppercase tracking-wider";

export const uiBannerHero =
  "bg-gradient-to-r from-app-accent to-app-accent-hover text-white p-6 rounded-lg border border-app-border shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4";

export const uiToggleTrack =
  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none";

export const uiToggleTrackOn = "bg-app-accent";

export const uiToggleTrackOff = "bg-app-surface-muted";

export const uiToggleThumb =
  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-app-surface shadow-sm ring-0 transition duration-200 ease-in-out";
