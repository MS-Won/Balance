import { beforeEach, describe, expect, it } from "vitest";
import { getDeviceId, getNickname, setNickname } from "@/lib/deviceIdentity";

describe("deviceIdentity", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates and persists a device id on first call", () => {
    const first = getDeviceId();
    const second = getDeviceId();
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("returns null nickname when never set", () => {
    expect(getNickname()).toBeNull();
  });

  it("persists a nickname once set", () => {
    setNickname("논쟁왕");
    expect(getNickname()).toBe("논쟁왕");
  });
});
