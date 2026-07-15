-- supabase/verify/chat_block_check.sql
-- Run with: npx supabase db query --linked --file supabase/verify/chat_block_check.sql
--
-- SAFE AGAINST LIVE DATA. Wrapped in begin; … rollback; so nothing is
-- committed. On success the server emits `NOTICE: PASS …`; any assertion
-- failure raises an exception (exit 1).
--
-- IMPORTANT: `supabase db query --linked` connects as the `postgres`
-- superuser, which bypasses RLS entirely. To actually exercise the
-- chat_messages insert policy (as the real anon-key app traffic does), the
-- assertions below run under `set role anon`, switching back to the
-- original role only for setup steps that need elevated privileges
-- (creating fixture games, inserting into chat_blocks, which has no public
-- write policy by design).
--
-- Scenarios:
--   * Normal: an unblocked device can post to a game.
--   * Blocked: once (game, device) is in chat_blocks, that device's INSERT
--     into chat_messages for that game is rejected by RLS.
--   * Scoped: a different device in the same game is unaffected.
--   * Per-game: the blocked device can still post to a DIFFERENT game.
--   * Profanity: a message containing a filtered term is rejected by the
--     chat_messages_no_profanity check constraint.

begin;

delete from balance_games;

-- Setup (elevated role): create the two fixture games.
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  insert into balance_games (date, choice_a_label, choice_b_label) values (v_today, 'A', 'B');
  insert into balance_games (date, choice_a_label, choice_b_label) values (v_today - 1, 'A', 'B');
end;
$$;

set role anon;

-- Normal (as anon): unblocked device can post.
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  g1_id uuid;
  v_count int;
begin
  select id into g1_id from balance_games where date = v_today;

  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g1_id, 'd1', 'nick1', 'A', 'hello');
  select count(*) into v_count from chat_messages where game_id = g1_id and device_id = 'd1';
  if v_count <> 1 then
    raise exception 'FAIL normal: expected 1 message from d1, got %', v_count;
  end if;
end;
$$;

reset role;

-- Block d1 for g1 (elevated role: chat_blocks has no public write policy).
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  g1_id uuid;
begin
  select id into g1_id from balance_games where date = v_today;
  insert into chat_blocks (game_id, device_id) values (g1_id, 'd1');
end;
$$;

set role anon;

-- Blocked / scoped / per-game / profanity (as anon).
do $$
declare
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  g1_id uuid;
  g2_id uuid;
  v_count int;
  v_failed boolean;
begin
  select id into g1_id from balance_games where date = v_today;
  select id into g2_id from balance_games where date = v_today - 1;

  -- Blocked: d1 can no longer post to g1.
  v_failed := false;
  begin
    insert into chat_messages (game_id, device_id, nickname, choice, content)
      values (g1_id, 'd1', 'nick1', 'A', 'should be blocked');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL blocked: d1 was able to post to g1 after being blocked';
  end if;

  -- Scoped: a different device (d2) in the same game is unaffected.
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g1_id, 'd2', 'nick2', 'B', 'still fine');
  select count(*) into v_count from chat_messages where game_id = g1_id and device_id = 'd2';
  if v_count <> 1 then
    raise exception 'FAIL scoped: expected 1 message from d2, got %', v_count;
  end if;

  -- Per-game: d1 (blocked in g1) can still post to g2.
  insert into chat_messages (game_id, device_id, nickname, choice, content)
    values (g2_id, 'd1', 'nick1', 'A', 'different game, fine');
  select count(*) into v_count from chat_messages where game_id = g2_id and device_id = 'd1';
  if v_count <> 1 then
    raise exception 'FAIL per-game: expected d1 to post to g2, got % rows', v_count;
  end if;

  -- Profanity: a filtered term is rejected.
  v_failed := false;
  begin
    insert into chat_messages (game_id, device_id, nickname, choice, content)
      values (g1_id, 'd3', 'nick3', 'A', '이 씨발 진짜');
  exception when others then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'FAIL profanity: profane message was accepted';
  end if;

  raise notice 'PASS: chat_blocks enforcement (blocked/scoped/per-game) and profanity constraint all behave as expected';
end;
$$;

reset role;

rollback;
