-- supabase/migrations/0001_init_schema.sql

create table balance_games (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  choice_a_label text not null,
  choice_b_label text not null,
  description text,
  status text not null default 'scheduled' check (status in ('scheduled', 'active', 'ended')),
  created_at timestamptz not null default now()
);

create table votes (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id) on delete cascade,
  device_id text not null,
  choice text not null check (choice in ('A', 'B')),
  updated_at timestamptz not null default now(),
  unique (game_id, device_id)
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id) on delete cascade,
  device_id text not null,
  nickname text not null,
  choice text not null check (choice in ('A', 'B')),
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create table endorsements (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references chat_messages(id) on delete cascade,
  device_id text not null,
  created_at timestamptz not null default now(),
  unique (message_id, device_id)
);

create table hall_of_fame (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references balance_games(id),
  date date not null,
  winning_choice text not null check (winning_choice in ('A', 'B')),
  message_id uuid not null references chat_messages(id),
  nickname text not null,
  endorsement_count int not null,
  created_at timestamptz not null default now()
);

create index votes_game_id_idx on votes(game_id);
create index chat_messages_game_id_idx on chat_messages(game_id);
create index endorsements_message_id_idx on endorsements(message_id);

-- Anonymous, device_id-based app: no Supabase Auth, so RLS only guards
-- against cross-table mischief, not identity spoofing (see spec §7 — abuse
-- prevention is explicitly out of scope for this phase).
alter table balance_games enable row level security;
alter table votes enable row level security;
alter table chat_messages enable row level security;
alter table endorsements enable row level security;
alter table hall_of_fame enable row level security;

create policy "public can read games" on balance_games for select using (true);
create policy "public can read votes" on votes for select using (true);
create policy "public can upsert own vote" on votes for insert with check (true);
create policy "public can update own vote" on votes for update using (true);
create policy "public can read chat" on chat_messages for select using (true);
create policy "public can post chat" on chat_messages for insert with check (true);
create policy "public can read endorsements" on endorsements for select using (true);
create policy "public can endorse" on endorsements for insert with check (true);
create policy "public can read hall of fame" on hall_of_fame for select using (true);

-- balance_games has no public insert/update/delete policy: only the
-- service-role admin client (Task 2 admin.ts) can manage questions.

alter publication supabase_realtime add table votes;
alter publication supabase_realtime add table chat_messages;
alter publication supabase_realtime add table endorsements;
alter publication supabase_realtime add table balance_games;
