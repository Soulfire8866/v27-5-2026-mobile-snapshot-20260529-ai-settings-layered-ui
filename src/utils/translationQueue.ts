/**
 * Hàng đợi dịch toàn cục — một worker, pacing giữa các request.
 * Mọi gọi translateText / lookup đi qua đây để tránh Lab + Reader + batch chồng API.
 */

export type TranslationPriority = "high" | "normal" | "low";

interface QueueJob<T> {
  id: number;
  priority: TranslationPriority;
  label: string;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

const PRIORITY_WEIGHT: Record<TranslationPriority, number> = {
  high: 3,
  normal: 2,
  low: 1,
};

/** Khoảng cách tối thiểu giữa hai lần gọi API (ms) */
export const TRANSLATION_QUEUE_MIN_GAP_MS = 1400;

let jobIdSeq = 0;
let workerBusy = false;
const pending: QueueJob<unknown>[] = [];
let lastFinishedAt = 0;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const pickNextJob = (): QueueJob<unknown> | undefined => {
  if (pending.length === 0) return undefined;
  pending.sort((a, b) => {
    const pw = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority];
    if (pw !== 0) return pw;
    return a.id - b.id;
  });
  return pending.shift();
};

const drainQueue = async (): Promise<void> => {
  if (workerBusy) return;
  workerBusy = true;

  try {
    while (pending.length > 0) {
      const job = pickNextJob();
      if (!job) break;

      const elapsed = Date.now() - lastFinishedAt;
      const waitMs = Math.max(0, TRANSLATION_QUEUE_MIN_GAP_MS - elapsed);
      if (waitMs > 0) {
        await sleep(waitMs);
      }

      try {
        const result = await job.run();
        job.resolve(result);
      } catch (err) {
        job.reject(err);
      } finally {
        lastFinishedAt = Date.now();
      }
    }
  } finally {
    workerBusy = false;
    if (pending.length > 0) {
      void drainQueue();
    }
  }
};

export const runInTranslationQueue = <T>(
  run: () => Promise<T>,
  options?: { priority?: TranslationPriority; label?: string }
): Promise<T> => {
  const priority = options?.priority ?? "normal";
  const label = options?.label ?? "translation";

  return new Promise<T>((resolve, reject) => {
    const job: QueueJob<T> = {
      id: ++jobIdSeq,
      priority,
      label,
      run,
      resolve,
      reject,
    };
    pending.push(job as QueueJob<unknown>);
    void drainQueue();
  });
};

export const getTranslationQueueDepth = (): number => pending.length + (workerBusy ? 1 : 0);
