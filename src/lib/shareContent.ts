import type { VoteTally } from "@/lib/voteTally";

export interface ShareContent {
  description: string;
  imageQuery: string;
}

export function buildShareContent(
  myChoice: "A" | "B" | null,
  tally: VoteTally,
  aLabel: string,
  bLabel: string
): ShareContent | null {
  if (!myChoice || tally.total === 0) return null;

  const label = myChoice === "A" ? aLabel : bLabel;
  const pct = myChoice === "A" ? tally.aPct : tally.bPct;

  return {
    description: `나는 ${label}파! 오늘 ${pct}%가 나와 같은 선택을 했어요`,
    imageQuery: `c=${myChoice}&pct=${pct}`,
  };
}
