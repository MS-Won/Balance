create table chat_blocks (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id) on delete cascade,
  device_id text not null,
  blocked_at timestamptz not null default now(),
  unique (game_id, device_id)
);

alter table chat_blocks enable row level security;

-- Public read so a blocked device's own client can detect its block status
-- (device_id is already visible to anyone via chat_messages, so this adds
-- no new exposure). No public insert/update/delete: only the service-role
-- admin client (src/app/admin/actions.ts) can block/unblock.
create policy "public can read chat blocks" on chat_blocks for select using (true);

-- Replace the wide-open chat post policy with one that rejects INSERTs from
-- a device blocked in this specific game.
drop policy "public can post chat" on chat_messages;
create policy "public can post chat" on chat_messages for insert
  with check (
    not exists (
      select 1 from chat_blocks
      where chat_blocks.game_id = chat_messages.game_id
        and chat_blocks.device_id = chat_messages.device_id
    )
  );

-- Profanity filter, enforced at the DB level in addition to the client-side
-- check in src/lib/profanityFilter.ts (keep both lists in sync manually --
-- this is a small, hand-curated starting list, not exhaustive detection).
alter table chat_messages
  add constraint chat_messages_no_profanity
  check (content !~* '(씨발|씨팔|씨불|개새끼|개새꺄|병신|지랄|좆|좇|존나|니미럴|느금마|걸레년|창녀|미친놈|미친년)');
