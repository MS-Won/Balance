export interface RepresentativeOpinionMessage {
  id: string;
  choice: string;
  nickname: string;
  content: string;
  created_at: string;
}

export interface RepresentativeOpinion {
  id: string;
  nickname: string;
  content: string;
  endorsementCount: number;
}

export function computeRepresentativeOpinions(
  messages: RepresentativeOpinionMessage[],
  counts: Record<string, number>
): { a: RepresentativeOpinion | null; b: RepresentativeOpinion | null } {
  function pickBest(choice: "A" | "B"): RepresentativeOpinion | null {
    const candidates = messages.filter((m) => m.choice === choice);
    if (candidates.length === 0) return null;

    const best = candidates.reduce((top, current) => {
      const topCount = counts[top.id] ?? 0;
      const currentCount = counts[current.id] ?? 0;
      if (currentCount > topCount) return current;
      if (currentCount === topCount && current.created_at < top.created_at) return current;
      return top;
    });

    return {
      id: best.id,
      nickname: best.nickname,
      content: best.content,
      endorsementCount: counts[best.id] ?? 0,
    };
  }

  return { a: pickBest("A"), b: pickBest("B") };
}
