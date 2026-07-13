"use client";

import { Header } from "@/components/Header";
import { useActiveGame } from "@/hooks/useActiveGame";

export default function Home() {
  const { game, loading } = useActiveGame();

  return (
    <main className="mx-auto max-w-md p-3 space-y-3">
      <Header />
      {loading && <p className="text-center text-sm text-neutral-500">불러오는 중...</p>}
      {!loading && !game && (
        <p className="text-center text-sm text-neutral-500">
          오늘의 밸런스 게임이 아직 준비되지 않았습니다.
        </p>
      )}
      {game && (
        <div className="text-center text-sm font-bold">
          🅰 {game.choice_a_label} vs {game.choice_b_label} 🅱
        </div>
      )}
    </main>
  );
}
