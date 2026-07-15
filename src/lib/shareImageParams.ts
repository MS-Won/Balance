export interface ShareImageParams {
  choice: "A" | "B";
  pct: number;
}

export function parseShareImageParams(searchParams: URLSearchParams): ShareImageParams | null {
  const choice = searchParams.get("c");
  if (choice !== "A" && choice !== "B") return null;

  const pctRaw = searchParams.get("pct");
  if (pctRaw === null) return null;
  const pct = Number(pctRaw);
  if (!Number.isInteger(pct) || pct < 0 || pct > 100) return null;

  return { choice, pct };
}
