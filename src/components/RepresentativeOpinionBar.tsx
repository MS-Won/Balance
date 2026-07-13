import type { RepresentativeOpinion } from "@/lib/representativeOpinion";

function Slot({ side, opinion }: { side: "A" | "B"; opinion: RepresentativeOpinion | null }) {
  const isA = side === "A";
  return (
    <div
      className={`flex-1 rounded-md border px-2 py-1 text-xs bg-amber-50 ${
        isA ? "border-rose-500" : "border-blue-500"
      }`}
    >
      <div className={`font-bold ${isA ? "text-rose-600" : "text-blue-600"}`}>
        {isA ? "🅰" : "🅱"} 대표의견{opinion ? ` (인정 ${opinion.endorsementCount})` : ""}
      </div>
      <div className="truncate">{opinion ? opinion.content : "아직 없음"}</div>
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
    <div className="flex gap-1">
      <Slot side="A" opinion={a} />
      <Slot side="B" opinion={b} />
    </div>
  );
}
