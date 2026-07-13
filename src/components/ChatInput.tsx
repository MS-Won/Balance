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
    <div className="chatinput">
      <input
        value={value}
        maxLength={500}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={disabled ? "먼저 투표해야 의견을 쓸 수 있어요" : "의견을 써주세요..."}
      />
      <button onClick={submit} disabled={disabled}>
        전송
      </button>
    </div>
  );
}
