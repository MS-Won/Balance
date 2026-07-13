import type { RepresentativeOpinion } from "@/lib/representativeOpinion";

function Slot({ side, opinion }: { side: "A" | "B"; opinion: RepresentativeOpinion | null }) {
  const cls = side === "A" ? "a" : "b";
  return (
    <div className={`rep ${cls}`}>
      {opinion ? (
        <>
          <div className="h">
            {opinion.nickname}
            <span className="cnt">
              <span className="oj">ㅇㅈ</span>
              {opinion.endorsementCount}
            </span>
          </div>
          <div className="body">{opinion.content}</div>
        </>
      ) : (
        <div className="empty">아직 대표 의견이 없어요</div>
      )}
    </div>
  );
}

export function RepresentativeOpinionBar({
  a,
  b,
}: {
  a: RepresentativeOpinion | null;
  b: RepresentativeOpinion | null;
}) {
  return (
    <div className="reps">
      <Slot side="A" opinion={a} />
      <Slot side="B" opinion={b} />
    </div>
  );
}
