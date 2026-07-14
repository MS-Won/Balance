-- supabase/migrations/0008_chat_message_edit_delete.sql
-- Allow chat message updates (nickname rename propagation) and deletes
-- (author-initiated message removal). Same trust model as the existing
-- "public can update own vote" policy (see 0001_init_schema.sql comment):
-- anonymous, device_id-based app, RLS guards cross-table mischief only, not
-- identity spoofing.

create policy "public can update own chat" on chat_messages for update using (true);
create policy "public can delete own chat" on chat_messages for delete using (true);
