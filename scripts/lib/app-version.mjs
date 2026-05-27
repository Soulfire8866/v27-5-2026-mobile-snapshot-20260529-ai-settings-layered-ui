/**
 * Số hiệu phiên bản theo ngày build: Rev DD.MM.YYYY
 * versionCode Android: yyyyMMdd (số nguyên, tăng theo ngày)
 */
export function formatRevVersion(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return {
    versionName: `Rev ${dd}.${mm}.${yyyy}`,
    versionCode: Number(`${yyyy}${mm}${dd}`),
    revDate: `${dd}.${mm}.${yyyy}`,
    builtAt: date.toISOString(),
  };
}
