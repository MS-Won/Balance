import type { HallOfFameEntry } from "@/hooks/useHallOfFame";

const MEDALS = ["🥇", "🥈", "🥉"];

export function HallOfFame({ entries }: { entries: HallOfFameEntry[] }) {
  return (
    <div className="card hof">
      <div className="title">🏆 명예의 전당</div>
      {entries.length === 0 ? (
        <div className="empty">아직 전설이 된 자가 없습니다</div>
      ) : (
        entries.map((entry, i) => (
          <div key={entry.id} className="item">
            <div className="medal">{MEDALS[i] ?? `#${i + 1}`}</div>
            <div>
              <div className="nick">{entry.nickname}</div>
              <div className="q">
                {entry.date} · {entry.winning_choice} 진영 승리
              </div>
            </div>
            <div className="cnt">
              <span className="oj">ㅇㅈ</span>
              {entry.endorsement_count}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
