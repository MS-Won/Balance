-- supabase/migrations/0009_endorsement_toggle.sql
-- Allow removing an endorsement (ㅇㅈ toggle off), same trust model as the
-- existing public insert/update policies (see 0001_init_schema.sql comment).

create policy "public can remove own endorsement" on endorsements for delete using (true);
