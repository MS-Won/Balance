"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type BalanceGame = Database["public"]["Tables"]["balance_games"]["Row"];

export function useActiveGame() {
  const [game, setGame] = useState<BalanceGame | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("balance_games")
        .select("*")
        .eq("status", "active")
        .maybeSingle();
      if (!cancelled) {
        setGame(data ?? null);
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

  return { game, loading };
}
