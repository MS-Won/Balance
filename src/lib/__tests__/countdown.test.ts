import { describe, expect, it } from "vitest";
import { formatCountdown, msUntilNextMidnightKST } from "@/lib/countdown";

describe("msUntilNextMidnightKST", () => {
  it("returns close to 24h when it is just past KST midnight", () => {
    // 2026-07-13 00:00:01 KST == 2026-07-12 15:00:01 UTC
    const now = new Date("2026-07-12T15:00:01.000Z");
    const ms = msUntilNextMidnightKST(now);
    expect(ms).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(ms).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
  });

  it("returns a small value just before KST midnight", () => {
    // 2026-07-12 23:59:50 KST == 2026-07-12 14:59:50 UTC
    const now = new Date("2026-07-12T14:59:50.000Z");
    const ms = msUntilNextMidnightKST(now);
    expect(ms).toBeGreaterThan(0);
    expect(ms).toBeLessThanOrEqual(10 * 1000);
  });
});

describe("formatCountdown", () => {
  it("formats milliseconds as HH:MM:SS", () => {
    expect(formatCountdown(5 * 3600_000 + 12 * 60_000 + 33_000)).toBe("05:12:33");
  });

  it("clamps negative values to 00:00:00", () => {
    expect(formatCountdown(-1000)).toBe("00:00:00");
  });
});
