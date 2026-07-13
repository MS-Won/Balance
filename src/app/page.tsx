"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { VoteGraph } from "@/components/VoteGraph";
import { useActiveGame } from "@/hooks/useActiveGame";
import { useVotes } from "@/hooks/useVotes";
import { getNickname, setNickname as persistNickname } from "@/lib/deviceIdentity";
import { NicknamePrompt } from "@/components/NicknamePrompt";
import { useChatMessages } from "@/hooks/useChatMessages";
import { ChatFeed } from "@/components/ChatFeed";
import { ChatInput } from "@/components/ChatInput";

export default function Home() {
  const { game, loading } = useActiveGame();
  const { tally, myChoice, castVote } = useVotes(game?.id);
  const { messages, sendMessage } = useChatMessages(game?.id);
  const [nickname, setNicknameState] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    setNicknameState(getNickname());
  }, []);

  return (
    <main className="mx-auto max-w-md p-3 space-y-3">
      {nickname === null && (
        <NicknamePrompt
          onSet={(value) => {
            persistNickname(value);
            setNicknameState(value);
          }}
        />
      )}
      <Header />
      {loading && <p className="text-center text-sm text-neutral-500">불러오는 중...</p>}
      {!loading && !game && (
        <p className="text-center text-sm text-neutral-500">
          오늘의 밸런스 게임이 아직 준비되지 않았습니다.
        </p>
      )}
      {game && (
        <>
          <div className="text-center text-sm font-bold">
            🅰 {game.choice_a_label} vs {game.choice_b_label} 🅱
          </div>
          {game.description && (
            <p className="text-center text-[11px] text-neutral-500">{game.description}</p>
          )}
          <VoteGraph aLabel={game.choice_a_label} bLabel={game.choice_b_label} tally={tally} />
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
            endorsementCounts={{}}
            myEndorsedIds={new Set()}
            onEndorse={() => {}}
          />
          <ChatInput
            disabled={!myChoice || !nickname}
            onSend={(content) => myChoice && sendMessage(content, myChoice)}
          />
        </>
      )}
    </main>
  );
}
