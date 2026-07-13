"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId } from "@/lib/deviceIdentity";
import { computeVoteTally, type VoteTally } from "@/lib/voteTally";
import type { Database } from "@/types/database";

type Vote = Database["public"]["Tables"]["votes"]["Row"];

export function useVotes(gameId: string | undefined) {
  const [votes, setVotes] = useState<Vote[]>([]);
  const [myChoice, setMyChoice] = useState<"A" | "B" | null>(null);

  useEffect(() => {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    let cancelled = false;

    async function load() {
      const { data } = await supabase.from("votes").select("*").eq("game_id", gameId!);
      if (cancelled || !data) return;
      setVotes(data);
      setMyChoice((data.find((v) => v.device_id === deviceId)?.choice as "A" | "B") ?? null);
    }
    load();

    const channel = supabase
      .channel(`votes:${gameId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "votes", filter: `game_id=eq.${gameId}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  async function castVote(choice: "A" | "B") {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    const deviceId = getDeviceId();
    await supabase
      .from("votes")
      .upsert(
        { game_id: gameId, device_id: deviceId, choice, updated_at: new Date().toISOString() },
        { onConflict: "game_id,device_id" }
      );
    setMyChoice(choice);
  }

  const tally: VoteTally = computeVoteTally(votes as { choice: "A" | "B" }[]);

  return { tally, myChoice, castVote };
}
