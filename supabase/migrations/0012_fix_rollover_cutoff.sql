-- supabase/migrations/0008_fix_rollover_cutoff.sql
-- Fix a race in perform_midnight_rollover(): the aggregation cutoff was the
-- newest EXISTING game's date, not the actual KST calendar date. The admin
-- registers each day's game manually, sometime after the fixed-time midnight
-- cron fires -- so at cron time, the outgoing game was still "current" (no
-- newer row existed yet) and got skipped for a full day. Using `today`
-- directly as the cutoff removes the dependency on a new row already
-- existing.

create or replace function perform_midnight_rollover()
returns void
language plpgsql
as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
  ended_game balance_games%rowtype;
  a_count int;
  b_count int;
  winner text;
  rep_message_id uuid;
  rep_nickname text;
  rep_count int;
begin
  -- Aggregate every ended, not-yet-aggregated game (usually 0-1; the loop also
  -- catches up if cron was down for several days, or if the operator hasn't
  -- registered today's game yet). Oldest first.
  for ended_game in
    select * from balance_games
     where date < today
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
