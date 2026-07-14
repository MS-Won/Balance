-- supabase/migrations/0010_chat_messages_replica_identity.sql
-- REPLICA IDENTITY FULL so realtime DELETE events include the row's other
-- columns (e.g. game_id), not just the primary key. The client's
-- postgres_changes subscription filters on `game_id=eq.<id>`, which needs
-- game_id present in the deleted row to match — under the default replica
-- identity (primary key only), that filter can never match, so filtered
-- DELETE subscriptions silently never fire.

alter table chat_messages replica identity full;
