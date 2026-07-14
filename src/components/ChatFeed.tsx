"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/hooks/useChatMessages";
import { ChatMessageItem } from "@/components/ChatMessageItem";

export function ChatFeed({
  messages,
  endorsementCounts,
  myEndorsedIds,
  deviceId,
  showNicknameChange,
  onEndorse,
  onDelete,
  onChangeNickname,
}: {
  messages: ChatMessage[];
  endorsementCounts: Record<string, number>;
  myEndorsedIds: Set<string>;
  deviceId: string;
  showNicknameChange: boolean;
  onEndorse: (messageId: string) => void;
  onDelete: (messageId: string) => void;
  onChangeNickname: () => void;
}) {
  const [sortByEndorsements, setSortByEndorsements] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  const sorted = sortByEndorsements
    ? [...messages].sort(
        (a, b) => (endorsementCounts[b.id] ?? 0) - (endorsementCounts[a.id] ?? 0)
      )
    : messages;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sorted]);

  return (
    <div>
      <div className="sectionlabel">
        LIVE Chat🔴
        <span className="sectionlabel-actions">
          {showNicknameChange && (
            <button type="button" className="nick-change" onClick={onChangeNickname}>
              닉네임 변경
            </button>
          )}
          <button
            type="button"
            className="sort"
            onClick={() => setSortByEndorsements((v) => !v)}
          >
            {sortByEndorsements ? "인정순 ▾" : "최신순 ▾"}
          </button>
        </span>
      </div>
      <div className="chatlist" ref={listRef}>
        {sorted.map((message) => (
          <ChatMessageItem
            key={message.id}
            message={message}
            endorsementCount={endorsementCounts[message.id] ?? 0}
            endorsed={myEndorsedIds.has(message.id)}
            isOwn={message.device_id === deviceId}
            onEndorse={() => onEndorse(message.id)}
            onDelete={() => onDelete(message.id)}
          />
        ))}
      </div>
    </div>
  );
}
