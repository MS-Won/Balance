-- supabase/migrations/0004_hall_of_fame_cascade.sql
--
-- 0001 gave votes.game_id, chat_messages.game_id, and endorsements.message_id
-- `on delete cascade`, but left hall_of_fame.game_id -> balance_games(id) and
-- hall_of_fame.message_id -> chat_messages(id) without cascade. Result:
-- deleteGame(id) (src/app/admin/actions.ts) on any game that produced a
-- hall_of_fame entry throws a raw foreign-key violation — the cascade delete
-- of the game's chat_messages hits the un-cascaded hall_of_fame.message_id
-- reference, and hall_of_fame.game_id references the game directly. The
-- delete button is rendered on every admin row including ended ones, so this
-- is UI-reachable. This migration brings hall_of_fame in line with the other
-- tables' cascade behavior so deleting a game also deletes its hall_of_fame
-- entries.
--
-- The two FKs were declared inline without explicit names in 0001, so under
-- Postgres's default naming convention they should be named
-- hall_of_fame_game_id_fkey and hall_of_fame_message_id_fkey. To stay correct
-- even if that assumption is wrong (e.g. names changed by a prior manual
-- migration on the live DB), look the actual constraint names up from
-- information_schema rather than hard-coding them.

do $$
declare
  game_id_fk text;
  message_id_fk text;
begin
  select tc.constraint_name into game_id_fk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'hall_of_fame'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'game_id'
  limit 1;

  select tc.constraint_name into message_id_fk
  from information_schema.table_constraints tc
  join information_schema.key_column_usage kcu
    on kcu.constraint_name = tc.constraint_name
   and kcu.table_schema = tc.table_schema
  where tc.table_schema = 'public'
    and tc.table_name = 'hall_of_fame'
    and tc.constraint_type = 'FOREIGN KEY'
    and kcu.column_name = 'message_id'
  limit 1;

  if game_id_fk is null then
    game_id_fk := 'hall_of_fame_game_id_fkey';
  end if;
  if message_id_fk is null then
    message_id_fk := 'hall_of_fame_message_id_fkey';
  end if;

  execute format('alter table hall_of_fame drop constraint if exists %I', game_id_fk);
  execute format('alter table hall_of_fame drop constraint if exists %I', message_id_fk);
end $$;

alter table hall_of_fame
  add constraint hall_of_fame_game_id_fkey
  foreign key (game_id) references balance_games(id) on delete cascade;

alter table hall_of_fame
  add constraint hall_of_fame_message_id_fkey
  foreign key (message_id) references chat_messages(id) on delete cascade;
