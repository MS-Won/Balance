"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { BalanceCard } from "@/components/BalanceCard";
import { useActiveGame } from "@/hooks/useActiveGame";
import { useVotes } from "@/hooks/useVotes";
import { getNickname, setNickname as persistNickname } from "@/lib/deviceIdentity";
import { NicknamePrompt } from "@/components/NicknamePrompt";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useEndorsements } from "@/hooks/useEndorsements";
import { ChatFeed } from "@/components/ChatFeed";
import { ChatInput } from "@/components/ChatInput";
import {
  computeRepresentativeOpinions,
  type RepresentativeOpinionMessage,
} from "@/lib/representativeOpinion";
import { RepresentativeOpinionBar } from "@/components/RepresentativeOpinionBar";
import { useHallOfFame } from "@/hooks/useHallOfFame";
import { HallOfFame } from "@/components/HallOfFame";

export default function Home() {
  const { game, loading } = useActiveGame();
  const { tally, myChoice, castVote } = useVotes(game?.id);
  const { messages, sendMessage } = useChatMessages(game?.id);
  const { counts, myEndorsedIds, endorse } = useEndorsements(game?.id);
  const { entries } = useHallOfFame();
  const [nickname, setNicknameState] = useState<string | null | undefined>(undefined);

  const { a: repA, b: repB } = computeRepresentativeOpinions(
    messages as RepresentativeOpinionMessage[],
    counts
  );

  useEffect(() => {
    // Read the nickname from localStorage only after mount. getNickname() touches
    // window.localStorage (no SSR guard), so it must run post-mount; a lazy
    // initializer would crash on the server or cause a hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNicknameState(getNickname());
  }, []);

  return (
    <main className="app">
      <Header />

      {loading && <p className="hint">우주의 균형을 재는 중…</p>}
      {!loading && !game && (
        <p className="hint">오늘은 세상이 평화롭습니다. (아직 문제가 없다는 뜻)</p>
      )}

      {game && (
        <>
          <BalanceCard
            question={game.question}
            aLabel={game.choice_a_label}
            bLabel={game.choice_b_label}
            aDesc={game.choice_a_description}
            bDesc={game.choice_b_description}
            tally={tally}
            myChoice={myChoice}
            onVote={castVote}
          />
          <RepresentativeOpinionBar a={repA} b={repB} />
          <ChatFeed
            messages={messages}
            endorsementCounts={counts}
            myEndorsedIds={myEndorsedIds}
            onEndorse={endorse}
          />
          <ChatInput
            disabled={!myChoice || !nickname}
            onSend={(content) => myChoice && sendMessage(content, myChoice)}
          />
        </>
      )}

      <HallOfFame entries={entries} />

      {nickname === null && (
        <NicknamePrompt
          onSet={(value) => {
            persistNickname(value);
            setNicknameState(value);
          }}
        />
      )}
    </main>
  );
}
