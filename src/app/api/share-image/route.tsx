import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getActiveGameServer } from "@/lib/getActiveGameServer";
import { parseShareImageParams } from "@/lib/shareImageParams";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = parseShareImageParams(searchParams);

  const [game, fontData] = await Promise.all([
    getActiveGameServer(),
    readFile(path.join(process.cwd(), "src/app/fonts/Pretendard-ExtraBold.ttf")),
  ]);

  const aLabel = game?.choice_a_label ?? "A";
  const bLabel = game?.choice_b_label ?? "B";
  const banner = parsed
    ? `나는 ${parsed.choice === "A" ? aLabel : bLabel}파! 오늘 ${parsed.pct}%가 같은 선택`
    : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Pretendard",
        }}
      >
        {banner && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "#1a1a1a",
              color: "#fff",
              fontSize: 40,
              padding: "24px 0",
            }}
          >
            {banner}
          </div>
        )}
        <div style={{ flex: 1, display: "flex" }}>
          <div
            style={{
              flex: 1,
              background: "#ff6b54",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 64,
              textAlign: "center",
              padding: "0 30px",
            }}
          >
            {aLabel}
          </div>
          <div
            style={{
              flex: 1,
              background: "#18be9f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 64,
              textAlign: "center",
              padding: "0 30px",
            }}
          >
            {bLabel}
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      fonts: [{ name: "Pretendard", data: fontData, style: "normal", weight: 800 }],
    }
  );
}
