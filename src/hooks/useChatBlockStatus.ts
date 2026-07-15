"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceIdentity";

export function useChatBlockStatus(gameId: string | undefined): boolean {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!gameId) {
      setBlocked(false);
      return;
    }
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("chat_blocks")
        .select("device_id")
        .eq("game_id", gameId!);
      if (cancelled || !data) return;
      setBlocked(data.some((row) => row.device_id === deviceId));
    }
    load();

    const channel = supabase
      .channel(`chat_blocks:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "chat_blocks", filter: `game_id=eq.${gameId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  return blocked;
}
