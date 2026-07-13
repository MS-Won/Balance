-- supabase/migrations/0003_hall_of_fame_realtime.sql
--
-- hall_of_fame was created in 0001 but never added to the supabase_realtime
-- publication (0001 added votes, chat_messages, endorsements, balance_games).
-- Without this, the postgres_changes subscription in useHallOfFame never fires,
-- so the Hall of Fame card only updates on a full page reload. Public read is
-- already permitted by the "public can read hall of fame" RLS policy from 0001.
alter publication supabase_realtime add table hall_of_fame;
