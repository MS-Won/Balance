"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type BalanceGame = Database["public"]["Tables"]["balance_games"]["Row"];

export function useActiveGame() {
  const [game, setGame] = useState<BalanceGame | null>(null);
  const [lastEndedGame, setLastEndedGame] = useState<BalanceGame | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const [{ data: active }, { data: ended }] = await Promise.all([
        supabase.from("balance_games").select("*").eq("status", "active").maybeSingle(),
        supabase
          .from("balance_games")
          .select("*")
          .eq("status", "ended")
          .order("date", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!cancelled) {
        setGame(active ?? null);
        setLastEndedGame(ended ?? null);
        setLoading(false);
      }
    }
    load();

    const channel = supabase
      .channel("balance_games:active")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "balance_games" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { game, lastEndedGame, loading };
}
