-- supabase/migrations/0006_choice_descriptions.sql
--
-- The 상세가정(detail assumption) note moves from a single game-level field onto
-- each choice. Add a nullable description column per side. The old
-- balance_games.description column is left in place but no longer used by the UI.
alter table balance_games add column if not exists choice_a_description text;
alter table balance_games add column if not exists choice_b_description text;
