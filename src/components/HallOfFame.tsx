import type { HallOfFameEntry } from "@/hooks/useHallOfFame";

export function HallOfFame({ entries }: { entries: HallOfFameEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="bg-amber-50 rounded-md p-2 text-center text-xs text-neutral-500">
        🏆 명예의 전당 (아직 없음)
      </div>
    );
  }

  return (
    <div className="bg-amber-50 rounded-md p-2">
      <div className="text-xs font-bold mb-1">🏆 명예의 전당</div>
      <div className="flex gap-2 overflow-x-auto">
        {entries.map((entry, i) => (
          <div key={entry.id} className="shrink-0 w-24 bg-white rounded-md p-1 text-center text-[10px]">
            <div className="font-bold">#{i + 1}</div>
            <div className="truncate">{entry.nickname}</div>
            <div className="text-amber-600">인정 {entry.endorsement_count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
