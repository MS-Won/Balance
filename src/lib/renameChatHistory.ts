import { getBrowserSupabaseClient } from "@/lib/supabase/client";

// Updates the nickname on every chat message this device has ever posted
// (not scoped to the current game), so past chat history — and any live
// representative-opinion display derived from it — reflects the new name.
export async function renameChatHistory(deviceId: string, nickname: string): Promise<void> {
  const supabase = getBrowserSupabaseClient();
  await supabase.from("chat_messages").update({ nickname }).eq("device_id", deviceId);
}
