-- supabase/verify/rollover_check.sql
-- Run with: npx supabase db query --linked --file supabase/verify/rollover_check.sql
--
-- SAFE AGAINST LIVE DATA. This project shares ONE hosted Supabase project for
-- dev and production, so this check runs against the live database. The entire
-- check is therefore wrapped in a transaction that is ALWAYS rolled back:
-- none of perform_midnight_rollover()'s side effects on real rows -- ending
-- the active game, activating the next scheduled game, or trimming the shared
-- hall_of_fame down to the top 10 -- are ever committed. The fixture rows are
-- discarded by the same rollback, so no explicit cleanup is needed.
--
-- Expects the fixtures below to result in the 'A' side winning with the
-- highest-endorsed 'A' message going to the hall of fame. On success the
-- server emits `NOTICE: PASS: ...`; any assertion failure raises an exception.

begin;

-- Clear hall_of_fame so the assertion below is deterministic regardless of how
-- many real leaderboard entries the shared live DB already holds. Safe because
-- the whole script is rolled back -- the live rows are restored on rollback.
delete from hall_of_fame;

do $$
declare
  g_id uuid;
  m1 uuid;
  m2 uuid;
  m3 uuid;
  result_status text;
  hof_count int;
  hof_nickname text;
begin
  -- Fixture game dated 2000-01-01 so perform_midnight_rollover()'s
  -- `order by date asc` active-game pick deterministically targets THIS row
  -- (the oldest active game) rather than the live production game.
  insert into balance_games (date, choice_a_label, choice_b_label, status)
    values ('2000-01-01', 'A_TEST', 'B_TEST', 'active') returning id into g_id;

  insert into votes (game_id, device_id, choice) values
    (g_id, 'dev-1', 'A'), (g_id, 'dev-2', 'A'), (g_id, 'dev-3', 'B');

  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g_id, 'dev-1', 'winner_nick', 'A', 'best A argument') returning id into m1;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g_id, 'dev-2', 'other_a', 'A', 'weaker A argument') returning id into m2;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g_id, 'dev-3', 'b_nick', 'B', 'B argument') returning id into m3;

  insert into endorsements (message_id, device_id) values
    (m1, 'dev-2'), (m1, 'dev-3'), (m2, 'dev-3');

  perform perform_midnight_rollover();

  select status into result_status from balance_games where id = g_id;
  if result_status <> 'ended' then
    raise exception 'FAIL: expected game status ended, got %', result_status;
  end if;

  select count(*), max(nickname) into hof_count, hof_nickname
    from hall_of_fame where game_id = g_id;
  if hof_count <> 1 or hof_nickname <> 'winner_nick' then
    raise exception 'FAIL: expected 1 hall_of_fame row for winner_nick, got % / %', hof_count, hof_nickname;
  end if;

  raise notice 'PASS: rollover picked the correct winner and hall of fame entrant';
end;
$$;

-- Discard everything above (fixtures AND the function's side effects on live rows).
rollback;
