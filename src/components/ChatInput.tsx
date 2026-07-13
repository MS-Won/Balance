"use client";

import { useState } from "react";

export function ChatInput({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (disabled || value.trim().length === 0) return;
    onSend(value);
    setValue("");
  }

  return (
    <div className="flex gap-1">
      <input
        className="flex-1 border rounded-md px-2 py-1 text-sm"
        value={value}
        maxLength={500}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="💬 채팅 입력..."
      />
      <button
        onClick={submit}
        disabled={disabled}
        className="bg-neutral-800 text-white rounded-md px-3 text-sm font-bold disabled:opacity-40"
      >
        전송
      </button>
    </div>
  );
}
