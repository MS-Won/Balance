import { describe, expect, it } from "vitest";
import { containsProfanity } from "@/lib/profanityFilter";

describe("containsProfanity", () => {
  it("returns false for a normal message", () => {
    expect(containsProfanity("짜장면이 더 맛있어요")).toBe(false);
  });

  it("detects a profane term", () => {
    expect(containsProfanity("이 씨발 진짜")).toBe(true);
  });

  it("detects a profane term embedded in a longer word", () => {
    expect(containsProfanity("병신같은 소리하네")).toBe(true);
  });

  it("returns false for an empty string", () => {
    expect(containsProfanity("")).toBe(false);
  });
});
