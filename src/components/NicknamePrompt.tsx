"use client";

import { useState } from "react";
import { getDeviceId } from "@/lib/deviceIdentity";
import { claimNickname } from "@/lib/claimNickname";

export function NicknamePrompt({
  onSet,
  onCancel,
  initialValue = "",
}: {
  onSet: (nickname: string) => void;
  onCancel?: () => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 10) return;

    setError(null);
    setSubmitting(true);
    const result = await claimNickname(getDeviceId(), trimmed);
    setSubmitting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    onSet(trimmed);
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>어떻게 불러드릴까요?</h2>
        <p>닉네임을 정하면 &apos;밸런스 게임&apos;에 참여할 수 있어요. (최대 10자)</p>
        <input
          value={value}
          maxLength={10}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="닉네임"
        />
        {error && <p className="nickname-error">{error}</p>}
        <button onClick={submit} disabled={submitting}>
          {submitting ? "확인 중..." : onCancel ? "변경하기" : "시작하기"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="cancel">
            취소
          </button>
        )}
      </div>
    </div>
  );
}
