import { describe, expect, it } from "vitest";
import { buildShareContent } from "@/lib/shareContent";
import type { VoteTally } from "@/lib/voteTally";

const tally: VoteTally = { aCount: 62, bCount: 38, aPct: 62, bPct: 38, total: 100 };

describe("buildShareContent", () => {
  it("returns null when the sharer hasn't voted", () => {
    expect(buildShareContent(null, tally, "초코", "바닐라")).toBeNull();
  });

  it("returns null when there are no votes yet", () => {
    const empty: VoteTally = { aCount: 0, bCount: 0, aPct: 50, bPct: 50, total: 0 };
    expect(buildShareContent("A", empty, "초코", "바닐라")).toBeNull();
  });

  it("builds personalized content for an A voter", () => {
    expect(buildShareContent("A", tally, "초코", "바닐라")).toEqual({
      description: "나는 초코파! 오늘 62%가 나와 같은 선택을 했어요",
      imageQuery: "c=A&pct=62",
    });
  });

  it("builds personalized content for a B voter", () => {
    expect(buildShareContent("B", tally, "초코", "바닐라")).toEqual({
      description: "나는 바닐라파! 오늘 38%가 나와 같은 선택을 했어요",
      imageQuery: "c=B&pct=38",
    });
  });
});
