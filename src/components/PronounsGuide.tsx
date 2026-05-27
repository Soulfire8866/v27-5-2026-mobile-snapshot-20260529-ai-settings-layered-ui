import React, { useState } from "react";
import { Search, CheckCircle2, Copy, BookOpen, Plus, Trash2, ShieldAlert } from "lucide-react";
import { PronounMapping } from "../types";
import {
  uiPageRoot,
  uiPageHeader,
  uiIconHeader,
  uiTitle,
  uiCaption,
  uiSection,
  uiFieldLabel,
  uiInput,
  uiBtnPrimary,
  uiBtnGhost,
  uiBtnDanger,
  uiCard,
  uiLabel,
  uiInfoBanner,
} from "../lib/ui";

interface PronounsGuideProps {
  pronounMappings: PronounMapping[];
  onAddPronoun: (cn: string, vi: string, pinyin: string, note?: string) => void;
  onDeletePronoun: (id: string) => void;
  onResetDefaultPronouns: () => void;
}

export default function PronounsGuide({
  pronounMappings,
  onAddPronoun,
  onDeletePronoun,
  onResetDefaultPronouns
}: PronounsGuideProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form states
  const [newChinese, setNewChinese] = useState("");
  const [newVietnamese, setNewVietnamese] = useState("");
  const [newPinyin, setNewPinyin] = useState("");
  const [newNote, setNewNote] = useState("");

  const handleAddSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChinese.trim() || !newVietnamese.trim() || !newPinyin.trim()) return;
    onAddPronoun(newChinese.trim(), newVietnamese.trim(), newPinyin.trim(), newNote.trim());
    setNewChinese("");
    setNewVietnamese("");
    setNewPinyin("");
    setNewNote("");
  };

  const filtered = pronounMappings.filter(
    (m) =>
      m.chinese.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.vietnamese.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.note && m.note.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <div className={`${uiPageRoot} space-y-5`} id="pronouns-guide-panel">
      
      {/* Header controls with Win 11 modern layout */}
      <div className={uiPageHeader}>
        <div className="flex items-center gap-3">
          <div className={uiIconHeader}>
            <BookOpen className="w-5 h-5 text-app-accent" />
          </div>
          <div>
            <h2 className={uiTitle}>
              Cẩm Nang Ánh Xạ Đại Từ Nhân Xưng
            </h2>
            <p className={`${uiCaption} mt-1`}>
              Ép buộc dòng máy dịch AI xưng hô chuẩn phong vị kiếm hiệp, tiên hiệp cổ điển theo ý muốn.
            </p>
          </div>
        </div>

        {/* Restore defaults button (Touch optimized h-10) */}
        <button 
          onClick={() => {
            if (confirm("Hành động này sẽ thiết lập lại toàn bộ bảng nhân xưng về dữ liệu mẫu chuẩn của dịch giả. Bạn có chắc chắn muốn khôi phục?")) {
              onResetDefaultPronouns();
            }
          }}
          className={`${uiBtnGhost} h-10 px-4 text-xs font-bold w-full md:w-auto text-center border-app-accent/30 text-app-accent hover:bg-app-accent/10`}
        >
          Khôi phục Mặc định
        </button>
      </div>

      {/* Main Double Column: Form & List - Stacks on Mobile */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start flex-1 min-h-0">
        
        {/* Left Form: Add Pronoun mapping */}
        <div className={`lg:col-span-4 ${uiSection}`}>
          <h3 className={`${uiLabel} flex items-center gap-1.5 font-sans`}>
            <Plus className="w-4 h-4 text-emerald-500" /> Thêm quy định mới
          </h3>

          <form onSubmit={handleAddSubmit} className="space-y-3.5">
            <div>
              <label className={uiFieldLabel}>
                Đại từ gốc Hán Tự (chữ Trung)
              </label>
              <input
                type="text"
                required
                value={newChinese}
                onChange={(e) => setNewChinese(e.target.value.trim())}
                placeholder="Ví dụ: 寡人"
                className={`${uiInput} text-xs font-bold`}
              />
            </div>

            <div>
              <label className={uiFieldLabel}>
                Phiên âm (Pinyin)
              </label>
              <input
                type="text"
                required
                value={newPinyin}
                onChange={(e) => setNewPinyin(e.target.value)}
                placeholder="Ví dụ: guǎrén"
                className={`${uiInput} text-xs font-mono`}
              />
            </div>

            <div>
              <label className={uiFieldLabel}>
                Bản dịch khớp Việt (Vietnamese)
              </label>
              <input
                type="text"
                required
                value={newVietnamese}
                onChange={(e) => setNewVietnamese(e.target.value)}
                placeholder="Ví dụ: quả nhân"
                className={`${uiInput} text-xs font-bold`}
              />
            </div>

            <div>
              <label className={uiFieldLabel}>
                Ghi chú hướng dẫn dịch (Note)
              </label>
              <input
                type="text"
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Ví dụ: Hoàng đế tự xưng"
                className={`${uiInput} text-xs`}
              />
            </div>

            {/* Save h-11 */}
            <button
              type="submit"
              className={`${uiBtnPrimary} w-full h-11 text-xs font-bold shadow-sm flex items-center justify-center gap-1.5`}
            >
              <Plus className="w-4 h-4 text-emerald-500" /> Thêm Quy Tắc Xưng Hô
            </button>
          </form>

          {/* Quick Notice card */}
          <div className={`${uiInfoBanner} text-[10.5px] leading-relaxed space-y-1`}>
            <span className="font-bold flex items-center gap-1 mb-1 text-app-accent"><ShieldAlert className="w-4 h-4 text-app-accent" /> QUY ƯỚC QUAN TRỌNG:</span>
            Mọi quy tắc xưng hô này sẽ được bộ chuyển ngữ AI áp đặt cưỡng chế, giữ vững tương quan x xưng hô vế lớn vế nhỏ, chống nhầm lẫn đại từ hắn, ta, ngươi.
          </div>
        </div>

        {/* Right Panel: List view + search */}
        <div className="lg:col-span-8 flex flex-col h-[400px] lg:h-[480px] min-h-0 space-y-3.5 w-full">
          {/* Search box h-10 */}
          <div className="relative h-10">
            <Search className="absolute left-3 top-3 w-4 h-4 text-app-text-muted" />
            <input
              type="text"
              placeholder="Tìm kiếm cụm từ nhân xưng..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className={`${uiInput} h-10 pl-9 pr-4 text-xs`}
            />
          </div>

          <div className={`${uiCard} overflow-y-auto flex-1 custom-scrollbar rounded-none md:rounded-lg border-y md:border shadow-none`}>
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-app-surface-muted/80 text-app-text-muted font-bold uppercase tracking-wider border-b border-app-border select-none">
                  <th className="py-3 px-4 text-[10px] font-bold">Hán tự</th>
                  <th className="py-3 px-4 text-[10px] font-bold">Phiên âm</th>
                  <th className="py-3 px-4 text-[10px] font-bold text-center">Khớp dịch Việt</th>
                  <th className="py-3 px-4 text-[10px] font-bold">Ghi chú ngữ cảnh</th>
                  <th className="py-3 px-4 text-[10px] text-right font-bold">Xác nhận</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-app-border">
                {filtered.length > 0 ? (
                  filtered.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-app-surface-muted/60 transition-colors group select-all"
                    >
                      <td className="py-2.5 px-4 font-bold text-app-text text-sm font-mono">
                        {item.chinese}
                      </td>
                      <td className="py-2.5 px-4 text-app-text-muted italic font-mono text-[11px]">
                        {item.pinyin}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-flex items-center bg-app-accent/10 text-app-accent font-bold px-2.5 py-0.5 rounded-lg border border-app-accent/20">
                          {item.vietnamese}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-app-text-muted text-xs max-w-xs truncate" title={item.note}>
                        {item.note || "---"}
                      </td>
                      <td className="py-2.5 px-4 text-right select-none">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => copyToClipboard(`${item.chinese} → ${item.vietnamese}`, item.id)}
                            className={`${uiBtnGhost} p-1 px-1.5 min-h-0 h-auto text-app-text-muted hover:text-app-accent active:scale-90 shadow-sm`}
                            title="Sao chép nhanh"
                          >
                            {copiedId === item.id ? (
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Xóa quy ước xưng xô của từ "${item.chinese}"?`)) {
                                onDeletePronoun(item.id);
                              }
                            }}
                            className={`${uiBtnDanger} min-h-0 h-8 w-8 p-1 active:scale-90`}
                            title="Xóa quy ước"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-app-text-muted italic">
                      Chưa nạp hoặc chưa thiết lập bất kỳ quy ước nhân xưng nào.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
