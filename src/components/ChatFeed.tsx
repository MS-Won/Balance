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
      <div className="sectionlabel">
        의견을 써주세요 :)
        <button
          type="button"
          className="sort"
          onClick={() => setSortByEndorsements((v) => !v)}
        >
          {sortByEndorsements ? "ㅇㅈ순 ▾" : "최신순 ▾"}
        </button>
      </div>
      <div className="chatlist">
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
