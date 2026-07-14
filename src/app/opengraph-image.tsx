import { readFile } from "node:fs/promises";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getActiveGameServer } from "@/lib/getActiveGameServer";

export const runtime = "nodejs";
export const revalidate = 300;
export const alt = "오늘의 밸런스 게임";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const [game, fontData] = await Promise.all([
    getActiveGameServer(),
    readFile(path.join(process.cwd(), "src/app/fonts/Pretendard-ExtraBold.ttf")),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          fontFamily: "Pretendard",
        }}
      >
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
          {game?.choice_a_label ?? "A"}
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
          {game?.choice_b_label ?? "B"}
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [{ name: "Pretendard", data: fontData, style: "normal", weight: 800 }],
    }
  );
}
