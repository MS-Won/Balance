import type { VoteTally } from "@/lib/voteTally";

export function BalanceCard({
  question,
  aLabel,
  bLabel,
  aDesc,
  bDesc,
  tally,
  myChoice,
  onVote,
}: {
  question: string | null;
  aLabel: string;
  bLabel: string;
  aDesc: string | null;
  bDesc: string | null;
  tally: VoteTally;
  myChoice: "A" | "B" | null;
  onVote: (choice: "A" | "B") => void;
}) {
  const participLabel =
    tally.total === 0
      ? "아직 아무도 용기 내지 않았어요"
      : `지금까지 ${tally.total.toLocaleString()}명 참여했어요`;

  return (
    <div className="versus">
      <div className="vparticip">{participLabel}</div>
      {question && <div className="vq">Q. {question}</div>}

      <div className="cols">
        <button
          type="button"
          className={`col a${myChoice === "A" ? " selected" : ""}`}
          onClick={() => onVote("A")}
        >
          <div className="tick">✓</div>
          <div className="clabel">{aLabel}</div>
          {aDesc && <div className="cdesc">({aDesc})</div>}
        </button>
        <button
          type="button"
          className={`col b${myChoice === "B" ? " selected" : ""}`}
          onClick={() => onVote("B")}
        >
          <div className="tick">✓</div>
          <div className="clabel">{bLabel}</div>
          {bDesc && <div className="cdesc">({bDesc})</div>}
        </button>
      </div>

      <div className="tally">
        <div className="tallybar">
          <div className="fa" style={{ width: `${tally.aPct}%` }}>
            <span>{tally.aPct}%</span>
          </div>
          <div className="fb" style={{ width: `${tally.bPct}%` }}>
            <span>{tally.bPct}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
