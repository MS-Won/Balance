-- supabase/migrations/0011_unique_nicknames.sql
-- Prevent nickname impersonation: each device claims exactly one nickname,
-- and no two devices can hold the same nickname at once (unique constraint).
-- Claiming/changing a nickname upserts this device's row; a nickname already
-- claimed by a different device fails with a unique-violation (23505), which
-- the client surfaces as "이미 사용 중인 닉네임" rather than allowing reuse.

create table device_nicknames (
  device_id text primary key,
  nickname text not null unique,
  updated_at timestamptz not null default now()
);

alter table device_nicknames enable row level security;

create policy "public can read nicknames" on device_nicknames for select using (true);
create policy "public can claim own nickname" on device_nicknames for insert with check (true);
create policy "public can update own nickname" on device_nicknames for update using (true);
