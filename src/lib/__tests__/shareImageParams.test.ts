import { describe, expect, it } from "vitest";
import { parseShareImageParams } from "@/lib/shareImageParams";

describe("parseShareImageParams", () => {
  it("parses a valid choice and percentage", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=62"))).toEqual({
      choice: "A",
      pct: 62,
    });
  });

  it("rejects a missing choice", () => {
    expect(parseShareImageParams(new URLSearchParams("pct=62"))).toBeNull();
  });

  it("rejects an invalid choice", () => {
    expect(parseShareImageParams(new URLSearchParams("c=C&pct=62"))).toBeNull();
  });

  it("rejects a non-integer percentage", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=62.5"))).toBeNull();
  });

  it("rejects a percentage out of range", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=101"))).toBeNull();
    expect(parseShareImageParams(new URLSearchParams("c=A&pct=-1"))).toBeNull();
  });

  it("rejects a missing percentage", () => {
    expect(parseShareImageParams(new URLSearchParams("c=A"))).toBeNull();
  });
});
