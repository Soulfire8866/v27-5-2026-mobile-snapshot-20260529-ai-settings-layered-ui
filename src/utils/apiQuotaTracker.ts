/**
 * Theo dõi RPM / cooldown cục bộ theo từng key + provider (ước lượng an toàn).
 * Không thay header rate-limit của nhà cung cấp — chỉ giúp xoay key trước khi chạm trần.
 */

export type QuotaProvider = "google" | "openai" | "deepseek" | "qwen" | "claude";

export interface QuotaAttemptLike {
  provider: QuotaProvider;
  key: string;
  model: string;
}

const STORAGE_KEY = "api_quota_tracker_v1";
const WINDOW_MS = 60_000;
const USAGE_THRESHOLD = 0.8;

/** RPM mặc định bảo thủ (free / tier thấp) */
const DEFAULT_RPM: Record<QuotaProvider, number> = {
  google: 10,
  openai: 30,
  deepseek: 30,
  qwen: 30,
  claude: 30,
};

/** Cooldown sau 429 — tăng dần nếu lặp lại */
const BASE_COOLDOWN_MS = 90_000;
const MAX_COOLDOWN_MS = 10 * 60_000;

interface KeyUsageState {
  windowStart: number;
  requestCount: number;
  estimatedTokens: number;
  cooldownUntil: number;
  consecutive429: number;
}

type UsageStore = Record<string, KeyUsageState>;

let memoryStore: UsageStore = {};
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const fingerprint = (provider: QuotaProvider, key: string): string =>
  `${provider}::${key.length > 6 ? key.slice(-6) : key}`;

const loadStore = (): UsageStore => {
  if (typeof window === "undefined") return { ...memoryStore };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UsageStore;
      memoryStore = { ...parsed };
      return memoryStore;
    }
  } catch {
    /* ignore */
  }
  return memoryStore;
};

const schedulePersist = () => {
  if (typeof window === "undefined") return;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(memoryStore));
    } catch {
      /* ignore */
    }
  }, 400);
};

const getState = (fp: string): KeyUsageState => {
  const store = loadStore();
  if (!store[fp]) {
    store[fp] = {
      windowStart: Date.now(),
      requestCount: 0,
      estimatedTokens: 0,
      cooldownUntil: 0,
      consecutive429: 0,
    };
  }
  return store[fp];
};

const rollWindow = (state: KeyUsageState, now: number) => {
  if (now - state.windowStart >= WINDOW_MS) {
    state.windowStart = now;
    state.requestCount = 0;
    state.estimatedTokens = 0;
  }
};

export const estimateTokensFromText = (text: string): number => {
  const len = text?.length ?? 0;
  return Math.max(80, Math.ceil(len / 3) + 120);
};

export const recordApiRequest = (
  provider: QuotaProvider,
  key: string,
  textForEstimate: string
): void => {
  const fp = fingerprint(provider, key);
  const state = getState(fp);
  const now = Date.now();
  rollWindow(state, now);
  state.requestCount += 1;
  state.estimatedTokens += estimateTokensFromText(textForEstimate);
  memoryStore[fp] = state;
  schedulePersist();
};

export const recordApiRateLimit = (provider: QuotaProvider, key: string): void => {
  const fp = fingerprint(provider, key);
  const state = getState(fp);
  const now = Date.now();
  state.consecutive429 += 1;
  const mult = Math.min(6, state.consecutive429);
  const cooldown = Math.min(MAX_COOLDOWN_MS, BASE_COOLDOWN_MS * mult);
  state.cooldownUntil = now + cooldown;
  memoryStore[fp] = state;
  schedulePersist();
};

export const recordApiSuccess = (provider: QuotaProvider, key: string): void => {
  const fp = fingerprint(provider, key);
  const state = getState(fp);
  state.consecutive429 = 0;
  memoryStore[fp] = state;
  schedulePersist();
};

export interface KeyQuotaScore {
  attempt: QuotaAttemptLike;
  score: number;
  blocked: boolean;
  reason?: string;
}

const scoreAttempt = (attempt: QuotaAttemptLike, now: number): KeyQuotaScore => {
  const fp = fingerprint(attempt.provider, attempt.key);
  const state = getState(fp);
  rollWindow(state, now);

  if (state.cooldownUntil > now) {
    return {
      attempt,
      score: -1000,
      blocked: true,
      reason: "cooldown",
    };
  }

  const rpmLimit = DEFAULT_RPM[attempt.provider] ?? 20;
  const usageRatio = state.requestCount / rpmLimit;

  if (usageRatio >= 1) {
    return {
      attempt,
      score: -500,
      blocked: true,
      reason: "rpm_exceeded",
    };
  }

  if (usageRatio >= USAGE_THRESHOLD) {
    return {
      attempt,
      score: 50 - usageRatio * 100,
      blocked: false,
      reason: "near_limit",
    };
  }

  return {
    attempt,
    score: 200 - usageRatio * 50,
    blocked: false,
  };
};

/** Sắp xếp attempt: key còn quota trước, key cooldown / gần trần sau */
export const orderAttemptsByQuota = <T extends QuotaAttemptLike>(attempts: T[]): T[] => {
  const now = Date.now();
  const scored = attempts.map((a) => scoreAttempt(a, now));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.attempt as T);
};

export const getQuotaDebugSnapshot = (): { fingerprint: string; state: KeyUsageState }[] => {
  loadStore();
  return Object.entries(memoryStore).map(([fp, state]) => ({ fingerprint: fp, state }));
};

/** Dùng trong QA — reset bộ nhớ quota */
export const resetQuotaTrackerForTests = (): void => {
  memoryStore = {};
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
};
