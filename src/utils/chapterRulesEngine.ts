/**
 * Engine: bật/tắt rule, biên dịch regex, tách chương theo dòng khớp bất kỳ rule đang bật.
 */

import {
  CHAPTER_RULES_CATALOG,
  CHAPTER_RULES_CATALOG_BY_ID,
  type ChapterRuleDefinition,
} from "./chapterRulesCatalog";
import type { ChapterParseResult, ParsedChapterDraft } from "./chapterParser";

function countContentChars(text: string): number {
  return text.replace(/[\s\r\n\u3000]/g, "").length;
}

export interface ChapterRuleState {
  id: string;
  enabled: boolean;
  order: number;
  /** Chỉ với rule tùy chỉnh (builtIn: false) */
  name?: string;
  regex?: string;
  example?: string;
}

export interface ResolvedChapterRule {
  id: string;
  name: string;
  regex: string;
  example: string;
  enabled: boolean;
  order: number;
  builtIn: boolean;
  compiled?: RegExp;
  compileError?: string;
}

const FALSE_CHAPTER_PREFIX =
  /^第[0-9０-９一二三四五六七八九十百千万零两〇壹贰叁肆伍陆柒捌玖拾佰仟]{0,6}(?:次|天|年|招|式|关|层|步|场|句|声|刀|拳|指|遍|趟|轮|波|击|段|种|件|条|项|名|位|个|只|把)/u;

/** Dòng văn xuôi — rule「书名 序号」dễ khớp nhầm nếu không lọc thêm */
const NARRATIVE_BODY_MARKERS =
  /(?:说道|问道|笑道|运转|低声|沉声|望着|窗前|绽放|抱拳|掌心|目光|冷笑|厉声|不禁|忍不住|只见|此时|忽然|已经|缓缓|微微|奔涌|演武|长老|弟子)/u;

export function createDefaultChapterRuleStates(): ChapterRuleState[] {
  return CHAPTER_RULES_CATALOG.map((r, index) => ({
    id: r.id,
    enabled: r.enabledByDefault,
    order: index,
  }));
}

export function mergeChapterRuleStates(saved?: ChapterRuleState[] | null): ChapterRuleState[] {
  const defaults = createDefaultChapterRuleStates();
  if (!saved?.length) return defaults;

  const byId = new Map(saved.map((s) => [s.id, s]));
  const merged: ChapterRuleState[] = [];

  for (const def of CHAPTER_RULES_CATALOG) {
    const s = byId.get(def.id);
    merged.push({
      id: def.id,
      enabled: s?.enabled ?? def.enabledByDefault,
      order: s?.order ?? merged.length,
    });
    byId.delete(def.id);
  }

  const customs = [...byId.values()].filter((s) => !CHAPTER_RULES_CATALOG_BY_ID[s.id]);
  for (const c of customs.sort((a, b) => a.order - b.order)) {
    merged.push({ ...c });
  }

  return merged.sort((a, b) => a.order - b.order).map((s, i) => ({ ...s, order: i }));
}

function compileRuleRegex(source: string): { regex?: RegExp; error?: string } {
  const trimmed = source.trim();
  if (!trimmed) return { error: "Regex trống." };
  try {
    return { regex: new RegExp(trimmed, "u") };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Regex không hợp lệ." };
  }
}

export function resolveChapterRules(states: ChapterRuleState[]): ResolvedChapterRule[] {
  const ordered = [...states].sort((a, b) => a.order - b.order);

  return ordered.map((state) => {
    const builtin = CHAPTER_RULES_CATALOG_BY_ID[state.id];
    if (builtin) {
      const { regex, error } = compileRuleRegex(builtin.regex);
      return {
        id: builtin.id,
        name: builtin.name,
        regex: builtin.regex,
        example: builtin.example,
        enabled: state.enabled,
        order: state.order,
        builtIn: true,
        compiled: regex,
        compileError: error,
      };
    }

    const name = state.name?.trim() || "Quy tắc tùy chỉnh";
    const regexSrc = state.regex?.trim() || "";
    const { regex, error } = compileRuleRegex(regexSrc);
    return {
      id: state.id,
      name,
      regex: regexSrc,
      example: state.example?.trim() || "",
      enabled: state.enabled,
      order: state.order,
      builtIn: false,
      compiled: regex,
      compileError: error,
    };
  });
}

export function getActiveCompiledRules(resolved: ResolvedChapterRule[]): ResolvedChapterRule[] {
  return resolved.filter((r) => r.enabled && r.compiled && !r.compileError);
}

export function isLineChapterHeaderByRules(line: string, activeRules: ResolvedChapterRule[]): boolean {
  const t = line.trim();
  if (!t || t.length > 200) return false;
  if (FALSE_CHAPTER_PREFIX.test(t)) return false;

  for (const rule of activeRules) {
    if (!rule.compiled?.test(t)) continue;

    if (rule.id === "book-title-num") {
      if (t.length > 48 || NARRATIVE_BODY_MARKERS.test(t) || /[《》「」『』]/.test(t)) {
        continue;
      }
      if (!/(?:章|节|卷|回|话|集|部|篇)/.test(t) && /[，,].{8,}[，,]/.test(t)) {
        continue;
      }
    }

    if (rule.id === "book-title-paren-num" && (t.length > 52 || NARRATIVE_BODY_MARKERS.test(t))) {
      continue;
    }

    return true;
  }
  return false;
}

function splitByRules(
  rawText: string,
  activeRules: ResolvedChapterRule[]
): ParsedChapterDraft[] {
  const lines = rawText.split(/\r?\n/);
  const chapters: ParsedChapterDraft[] = [];
  let currentName = "";
  let currentLines: string[] = [];

  const flush = () => {
    const text = currentLines.join("\n").trim();
    const title = currentName.trim() || "Lời mở đầu / Prologue";
    chapters.push({ originalName: title, text });
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isLineChapterHeaderByRules(line, activeRules)) {
      if (currentName || currentLines.length > 0) flush();
      currentName = line.trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentName || currentLines.length > 0) flush();
  return chapters;
}

export function parseChaptersWithRules(
  rawText: string,
  ruleStates?: ChapterRuleState[] | null
): ChapterParseResult & { usedRules: boolean; enabledRuleCount: number; ruleErrors: string[] } {
  const normalized = rawText.replace(/\uFEFF/g, "").replace(/\r\n/g, "\n");
  const merged = mergeChapterRuleStates(ruleStates);
  const resolved = resolveChapterRules(merged);
  const active = getActiveCompiledRules(resolved);
  const ruleErrors = resolved
    .filter((r) => r.enabled && r.compileError)
    .map((r) => `${r.name}: ${r.compileError}`);

  if (active.length === 0) {
    return {
      chapters: [
        { originalName: "Toàn bộ tác phẩm / Toàn văn", text: normalized.trim() },
      ],
      stats: {
        totalDetected: 0,
        emptyBeforeCleanup: 0,
        emptyAfterCleanup: 0,
        usedStrictMode: false,
        usedRuleEngine: true,
        enabledRuleCount: 0,
      },
      usedRules: true,
      enabledRuleCount: 0,
      ruleErrors,
    };
  }

  const draft = splitByRules(normalized, active);
  let chapters = draft.length > 0 ? draft : [];

  if (chapters.length === 0) {
    chapters = [{ originalName: "Toàn bộ tác phẩm / Toàn văn", text: normalized.trim() }];
  }

  const emptyBefore = chapters.filter((c) => countContentChars(c.text) < 40).length;
  const emptyAfter = emptyBefore;

  return {
    chapters,
    stats: {
      totalDetected: draft.length,
      emptyBeforeCleanup: emptyBefore,
      emptyAfterCleanup: emptyAfter,
      usedStrictMode: false,
      usedRuleEngine: true,
      enabledRuleCount: active.length,
    },
    usedRules: true,
    enabledRuleCount: active.length,
    ruleErrors,
  };
}

export function previewRulesOnText(
  rawText: string,
  ruleStates: ChapterRuleState[],
  maxSamples = 8
): { matchCount: number; samples: string[]; enabledCount: number } {
  const normalized = rawText.replace(/\uFEFF/g, "").replace(/\r\n/g, "\n");
  const lines = normalized.split(/\n/);
  const active = getActiveCompiledRules(resolveChapterRules(mergeChapterRuleStates(ruleStates)));
  const samples: string[] = [];
  let matchCount = 0;

  for (const line of lines) {
    if (isLineChapterHeaderByRules(line, active)) {
      matchCount++;
      if (samples.length < maxSamples) samples.push(line.trim().slice(0, 80));
    }
  }

  return { matchCount, samples, enabledCount: active.length };
}

export function createCustomChapterRule(): ChapterRuleState {
  return {
    id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    order: 999,
    name: "Quy tắc mới",
    regex: "^第\\s*[0-9一二三四五六七八九十]+\\s*章.{0,40}$",
    example: "第一章  ví dụ",
  };
}

export function resetBuiltinRule(id: string): ChapterRuleDefinition | undefined {
  return CHAPTER_RULES_CATALOG_BY_ID[id];
}
