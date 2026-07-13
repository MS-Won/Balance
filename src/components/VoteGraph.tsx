import type { VoteTally } from "@/lib/voteTally";

export function VoteGraph({
  aLabel,
  bLabel,
  tally,
}: {
  aLabel: string;
  bLabel: string;
  tally: VoteTally;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs font-bold mb-1">
        <span className="text-rose-600">
          🅰 {aLabel} {tally.aPct}% ({tally.aCount.toLocaleString()}표)
        </span>
        <span className="text-blue-600">
          {bLabel} {tally.bPct}% ({tally.bCount.toLocaleString()}표) 🅱
        </span>
      </div>
      <div className="flex h-4 rounded-full overflow-hidden">
        <div className="bg-rose-500" style={{ width: `${tally.aPct}%` }} />
        <div className="bg-blue-500" style={{ width: `${tally.bPct}%` }} />
      </div>
      <p className="text-center text-[10px] text-neutral-500 mt-1">
        총 {tally.total.toLocaleString()}표 참여 · 실시간 집계
      </p>
    </div>
  );
}
