import type { VoteTally } from "@/lib/voteTally";
import type { BalanceGame } from "@/hooks/useActiveGame";
import type { HallOfFameEntry } from "@/hooks/useHallOfFame";

export function YesterdayResult({
  game,
  tally,
  winner,
}: {
  game: BalanceGame;
  tally: VoteTally;
  winner: HallOfFameEntry | null;
}) {
  const winningLabel = tally.aCount >= tally.bCount ? game.choice_a_label : game.choice_b_label;
  return (
    <div className="bg-neutral-100 rounded-md p-2 text-xs space-y-1">
      <div className="font-bold">📊 어제의 결과: {game.choice_a_label} vs {game.choice_b_label}</div>
      <div>
        🏅 승리 진영: {winningLabel} ({Math.max(tally.aPct, tally.bPct)}%)
      </div>
      {winner && (
        <div>👑 명예의 전당 등극: {winner.nickname} (인정 {winner.endorsement_count})</div>
      )}
    </div>
  );
}
