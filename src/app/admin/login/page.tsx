"use client";

import { useState } from "react";
import { login } from "@/app/admin/actions";

export default function AdminLoginPage() {
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="mx-auto max-w-xs p-4">
      <h1 className="font-bold text-sm mb-2">관리자 로그인</h1>
      <form
        action={async (formData) => {
          const result = await login(formData);
          if (result?.error) setError(result.error);
        }}
        className="space-y-2"
      >
        <input
          type="password"
          name="password"
          className="border rounded-md w-full px-2 py-1 text-sm"
          placeholder="비밀번호"
        />
        <button type="submit" className="w-full bg-neutral-800 text-white rounded-md py-2 text-sm">
          로그인
        </button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </form>
    </main>
  );
}
