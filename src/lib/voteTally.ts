export interface VoteTally {
  aCount: number;
  bCount: number;
  aPct: number;
  bPct: number;
  total: number;
}

export function computeVoteTally(votes: { choice: "A" | "B" }[]): VoteTally {
  const aCount = votes.filter((v) => v.choice === "A").length;
  const bCount = votes.filter((v) => v.choice === "B").length;
  const total = aCount + bCount;

  if (total === 0) {
    return { aCount: 0, bCount: 0, aPct: 50, bPct: 50, total: 0 };
  }

  const aPct = Math.round((aCount / total) * 100);
  return { aCount, bCount, aPct, bPct: 100 - aPct, total };
}
