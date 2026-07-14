-- supabase/migrations/0007_date_based_rollover.sql
-- Redesign perform_midnight_rollover() for the date-based game model.
-- The app selects the "current" game by date (useActiveGame: newest date <= today
-- KST), never by status. The old rollover keyed off status='active', which no
-- game ever becomes, so hall_of_fame aggregation had silently stopped. This
-- rewrite aggregates each ended game exactly once, guarded by an aggregated_at
-- marker. See docs/superpowers/specs/2026-07-14-date-based-rollover-design.md.

-- 1. Idempotency marker.
alter table balance_games add column if not exists aggregated_at timestamptz;

-- 2. Backfill: mark already-past games aggregated so the first run does NOT
--    retroactively re-aggregate existing production data. Today's game and
--    future scheduled games stay NULL (eligible once they end).
update balance_games
   set aggregated_at = now()
 where aggregated_at is null
   and date < (now() at time zone 'Asia/Seoul')::date;

-- 3. Date-based rollover. NOTE: create-or-replace only — the existing
--    'midnight-rollover' cron job (0 15 * * * = KST midnight) already calls
--    this function name, so we do NOT re-schedule it here.
create or replace function perform_midnight_rollover()
returns void
language plpgsql
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  current_game balance_games%rowtype;
  ended_game balance_games%rowtype;
  a_count int;
  b_count int;
  winner text;
  rep_message_id uuid;
  rep_nickname text;
  rep_count int;
begin
  -- The current game is the newest one whose date has arrived. Games strictly
  -- older than it have "ended" and are eligible for aggregation.
  select * into current_game
    from balance_games
    where date <= today
    order by date desc
    limit 1;
  if not found then
    return;
  end if;

  -- Aggregate every ended, not-yet-aggregated game (usually 0-1; the loop also
  -- catches up if cron was down for several days). Oldest first.
  for ended_game in
    select * from balance_games
     where date < current_game.date
       and aggregated_at is null
     order by date asc
  loop
    select count(*) filter (where choice = 'A'),
           count(*) filter (where choice = 'B')
      into a_count, b_count
      from votes
      where game_id = ended_game.id;

    winner := case when coalesce(a_count, 0) >= coalesce(b_count, 0)
                   then 'A' else 'B' end;

    -- Reset so a game with no winning-side chat leaves rep_message_id NULL.
    rep_message_id := null;
    rep_nickname := null;
    rep_count := null;

    select cm.id, cm.nickname, count(e.id)
      into rep_message_id, rep_nickname, rep_count
      from chat_messages cm
      left join endorsements e on e.message_id = cm.id
      where cm.game_id = ended_game.id and cm.choice = winner
      group by cm.id, cm.nickname
      order by count(e.id) desc, cm.created_at asc
      limit 1;

    if rep_message_id is not null then
      insert into hall_of_fame
        (game_id, date, winning_choice, message_id, nickname, endorsement_count)
      values
        (ended_game.id, ended_game.date, winner, rep_message_id, rep_nickname,
         coalesce(rep_count, 0));
    end if;

    -- Always mark aggregated, even with no representative, so we never retry.
    update balance_games set aggregated_at = now() where id = ended_game.id;
  end loop;

  -- Keep only the top 10 leaderboard entries (unchanged from prior design).
  delete from hall_of_fame
   where id not in (
     select id from hall_of_fame
      order by endorsement_count desc, created_at asc
      limit 10
   );
end;
$$;
