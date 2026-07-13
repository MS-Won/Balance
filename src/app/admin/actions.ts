"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAdminSupabaseClient } from "@/lib/supabase/admin";

export async function login(formData: FormData): Promise<{ error?: string }> {
  const password = formData.get("password");
  if (typeof password !== "string" || password !== process.env.ADMIN_PASSWORD) {
    return { error: "비밀번호가 올바르지 않습니다." };
  }

  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("Missing ADMIN_SESSION_SECRET");

  (await cookies()).set("admin_session", secret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });

  redirect("/admin");
}

async function assertAdmin() {
  const session = (await cookies()).get("admin_session")?.value;
  if (!session || session !== process.env.ADMIN_SESSION_SECRET) {
    throw new Error("Not authorized");
  }
}

export async function listGames() {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { data, error } = await supabase.from("balance_games").select("*").order("date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createGame(formData: FormData) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.from("balance_games").insert({
    date: String(formData.get("date")),
    choice_a_label: String(formData.get("choice_a_label")),
    choice_b_label: String(formData.get("choice_b_label")),
    description: formData.get("description") ? String(formData.get("description")) : null,
    status: "scheduled",
  });
  if (error) throw error;
}

export async function deleteGame(id: string) {
  await assertAdmin();
  const supabase = getAdminSupabaseClient();
  const { error } = await supabase.from("balance_games").delete().eq("id", id);
  if (error) throw error;
}
