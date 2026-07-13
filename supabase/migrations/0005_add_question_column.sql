-- supabase/migrations/0005_add_question_column.sql
--
-- Admin registration now separates the main "question" (질문) from the optional
-- "상세가정(선택)" note that already lives in balance_games.description. Add a
-- nullable `question` column so existing rows (which have no question) remain
-- valid; the admin form marks the field required so newly created games always
-- carry one.
alter table balance_games add column if not exists question text;
