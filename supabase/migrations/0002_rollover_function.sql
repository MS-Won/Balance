-- supabase/migrations/0002_rollover_function.sql

create extension if not exists pg_cron with schema extensions;

create or replace function perform_midnight_rollover()
returns void
language plpgsql
as $$
declare
  active_game balance_games%rowtype;
  next_game balance_games%rowtype;
  a_count int;
  b_count int;
  winner text;
  rep_message_id uuid;
  rep_nickname text;
  rep_count int;
begin
  select * into active_game from balance_games where status = 'active' order by date asc limit 1;
  if not found then
    return;
  end if;

  select count(*) filter (where choice = 'A'), count(*) filter (where choice = 'B')
    into a_count, b_count
    from votes
    where game_id = active_game.id;

  winner := case when coalesce(a_count, 0) >= coalesce(b_count, 0) then 'A' else 'B' end;

  select cm.id, cm.nickname, count(e.id)
    into rep_message_id, rep_nickname, rep_count
    from chat_messages cm
    left join endorsements e on e.message_id = cm.id
    where cm.game_id = active_game.id and cm.choice = winner
    group by cm.id, cm.nickname
    order by count(e.id) desc, cm.created_at asc
    limit 1;

  if rep_message_id is not null then
    insert into hall_of_fame (game_id, date, winning_choice, message_id, nickname, endorsement_count)
    values (active_game.id, active_game.date, winner, rep_message_id, rep_nickname, coalesce(rep_count, 0));

    delete from hall_of_fame
    where id not in (
      select id from hall_of_fame order by endorsement_count desc, created_at asc limit 10
    );
  end if;

  update balance_games set status = 'ended' where id = active_game.id;

  select * into next_game
    from balance_games
    where status = 'scheduled'
    order by date asc
    limit 1;

  if found then
    update balance_games set status = 'active' where id = next_game.id;
  end if;
end;
$$;

select cron.schedule(
  'midnight-rollover',
  '0 15 * * *',
  $$select perform_midnight_rollover();$$
);
