import { describe, expect, it } from "vitest";
import { buildKakaoChannelUrl } from "@/lib/kakaoChannel";

describe("buildKakaoChannelUrl", () => {
  it("builds a pf.kakao.com friend-add URL from a channel id", () => {
    expect(buildKakaoChannelUrl("_abcDE")).toBe("https://pf.kakao.com/_abcDE/friend");
  });
});
