-- 010: prevent duplicate gate-test answers for the same (session, question).
-- Historical duplicates were cleaned on 2026-09-11; this makes a repeat
-- submission impossible at the DB level, so it can never again inflate
-- "consecutive_correct" and grant a false pass.
-- Apply in the Supabase SQL editor (migrations are not auto-run).
CREATE UNIQUE INDEX IF NOT EXISTS gate_test_answers_session_question_key
    ON public.gate_test_answers (session_id, question_id);
