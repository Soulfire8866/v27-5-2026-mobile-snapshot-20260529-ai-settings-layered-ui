/**
 * Chạy worker song song với giới hạn số luồng (pool).
 * Thứ tự kết quả trong mảng trả về khớp với thứ tự `items`.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
  options?: {
    onItemStart?: (item: T, index: number) => void;
    onItemComplete?: (item: T, index: number, result: R) => void;
  }
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let cursor = 0;
  const poolSize = Math.max(1, Math.min(concurrency, items.length));

  const runSlot = async () => {
    while (true) {
      const index = cursor++;
      if (index >= items.length) break;

      const item = items[index];
      options?.onItemStart?.(item, index);
      const result = await worker(item, index);
      results[index] = result;
      options?.onItemComplete?.(item, index, result);
    }
  };

  await Promise.all(Array.from({ length: poolSize }, () => runSlot()));
  return results;
}

export function clampThreadCount(value: number | undefined, max = 5): number {
  const n = typeof value === "number" && !Number.isNaN(value) ? value : 1;
  return Math.max(1, Math.min(max, Math.floor(n)));
}
