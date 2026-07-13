"use client";

import { useState } from "react";
import type { ChatMessage } from "@/hooks/useChatMessages";
import { ChatMessageItem } from "@/components/ChatMessageItem";

export function ChatFeed({
  messages,
  endorsementCounts,
  myEndorsedIds,
  onEndorse,
}: {
  messages: ChatMessage[];
  endorsementCounts: Record<string, number>;
  myEndorsedIds: Set<string>;
  onEndorse: (messageId: string) => void;
}) {
  const [sortByEndorsements, setSortByEndorsements] = useState(false);

  const sorted = sortByEndorsements
    ? [...messages].sort(
        (a, b) => (endorsementCounts[b.id] ?? 0) - (endorsementCounts[a.id] ?? 0)
      )
    : messages;

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-bold text-neutral-600">전체 채팅</span>
        <button
          onClick={() => setSortByEndorsements((v) => !v)}
          className="text-[10px] bg-neutral-200 rounded-full px-2 py-0.5"
        >
          {sortByEndorsements ? "🔥 인정순 보기" : "🕒 최신순 보기"}
        </button>
      </div>
      <div className="space-y-1 max-h-72 overflow-y-auto">
        {sorted.map((message) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            endorsementCount={endorsementCounts[message.id] ?? 0}
            endorsed={myEndorsedIds.has(message.id)}
            onEndorse={() => onEndorse(message.id)}
          />
        ))}
      </div>
    </div>
  );
}
