-- Remove warmup module from database
-- ============================================================

-- Drop policies first
DROP POLICY IF EXISTS "warmup_student_own" ON public.warmup_sessions;
DROP POLICY IF EXISTS "warmup_answers_student_own" ON public.warmup_answers;

-- Drop tables
DROP TABLE IF EXISTS public.warmup_answers;
DROP TABLE IF EXISTS public.warmup_sessions;

-- Remove warmup_session_id column from gate_test_sessions
ALTER TABLE public.gate_test_sessions DROP COLUMN IF EXISTS warmup_session_id;

-- Remove warmups_completed from daily_activity
ALTER TABLE public.daily_activity DROP COLUMN IF EXISTS warmups_completed;

-- Update question_type constraint
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_question_type_check;
ALTER TABLE public.questions ADD CONSTRAINT questions_question_type_check
    CHECK (question_type IN ('gate_test', 'boss_test'));
