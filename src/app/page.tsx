"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { VoteGraph } from "@/components/VoteGraph";
import { useActiveGame } from "@/hooks/useActiveGame";
import { useVotes } from "@/hooks/useVotes";
import { getNickname, setNickname as persistNickname } from "@/lib/deviceIdentity";
import { NicknamePrompt } from "@/components/NicknamePrompt";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useEndorsements } from "@/hooks/useEndorsements";
import { ChatFeed } from "@/components/ChatFeed";
import { ChatInput } from "@/components/ChatInput";
import { computeRepresentativeOpinions, type RepresentativeOpinionMessage } from "@/lib/representativeOpinion";
import { RepresentativeOpinionBar } from "@/components/RepresentativeOpinionBar";
import { useHallOfFame } from "@/hooks/useHallOfFame";
import { HallOfFame } from "@/components/HallOfFame";
import { YesterdayResult } from "@/components/YesterdayResult";
import { AdPlaceholder } from "@/components/AdPlaceholder";

export default function Home() {
  const { game, lastEndedGame, loading } = useActiveGame();
  const { tally, myChoice, castVote } = useVotes(game?.id);
  const { tally: yesterdayTally } = useVotes(lastEndedGame?.id);
  const { messages, sendMessage } = useChatMessages(game?.id);
  const { counts, myEndorsedIds, endorse } = useEndorsements(game?.id);
  const { entries } = useHallOfFame();
  const yesterdayWinnerEntry = entries.find((e) => e.game_id === lastEndedGame?.id) ?? null;
  const [nickname, setNicknameState] = useState<string | null | undefined>(undefined);

  const { a: repA, b: repB } = computeRepresentativeOpinions(messages as RepresentativeOpinionMessage[], counts);

  useEffect(() => {
    // Read the nickname from localStorage only after mount. getNickname() touches
    // window.localStorage (no SSR guard), so it cannot run during server prerender,
    // and a lazy useState initializer would either crash on the server or cause a
    // hydration mismatch (server: undefined -> no modal; client: null -> modal). The
    // deferred-read-in-effect is the correct pattern here, so this rule is a false
    // positive for this specific case.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNicknameState(getNickname());
  }, []);

  return (
    <main className="mx-auto max-w-md p-3 space-y-3">
      <Header />
      {lastEndedGame && (
        <YesterdayResult game={lastEndedGame} tally={yesterdayTally} winner={yesterdayWinnerEntry} />
      )}
      {loading && <p className="text-center text-sm text-neutral-500">불러오는 중...</p>}
      {!loading && !game && (
        <p className="text-center text-sm text-neutral-500">
          오늘의 밸런스 게임이 아직 준비되지 않았습니다.
        </p>
      )}
      {game && (
        <>
          {game.question && (
            <h2 className="text-center text-base font-bold">{game.question}</h2>
          )}
          <div className="text-center text-sm font-bold">
            🅰 {game.choice_a_label} vs {game.choice_b_label} 🅱
          </div>
          {game.description && (
            <p className="text-center text-[11px] text-neutral-500">{game.description}</p>
          )}
          <VoteGraph aLabel={game.choice_a_label} bLabel={game.choice_b_label} tally={tally} />
          <RepresentativeOpinionBar a={repA} b={repB} />
          <div className="flex gap-2">
            <button
              onClick={() => castVote("A")}
              className={`flex-1 rounded-md py-2 text-sm font-bold border ${
                myChoice === "A" ? "bg-rose-500 text-white" : "border-rose-500 text-rose-600"
              }`}
            >
              🅰 {game.choice_a_label}
            </button>
            <button
              onClick={() => castVote("B")}
              className={`flex-1 rounded-md py-2 text-sm font-bold border ${
                myChoice === "B" ? "bg-blue-500 text-white" : "border-blue-500 text-blue-600"
              }`}
            >
              {game.choice_b_label} 🅱
            </button>
          </div>
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
      <AdPlaceholder />
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
