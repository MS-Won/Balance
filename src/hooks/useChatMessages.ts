"use client";

import { useEffect, useState } from "react";
import { getBrowserSupabaseClient } from "@/lib/supabase/client";
import { getDeviceId, getNickname } from "@/lib/deviceIdentity";
import type { Database } from "@/types/database";

export type ChatMessage = Database["public"]["Tables"]["chat_messages"]["Row"];

export function useChatMessages(gameId: string | undefined) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (!gameId) return;
    const supabase = getBrowserSupabaseClient();
    let cancelled = false;

    async function load() {
      const { data } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("game_id", gameId!)
        .order("created_at", { ascending: true });
      if (!cancelled && data) setMessages(data);
    }
    load();

    const channel = supabase
      .channel(`chat_messages:${gameId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as ChatMessage]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const updated = payload.new as ChatMessage;
          setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
        }
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "chat_messages", filter: `game_id=eq.${gameId}` },
        (payload) => {
          const deletedId = (payload.old as Partial<ChatMessage>).id;
          setMessages((prev) => prev.filter((m) => m.id !== deletedId));
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  async function sendMessage(content: string, choice: "A" | "B") {
    if (!gameId) return;
    const trimmed = content.trim();
    if (trimmed.length === 0 || trimmed.length > 500) return;

    const supabase = getBrowserSupabaseClient();
    await supabase.from("chat_messages").insert({
      game_id: gameId,
      device_id: getDeviceId(),
      nickname: getNickname() ?? "익명",
      choice,
      content: trimmed,
    });
  }

  async function deleteMessage(messageId: string) {
    const supabase = getBrowserSupabaseClient();
    await supabase
      .from("chat_messages")
      .delete()
      .eq("id", messageId)
      .eq("device_id", getDeviceId());
  }

  return { messages, sendMessage, deleteMessage };
}
