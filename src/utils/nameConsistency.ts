const normalize = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length;
  const bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;

  const prev = new Array<number>(bl + 1);
  const curr = new Array<number>(bl + 1);
  for (let j = 0; j <= bl; j++) prev[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    const ca = a.charCodeAt(i - 1);
    for (let j = 1; j <= bl; j++) {
      const cb = b.charCodeAt(j - 1);
      const cost = ca === cb ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bl; j++) prev[j] = curr[j];
  }
  return prev[bl];
}

export type NameInconsistencySuggestion = {
  a: string;
  b: string;
  score: number; // 0..100 (higher = more likely same name)
  countA: number;
  countB: number;
};

/** Trích cụm viết hoa kiểu tên riêng trong tiếng Việt. */
export function extractVietnameseNameLikePhrases(text: string): string[] {
  if (!text?.trim()) return [];
  const cleaned = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const pattern =
    // Include Vietnamese Đ/đ in the "Title Case" start-token detection.
    /(?:^|\s)[\p{Lu}Đ][\p{L}\p{M}'-]+(?:\s+[\p{Lu}Đ][\p{L}\p{M}'-]+){0,3}(?=$|\s|[^\p{L}\p{M}])/gu;
  const matches = cleaned.match(pattern) ?? [];
  // lọc bớt cụm quá ngắn/đại trà
  return matches
    .map((m) => m.trim().replace(/\s+/g, " "))
    .filter((m) => m.length >= 3)
    .filter((m) => !/^Chương\s+\d+/i.test(m));
}

export function findNameInconsistenciesInChapter(
  translatedText: string,
  options?: { maxSuggestions?: number }
): NameInconsistencySuggestion[] {
  const phrases = extractVietnameseNameLikePhrases(translatedText);
  if (phrases.length < 2) return [];

  const freq = new Map<string, number>();
  for (const p of phrases) freq.set(p, (freq.get(p) ?? 0) + 1);

  const uniques = Array.from(freq.entries())
    .filter(([, c]) => c >= 1)
    .map(([p]) => p);

  // nhóm theo token đầu (họ/tên đệm) để giảm nhiễu
  const groups = new Map<string, string[]>();
  for (const p of uniques) {
    const first = normalize(p.split(" ")[0] ?? "");
    if (!first) continue;
    const arr = groups.get(first) ?? [];
    arr.push(p);
    groups.set(first, arr);
  }

  const out: NameInconsistencySuggestion[] = [];
  for (const arr of groups.values()) {
    if (arr.length < 2) continue;
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        const na = normalize(a);
        const nb = normalize(b);
        if (!na || !nb || na === nb) continue;

        const dist = levenshtein(na, nb);
        const denom = Math.max(na.length, nb.length);
        const ratio = denom > 0 ? dist / denom : 1;

        // ngưỡng: khác nhau nhẹ (Hy/Hi, Phượng/Phong...) hoặc 1-2 ký tự
        if (dist <= 2 || ratio <= 0.18) {
          const score = Math.max(0, Math.min(100, Math.round((1 - Math.min(1, ratio)) * 100)));
          out.push({
            a,
            b,
            score,
            countA: freq.get(a) ?? 0,
            countB: freq.get(b) ?? 0,
          });
        }
      }
    }
  }

  // gộp trùng, sort theo score + tần suất
  const seen = new Set<string>();
  const dedup = out
    .filter((s) => {
      const key = [s.a, s.b].sort().join("||");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => (y.score - x.score) || ((y.countA + y.countB) - (x.countA + x.countB)));

  return dedup.slice(0, options?.maxSuggestions ?? 8);
}

export function replaceAllExact(text: string, from: string, to: string): string {
  if (!from || from === to) return text;
  const escaped = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(escaped, "g"), to);
}

