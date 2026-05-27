import React, { useMemo, useState } from "react";
import {
  GripVertical,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  ListFilter,
  RefreshCw,
  Info,
} from "lucide-react";
import { CHAPTER_RULES_CATALOG_BY_ID } from "../utils/chapterRulesCatalog";
import {
  type ChapterRuleState,
  mergeChapterRuleStates,
  resolveChapterRules,
  previewRulesOnText,
  createCustomChapterRule,
  resetBuiltinRule,
} from "../utils/chapterRulesEngine";
import {
  uiCard,
  uiCardInset,
  uiCaption,
  uiFieldLabel,
  uiInput,
  uiBtnPrimary,
  uiBtnGhost,
  uiBtnDanger,
  uiLabel,
} from "../lib/ui";

interface ChapterRulesPanelProps {
  ruleStates: ChapterRuleState[];
  onRuleStatesChange: (next: ChapterRuleState[]) => void;
  sourceRawText?: string;
  onApplyRules?: () => void;
  loading?: boolean;
  compact?: boolean;
}

export default function ChapterRulesPanel({
  ruleStates,
  onRuleStatesChange,
  sourceRawText = "",
  onApplyRules,
  loading = false,
  compact = false,
}: ChapterRulesPanelProps) {
  const merged = useMemo(() => mergeChapterRuleStates(ruleStates), [ruleStates]);
  const resolved = useMemo(() => resolveChapterRules(merged), [merged]);
  const enabledCount = resolved.filter((r) => r.enabled).length;
  const errorCount = resolved.filter((r) => r.enabled && r.compileError).length;

  const preview = useMemo(() => {
    if (!sourceRawText.trim()) return null;
    return previewRulesOnText(sourceRawText, merged);
  }, [sourceRawText, merged]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftRegex, setDraftRegex] = useState("");
  const [draftExample, setDraftExample] = useState("");

  const openEdit = (id: string) => {
    const row = resolved.find((r) => r.id === id);
    if (!row) return;
    setEditingId(id);
    setDraftName(row.name);
    setDraftRegex(row.regex);
    setDraftExample(row.example);
  };

  const closeEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId) return;
    const row = resolved.find((r) => r.id === editingId);
    if (!row) return;

    if (row.builtIn) {
      onRuleStatesChange(merged);
      closeEdit();
      return;
    }

    onRuleStatesChange(
      merged.map((s) =>
        s.id === editingId
          ? {
              ...s,
              name: draftName.trim() || "Quy tắc tùy chỉnh",
              regex: draftRegex,
              example: draftExample,
            }
          : s
      )
    );
    closeEdit();
  };

  const toggleRule = (id: string) => {
    onRuleStatesChange(
      merged.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s))
    );
  };

  const removeRule = (id: string) => {
    if (CHAPTER_RULES_CATALOG_BY_ID[id]) return;
    onRuleStatesChange(merged.filter((s) => s.id !== id).map((s, i) => ({ ...s, order: i })));
  };

  const moveRule = (id: string, dir: -1 | 1) => {
    const idx = merged.findIndex((s) => s.id === id);
    if (idx < 0) return;
    const next = idx + dir;
    if (next < 0 || next >= merged.length) return;
    const copy = [...merged];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    onRuleStatesChange(copy.map((s, i) => ({ ...s, order: i })));
  };

  const addCustomRule = () => {
    const custom = createCustomChapterRule();
    onRuleStatesChange([...merged, { ...custom, order: merged.length }]);
    openEdit(custom.id);
  };

  const resetDefaults = () => {
    onRuleStatesChange(mergeChapterRuleStates(null));
  };

  return (
    <div className={`${uiCard} overflow-hidden`}>
      <div className="px-3 py-3 border-b border-app-border bg-app-surface-muted/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0">
          <ListFilter className="w-5 h-5 text-app-accent shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h4 className={`${uiLabel} normal-case text-app-text`}>Quy tắc tách chương (mục lục)</h4>
            <p className={`${uiCaption} mt-0.5`}>
              Bật/tắt từng regex — dòng khớp <strong>bất kỳ</strong> rule đang bật sẽ là tiêu đề chương.
              Đang bật: <span className="text-app-accent font-bold">{enabledCount}</span>
              {errorCount > 0 && (
                <span className="text-red-500 font-bold"> · {errorCount} lỗi regex</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
          <button type="button" onClick={resetDefaults} className={`${uiBtnGhost} h-8 px-2.5 text-[10px] font-bold`}>
            Mặc định
          </button>
          {onApplyRules && (
            <button
              type="button"
              onClick={onApplyRules}
              disabled={loading || !sourceRawText.trim() || enabledCount === 0}
              className={`${uiBtnPrimary} h-8 px-3 text-[10px] font-bold`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Áp dụng
            </button>
          )}
        </div>
      </div>

      {preview && sourceRawText.trim() && (
        <div className="px-3 py-2 bg-app-accent/8 border-b border-app-border text-[10px] leading-relaxed">
          <span className="font-bold text-app-accent">Xem trước:</span>{" "}
          {preview.matchCount} dòng khớp ({preview.enabledCount} rule đang bật)
          {preview.samples.length > 0 && (
            <span className="block mt-1 text-app-text-muted font-mono truncate">
              VD: {preview.samples.join(" · ")}
            </span>
          )}
        </div>
      )}

      <div className={`${compact ? "max-h-[280px]" : "max-h-[min(52vh,420px)]"} overflow-y-auto custom-scrollbar divide-y divide-app-border`}>
        {resolved.map((rule) => (
          <div
            key={rule.id}
            className={`px-2 py-2.5 flex gap-2 items-start ${
              rule.enabled ? "bg-app-surface" : "bg-app-surface-muted/40 opacity-90"
            }`}
          >
            <div className="flex flex-col items-center gap-0.5 shrink-0 pt-1">
              <GripVertical className="w-4 h-4 text-app-text-muted/50" />
              <button
                type="button"
                onClick={() => moveRule(rule.id, -1)}
                className="p-0.5 text-app-text-muted hover:text-app-accent"
                aria-label="Lên"
              >
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => moveRule(rule.id, 1)}
                className="p-0.5 text-app-text-muted hover:text-app-accent"
                aria-label="Xuống"
              >
                <ChevronDown className="w-3.5 h-3.5" />
              </button>
            </div>

            <button
              type="button"
              onClick={() => openEdit(rule.id)}
              className="flex-1 min-w-0 text-left rounded-md px-1 py-0.5 hover:bg-app-surface-muted transition-colors"
            >
              <div className="text-xs font-bold text-app-text truncate">{rule.name}</div>
              <div className="text-[9px] font-mono text-app-text-muted truncate mt-0.5" title={rule.regex}>
                {rule.regex.slice(0, 72)}
                {rule.regex.length > 72 ? "…" : ""}
              </div>
              <div className={`${uiCaption} text-[9px] truncate mt-0.5`}>{rule.example}</div>
              {rule.enabled && rule.compileError && (
                <div className="text-[9px] text-red-500 mt-0.5">{rule.compileError}</div>
              )}
            </button>

            <div className="flex flex-col items-center gap-2 shrink-0">
              {!rule.builtIn && (
                <button
                  type="button"
                  onClick={() => removeRule(rule.id)}
                  className="p-1 text-red-500 hover:bg-red-500/10 rounded-md"
                  aria-label="Xóa"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                role="switch"
                aria-checked={rule.enabled}
                onClick={() => toggleRule(rule.id)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                  rule.enabled ? "bg-app-accent" : "bg-app-border"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                    rule.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-app-border flex justify-end">
        <button type="button" onClick={addCustomRule} className={`${uiBtnGhost} h-9 px-3 text-xs font-bold gap-1.5`}>
          <Plus className="w-4 h-4" />
          Thêm quy tắc
        </button>
      </div>

      {editingId && (
        <div className="fixed inset-0 z-[220] bg-black/45 flex items-end sm:items-center justify-center p-3 sm:p-6">
          <div className={`${uiCard} w-full max-w-lg max-h-[90vh] overflow-y-auto custom-scrollbar shadow-xl`}>
            <div className="px-4 py-3 border-b border-app-border">
              <h3 className="text-base font-bold text-app-text">Quy tắc</h3>
              {resolved.find((r) => r.id === editingId)?.builtIn && (
                <p className={`${uiCaption} mt-1 flex items-start gap-1`}>
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  Rule tích hợp — chỉ xem; dùng «Mặc định» để khôi phục bộ rule gốc.
                </p>
              )}
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className={uiFieldLabel}>Tên</label>
                <input
                  className={uiInput}
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  readOnly={!!resolved.find((r) => r.id === editingId)?.builtIn}
                />
              </div>
              <div>
                <label className={uiFieldLabel}>Quy tắc (regex)</label>
                <textarea
                  className={`${uiInput} font-mono text-[11px] min-h-[88px]`}
                  value={draftRegex}
                  onChange={(e) => setDraftRegex(e.target.value)}
                  readOnly={!!resolved.find((r) => r.id === editingId)?.builtIn}
                />
              </div>
              <div>
                <label className={uiFieldLabel}>Ví dụ</label>
                <input
                  className={uiInput}
                  value={draftExample}
                  onChange={(e) => setDraftExample(e.target.value)}
                  readOnly={!!resolved.find((r) => r.id === editingId)?.builtIn}
                />
              </div>
              {resolved.find((r) => r.id === editingId)?.builtIn && editingId && (
                <button
                  type="button"
                  className={`${uiBtnGhost} w-full text-xs`}
                  onClick={() => {
                    const def = resetBuiltinRule(editingId);
                    if (def) {
                      setDraftName(def.name);
                      setDraftRegex(def.regex);
                      setDraftExample(def.example);
                    }
                  }}
                >
                  Khôi phục nội dung mặc định rule này
                </button>
              )}
            </div>
            <div className="px-4 py-3 border-t border-app-border flex justify-end gap-2">
              <button type="button" onClick={closeEdit} className={`${uiBtnGhost} h-10 px-4 text-sm font-bold`}>
                Hủy
              </button>
              {!resolved.find((r) => r.id === editingId)?.builtIn && (
                <button type="button" onClick={saveEdit} className={`${uiBtnPrimary} h-10 px-4 text-sm font-bold`}>
                  Lưu
                </button>
              )}
              {resolved.find((r) => r.id === editingId)?.builtIn && (
                <button type="button" onClick={closeEdit} className={`${uiBtnPrimary} h-10 px-4 text-sm font-bold`}>
                  Đóng
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
