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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-md p-4 w-full max-w-xs space-y-3">
        <h2 className="font-bold text-sm">닉네임을 입력해주세요</h2>
        <input
          className="border rounded-md w-full px-2 py-1 text-sm"
          value={value}
          maxLength={20}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="최대 20자"
        />
        <button
          onClick={submit}
          className="w-full bg-neutral-800 text-white rounded-md py-2 text-sm font-bold"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
