/**
 * Log nội bộ mức dịch (2A) — theo dõi token / retry / chunk trên console.
 */

export type TranslationTelemetryEvent =
  | "chapter_start"
  | "chapter_done"
  | "chapter_error"
  | "auto_next_start"
  | "auto_next_done"
  | "auto_next_skip";

export function logTranslationTelemetry(
  event: TranslationTelemetryEvent,
  meta: Record<string, unknown>
): void {
  const payload = {
    ts: new Date().toISOString(),
    event,
    ...meta,
  };
  if (typeof console !== "undefined") {
    console.info("[translation]", payload);
  }
}
