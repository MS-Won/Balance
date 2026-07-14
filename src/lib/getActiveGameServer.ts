import "server-only";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";
import { getTodayKST } from "@/lib/kstDate";
import type { BalanceGame } from "@/hooks/useActiveGame";

// Server-side equivalent of useActiveGame's selection: the most recent game
// whose date has arrived (<= today in KST). Used for page metadata and the
// generated share-preview (opengraph) image, which can't use the client hook.
export async function getActiveGameServer(): Promise<BalanceGame | null> {
  const supabase = getAdminSupabaseClient();
  const { data } = await supabase
    .from("balance_games")
    .select("*")
    .lte("date", getTodayKST())
    .order("date", { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}
