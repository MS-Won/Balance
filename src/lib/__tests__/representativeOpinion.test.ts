import { describe, expect, it } from "vitest";
import { computeRepresentativeOpinions } from "@/lib/representativeOpinion";

const baseMessage = (overrides: Partial<{
  id: string;
  choice: "A" | "B";
  nickname: string;
  content: string;
  created_at: string;
}>) => ({
  id: "m1",
  choice: "A" as const,
  nickname: "user",
  content: "hello",
  created_at: "2026-07-13T00:00:00.000Z",
  ...overrides,
});

describe("computeRepresentativeOpinions", () => {
  it("picks the highest-endorsement message per side", () => {
    const messages = [
      baseMessage({ id: "a1", choice: "A", content: "짜장이 최고" }),
      baseMessage({ id: "a2", choice: "A", content: "면발 쫄깃" }),
      baseMessage({ id: "b1", choice: "B", content: "매콤함이 진리" }),
    ];
    const counts = { a1: 5, a2: 34, b1: 28 };

    const result = computeRepresentativeOpinions(messages, counts);

    expect(result.a?.id).toBe("a2");
    expect(result.a?.endorsementCount).toBe(34);
    expect(result.b?.id).toBe("b1");
  });

  it("returns null for a side with no messages", () => {
    const messages = [baseMessage({ id: "a1", choice: "A" })];
    const result = computeRepresentativeOpinions(messages, {});
    expect(result.a?.id).toBe("a1");
    expect(result.b).toBeNull();
  });

  it("breaks ties by earliest message", () => {
    const messages = [
      baseMessage({ id: "a1", choice: "A", created_at: "2026-07-13T00:00:02.000Z" }),
      baseMessage({ id: "a2", choice: "A", created_at: "2026-07-13T00:00:01.000Z" }),
    ];
    const counts = { a1: 3, a2: 3 };
    const result = computeRepresentativeOpinions(messages, counts);
    expect(result.a?.id).toBe("a2");
  });
});
