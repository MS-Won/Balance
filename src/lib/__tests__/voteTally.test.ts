import { describe, expect, it } from "vitest";
import { computeVoteTally } from "@/lib/voteTally";

describe("computeVoteTally", () => {
  it("computes counts and rounded percentages", () => {
    const votes = [
      ...Array(62).fill({ choice: "A" as const }),
      ...Array(38).fill({ choice: "B" as const }),
    ];
    const tally = computeVoteTally(votes);
    expect(tally).toEqual({ aCount: 62, bCount: 38, aPct: 62, bPct: 38, total: 100 });
  });

  it("defaults to a 50/50 split with zero votes", () => {
    expect(computeVoteTally([])).toEqual({ aCount: 0, bCount: 0, aPct: 50, bPct: 50, total: 0 });
  });
});
