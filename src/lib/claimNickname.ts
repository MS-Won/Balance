import { getBrowserSupabaseClient } from "@/lib/supabase/client";

// Claims (or re-claims, on change) a nickname for this device. Fails with a
// friendly message if another device already holds it — the database's
// unique constraint on `nickname` is the actual source of truth, so this is
// safe even if two devices race to claim the same name.
export async function claimNickname(
  deviceId: string,
  nickname: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getBrowserSupabaseClient();
  const { error } = await supabase
    .from("device_nicknames")
    .upsert({ device_id: deviceId, nickname, updated_at: new Date().toISOString() }, { onConflict: "device_id" });

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "이미 사용 중인 닉네임이에요. 다른 닉네임을 입력해주세요." };
    }
    return { ok: false, error: "닉네임을 저장하지 못했어요. 잠시 후 다시 시도해주세요." };
  }
  return { ok: true };
}
