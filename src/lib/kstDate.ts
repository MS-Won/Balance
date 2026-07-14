// Today's date (YYYY-MM-DD) in KST, regardless of the runtime's local timezone.
// 'en-CA' formats as YYYY-MM-DD, which sorts and compares correctly against the
// balance_games.date column. Works in both the browser and Node (server).
export function getTodayKST(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
}
