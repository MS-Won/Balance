"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceIdentity";
import type { Database } from "@/types/database";

type Endorsement = Database["public"]["Tables"]["endorsements"]["Row"];

export function useEndorsements(gameId: string | undefined) {
  const [endorsements, setEndorsements] = useState<Endorsement[]>([]);

  useEffect(() => {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("endorsements")
        .select("*, chat_messages!inner(game_id)")
        .eq("chat_messages.game_id", gameId!);
      if (!cancelled && data) setEndorsements(data as unknown as Endorsement[]);
    }
    load();

    const channel = supabase
      .channel(`endorsements:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "endorsements" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  async function endorse(messageId: string) {
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    await supabase.from("endorsements").insert({ message_id: messageId, device_id: deviceId });
  }

  const deviceId = typeof window !== "undefined" ? getDeviceId() : "";
  const counts: Record<string, number> = {};
  const myEndorsedIds = new Set<string>();
  for (const e of endorsements) {
    counts[e.message_id] = (counts[e.message_id] ?? 0) + 1;
    if (e.device_id === deviceId) myEndorsedIds.add(e.message_id);
  }

  return { counts, myEndorsedIds, endorse };
}
