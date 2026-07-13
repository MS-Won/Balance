import "server-only";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

let adminClient: SupabaseClient<Database> | undefined;

export function getAdminSupabaseClient(): SupabaseClient<Database> {
  if (adminClient) return adminClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  adminClient = createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
  return adminClient;
}
