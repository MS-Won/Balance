"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getTodayKST } from "@/lib/kstDate";
import { msUntilNextMidnightKST } from "@/lib/countdown";
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
      // Date-driven selection: the "current" game is the most recent one whose
      // date has arrived (<= today in KST); the game before it is shown as
      // yesterday's result. This makes scheduled games appear automatically on
      // their date and self-heals if the active chain is ever empty — no
      // dependence on a mutable status flag.
      const today = getTodayKST();
      const { data } = await supabase
        .from("balance_games")
        .select("*")
        .lte("date", today)
        .order("date", { ascending: false })
        .limit(2);

      if (!cancelled) {
        setGame(data?.[0] ?? null);
        setLastEndedGame(data?.[1] ?? null);
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

    // Don't rely solely on a DB write to trigger the reload above — the
    // rollover cron only touches balance_games when there's something to
    // aggregate, so a quiet midnight (nothing to roll over) would otherwise
    // leave an open tab showing yesterday's game/chat. Re-check directly at
    // the KST midnight boundary, then keep rescheduling for the next one so
    // a tab left open across multiple days keeps rolling over.
    let midnightTimer: ReturnType<typeof setTimeout>;
    function scheduleMidnightReload() {
      midnightTimer = setTimeout(() => {
        load();
        scheduleMidnightReload();
      }, msUntilNextMidnightKST() + 1000);
    }
    scheduleMidnightReload();

    return () => {
      cancelled = true;
      clearTimeout(midnightTimer);
      supabase.removeChannel(channel);
    };
  }, []);

  return { game, lastEndedGame, loading };
}
