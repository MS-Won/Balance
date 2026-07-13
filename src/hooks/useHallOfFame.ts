"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

export type HallOfFameEntry = Database["public"]["Tables"]["hall_of_fame"]["Row"];

export function useHallOfFame() {
  const [entries, setEntries] = useState<HallOfFameEntry[]>([]);

  useEffect(() => {
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("hall_of_fame")
        .select("*")
        .order("endorsement_count", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(10);
      if (!cancelled && data) setEntries(data);
    }
    load();

    const channel = supabase
      .channel("hall_of_fame")
      .on("postgres_changes", { event: "*", schema: "public", table: "hall_of_fame" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);

  return { entries };
}
