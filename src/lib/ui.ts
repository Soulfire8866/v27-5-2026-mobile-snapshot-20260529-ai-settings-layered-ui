/**
 * Lớp giao diện thống nhất — tham khảo Kindle mobile:
 * nền giấy, chữ tối giản, viền mảnh, nút có chiều cao cố định, accent teal dịu.
 * Chỉ className — không đổi logic.
 */

/** Shell & layout */
export const uiShell =
  "min-h-screen flex flex-col font-sans antialiased bg-app-bg text-app-text selection:bg-app-accent/20 pb-[env(safe-area-inset-bottom,0px)]";

export const uiHeader =
  "sticky top-0 z-40 shrink-0 px-3 md:px-4 flex items-center justify-between gap-3 border-b border-app-border/85 bg-app-surface/90 backdrop-blur-xl shadow-[0_1px_0_rgba(0,0,0,0.04)] dark:shadow-[0_1px_0_rgba(255,255,255,0.04)] pt-[env(safe-area-inset-top,0px)] min-h-[calc(3.25rem+env(safe-area-inset-top,0px))]";

export const uiMain = "flex-1 w-full mx-auto min-h-0 flex flex-col custom-scrollbar";

export const uiCard =
  "bg-app-surface border border-app-border rounded-xl app-elevated-surface transition-all duration-150 ease-out";

export const uiCardInset =
  "bg-app-surface-muted/85 border border-app-border rounded-xl transition-all duration-150 ease-out";

/** Typography */
export const uiTitle = "text-[15px] md:text-base font-semibold text-app-text tracking-tight leading-snug";

export const uiSubtitle = "text-sm text-app-text-muted leading-relaxed";

export const uiLabel =
  "text-[11px] font-semibold uppercase tracking-[0.08em] text-app-text-muted";

export const uiCaption = "text-xs text-app-text-muted leading-snug";

/** Buttons — min height + text size tránh tràn */
export const uiBtnBase =
  "app-pressable inline-flex items-center justify-center gap-1.5 min-h-10 max-w-full px-3.5 text-sm font-medium rounded-lg transition-all duration-150 ease-out cursor-pointer active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-app-bg disabled:opacity-50 disabled:pointer-events-none disabled:cursor-not-allowed [&[aria-busy='true']]:opacity-75 shadow-[0_1px_0_rgba(255,255,255,0.35)] dark:shadow-none";

export const uiBtnGhost =
  `${uiBtnBase} border border-app-border bg-app-surface text-app-text hover:bg-app-surface-muted hover:border-app-border/80`;

export const uiBtnPrimary =
  `${uiBtnBase} border border-app-accent bg-app-accent text-white shadow-[0_2px_10px_rgba(15,118,110,0.26)] hover:bg-app-accent-hover hover:shadow-[0_4px_14px_rgba(15,118,110,0.28)]`;

export const uiBtnSecondary =
  `${uiBtnBase} border border-app-border bg-app-surface-muted text-app-text hover:bg-app-border/35`;

export const uiBtnDanger =
  `${uiBtnBase} border border-red-600/35 bg-red-600 text-white shadow-[0_2px_10px_rgba(220,38,38,0.22)] hover:bg-red-700`;

/** Inputs */
export const uiInput =
  "w-full min-h-10 px-3.5 text-sm rounded-lg border border-app-border bg-app-surface text-app-text placeholder:text-app-text-muted/90 transition-all duration-150 ease-out focus:outline-none focus:ring-2 focus:ring-app-accent/30 focus:ring-offset-1 focus:ring-offset-app-bg focus:border-app-accent disabled:opacity-60 disabled:cursor-not-allowed";

/** Menu row (home) */
export const uiMenuRow =
  "app-pressable w-full min-h-[56px] px-3.5 py-2.5 rounded-xl flex items-center gap-3.5 text-left border border-app-border bg-app-surface hover:bg-app-surface-muted/90 hover:border-app-border/80 transition-all cursor-pointer touch-manipulation active:scale-[0.99]";

export const uiMenuRowActive =
  "app-pressable w-full min-h-[56px] px-3.5 py-2.5 rounded-xl flex items-center gap-3.5 text-left border border-app-accent bg-app-accent text-white shadow-[0_4px_14px_rgba(15,118,110,0.28)] transition-all cursor-pointer";

export const uiIconBox =
  "h-9 w-9 shrink-0 rounded-lg flex items-center justify-center bg-app-surface-muted text-app-text-muted border border-app-border transition-transform duration-150 ease-out group-hover:scale-105";

export const uiIconBoxActive = "h-9 w-9 shrink-0 rounded-md flex items-center justify-center bg-white/20 text-white";

/** Panel (Lab sidebar, VFS, settings sections) */
export const uiPanel =
  "bg-app-surface border border-app-border rounded-xl p-4 md:p-5 shadow-[0_1px_2px_rgba(17,24,39,0.05),0_10px_24px_rgba(17,24,39,0.06)] dark:shadow-[0_1px_2px_rgba(0,0,0,0.35),0_12px_24px_rgba(0,0,0,0.24)] flex flex-col min-h-0 overflow-hidden";

/** Vùng cuộn nội dung Lab Dịch — giữ flex-1 min-h-0 (không thu nhỏ chiều cao) */
export const uiCompareStage =
  "flex-1 min-h-0 no-callout overflow-y-auto custom-scrollbar border-y md:border border-app-border rounded-none md:rounded-xl bg-app-surface-muted/55 divide-y divide-app-border";

export const uiSegmentedTrack =
  "bg-app-surface-muted p-1 rounded-xl flex border border-app-border text-xs w-full sm:w-auto shrink-0";

export const uiSegmentedBtnActive =
  "flex-1 sm:flex-initial px-3 py-2 min-h-10 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium bg-app-surface text-app-text border border-app-border shadow-[0_1px_2px_rgba(17,24,39,0.08)] cursor-pointer";

export const uiSegmentedBtnIdle =
  "flex-1 sm:flex-initial px-3 py-2 min-h-10 rounded-lg flex items-center justify-center gap-1.5 text-sm font-medium text-app-text-muted hover:text-app-text hover:bg-app-surface/60 cursor-pointer";

export const uiInfoBanner =
  "shrink-0 mb-2 p-3 rounded-lg border border-app-accent/30 bg-app-accent/10 text-app-text text-xs leading-relaxed flex items-start justify-between gap-3";

export const uiInlineFeedbackBase =
  "rounded-lg border px-3.5 py-2.5 text-[11px] leading-relaxed";

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
  "bg-app-surface-muted/80 p-4 md:p-5 border-y md:border border-app-border rounded-none md:rounded-xl space-y-4 shadow-[0_1px_2px_rgba(17,24,39,0.05)]";

export const uiFieldLabel =
  "block text-[11px] text-app-text-muted mb-1 font-bold uppercase tracking-wider";

export const uiBannerHero =
  "bg-gradient-to-r from-app-accent to-app-accent-hover text-white p-5 md:p-6 rounded-xl border border-app-border shadow-[0_8px_20px_rgba(15,118,110,0.26)] flex flex-col md:flex-row md:items-center justify-between gap-4";

export const uiTabPill =
  "app-pressable app-tab-pill inline-flex items-center justify-center min-h-9 px-3 text-xs font-semibold uppercase tracking-wide";

export const uiTabPillActive = `${uiTabPill} data-[active=true]:font-bold`;

export const uiToggleTrack =
  "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none";

export const uiToggleTrackOn = "bg-app-accent";

export const uiToggleTrackOff = "bg-app-surface-muted";

export const uiToggleThumb =
  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-app-surface shadow-sm ring-0 transition duration-200 ease-in-out";
