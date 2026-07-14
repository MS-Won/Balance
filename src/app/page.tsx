import type { Metadata } from "next";
import { HomeClient } from "@/components/HomeClient";
import { getActiveGameServer } from "@/lib/getActiveGameServer";

export async function generateMetadata(): Promise<Metadata> {
  const game = await getActiveGameServer();
  const description = game?.question ?? "매일 자정, 세상은 둘로 갈린다 — 오늘의 밸런스 게임";

  return {
    title: "오늘의 밸런스",
    description,
    openGraph: {
      title: "오늘의 밸런스",
      description,
      images: ["/opengraph-image"],
    },
  };
}

export default function Page() {
  return <HomeClient />;
}
