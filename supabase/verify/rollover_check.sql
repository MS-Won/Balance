-- supabase/verify/rollover_check.sql
-- Run with: npx supabase db query --linked --file supabase/verify/rollover_check.sql
-- Expects the fixtures below to result in the 'A' side winning with the
-- highest-endorsed 'A' message going to the hall of fame.

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

  -- cleanup
  delete from hall_of_fame where game_id = g_id;
  delete from chat_messages where game_id = g_id;
  delete from votes where game_id = g_id;
  delete from balance_games where id = g_id;
end;
$$;
