-- supabase/verify/date_based_rollover_check.sql
-- Run with: npx supabase db query --linked --file supabase/verify/date_based_rollover_check.sql
--
-- SAFE AGAINST LIVE DATA. dev/prod share ONE hosted Supabase project, so this
-- runs against the live DB. The whole script is wrapped in begin; … rollback;
-- so NOTHING is committed: the clean-slate delete, the fixtures, and every side
-- effect of perform_midnight_rollover() are all discarded. On success the server
-- emits `NOTICE: PASS …`; any assertion failure raises an exception (exit 1).
--
-- Scenarios (all in one run):
--   * Normal: a past game with votes+chat+endorsements is aggregated (winner A,
--     representative = most-endorsed A message).
--   * Catch-up loop: two past games behind one current game both get aggregated.
--   * No representative: a past game whose winning side has no chat gets NO
--     hall_of_fame row but IS marked aggregated (no infinite retry).
--   * Idempotent: a second rollover() call changes nothing.

begin;

-- Clean slate so assertions are deterministic. Cascades to votes/chat/
-- endorsements/hall_of_fame (FKs are on delete cascade). Rolled back below.
delete from balance_games;

do $$
declare
  c_id uuid;   -- current game (newest date <= today)
  p1_id uuid;  -- past game with a valid representative
  p0_id uuid;  -- past game whose winner side has no chat
  m1 uuid;
  m2 uuid;
  hof_total int;
  hof_p1 int;
  hof_p1_nick text;
  hof_p1_choice text;
  hof_p1_count int;
  hof_p0 int;
  p0_marked timestamptz;
  c_marked timestamptz;
begin
  -- Current game: newest date <= today, so rollover treats it as "current"
  -- and never aggregates it. 2000-01-10 is safely <= today.
  insert into balance_games (date, choice_a_label, choice_b_label)
    values ('2000-01-10', 'CUR_A', 'CUR_B') returning id into c_id;

  -- Past game P1 (normal): winner A (2 A vs 1 B); A-side messages m1/m2,
  -- m1 most endorsed (2 vs 1) -> representative = winner_nick.
  insert into balance_games (date, choice_a_label, choice_b_label)
    values ('2000-01-05', 'P1_A', 'P1_B') returning id into p1_id;
  insert into votes (game_id, device_id, choice) values
    (p1_id, 'd1', 'A'), (p1_id, 'd2', 'A'), (p1_id, 'd3', 'B');
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p1_id, 'd1', 'winner_nick', 'A', 'best A') returning id into m1;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p1_id, 'd2', 'other_a', 'A', 'weaker A') returning id into m2;
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p1_id, 'd3', 'b_nick', 'B', 'a B');
  insert into endorsements (message_id, device_id) values
    (m1, 'd2'), (m1, 'd3'), (m2, 'd3');

  -- Past game P0 (no representative): winner A (1 A vs 0 B) but only a B-side
  -- chat message exists -> no A-side message -> no hall_of_fame row expected.
  insert into balance_games (date, choice_a_label, choice_b_label)
    values ('2000-01-01', 'P0_A', 'P0_B') returning id into p0_id;
  insert into votes (game_id, device_id, choice) values (p0_id, 'd4', 'A');
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (p0_id, 'd4', 'lonely_b', 'B', 'only a B msg');

  perform perform_midnight_rollover();

  -- P1 aggregated: exactly one HoF row, winner_nick, choice A, count 2.
  select count(*), max(nickname), max(winning_choice), max(endorsement_count)
    into hof_p1, hof_p1_nick, hof_p1_choice, hof_p1_count
    from hall_of_fame where game_id = p1_id;
  if hof_p1 <> 1 or hof_p1_nick <> 'winner_nick'
     or hof_p1_choice <> 'A' or hof_p1_count <> 2 then
    raise exception 'FAIL P1: got count=% nick=% choice=% endorse=%',
      hof_p1, hof_p1_nick, hof_p1_choice, hof_p1_count;
  end if;

  -- P0: no HoF row, but marked aggregated.
  select count(*) into hof_p0 from hall_of_fame where game_id = p0_id;
  if hof_p0 <> 0 then
    raise exception 'FAIL P0: expected 0 hall_of_fame rows, got %', hof_p0;
  end if;
  select aggregated_at into p0_marked from balance_games where id = p0_id;
  if p0_marked is null then
    raise exception 'FAIL P0: expected aggregated_at set, got NULL';
  end if;

  -- Current game must NOT be aggregated.
  select aggregated_at into c_marked from balance_games where id = c_id;
  if c_marked is not null then
    raise exception 'FAIL current: current game was aggregated (should not be)';
  end if;

  -- Total HoF rows from our fixtures = 1 (only P1).
  select count(*) into hof_total from hall_of_fame;
  if hof_total <> 1 then
    raise exception 'FAIL total: expected 1 hall_of_fame row, got %', hof_total;
  end if;

  -- Idempotency: a second rollover changes nothing.
  perform perform_midnight_rollover();
  select count(*) into hof_total from hall_of_fame;
  if hof_total <> 1 then
    raise exception 'FAIL idempotent: expected 1 row after re-run, got %', hof_total;
  end if;

  raise notice 'PASS: date-based rollover aggregated past games once, skipped current, idempotent';
end;
$$;

rollback;
