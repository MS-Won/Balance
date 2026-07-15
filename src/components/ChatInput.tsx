"use client";

import { useState } from "react";
import { containsProfanity } from "@/lib/profanityFilter";

export function ChatInput({
  disabled,
  blocked,
  onSend,
}: {
  disabled: boolean;
  blocked: boolean;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const isDisabled = disabled || blocked;

  function submit() {
    if (isDisabled || value.trim().length === 0) return;
    if (containsProfanity(value)) {
      setError("부적절한 표현이 포함되어 있어요");
      return;
    }
    setError(null);
    onSend(value);
    setValue("");
  }

  function placeholder(): string {
    if (blocked) return "잠시 채팅을 제한합니다";
    if (disabled) return "먼저 투표해야 의견을 쓸 수 있어요";
    return "의견을 써주세요...";
  }

  return (
    <div>
      <div className="chatinput">
        <input
          value={value}
          maxLength={500}
          disabled={isDisabled}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder={placeholder()}
        />
        <button onClick={submit} disabled={isDisabled}>
          전송
        </button>
      </div>
      {error && <p className="chatinput-error">{error}</p>}
    </div>
  );
}
