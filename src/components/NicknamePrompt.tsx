"use client";

import { useState } from "react";

export function NicknamePrompt({ onSet }: { onSet: (nickname: string) => void }) {
  const [value, setValue] = useState("");

  function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 20) return;
    onSet(trimmed);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>어떻게 불러드릴까요?</h2>
        <p>닉네임을 정하면 균형 전쟁에 참여할 수 있어요. (최대 20자)</p>
        <input
          value={value}
          maxLength={20}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="닉네임"
        />
        <button onClick={submit}>시작하기</button>
      </div>
    </div>
  );
}
