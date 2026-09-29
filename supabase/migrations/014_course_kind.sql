-- 014: distinguish a vocabulary course from a gate-test course.
--   'gate' = normal knowledge-point course (课程 → 章节 → 课时 → 关卡测试)
--   'vocab' = vocabulary-only course (背单词); the student entry point is /vocab
-- Reason: the two were indistinguishable in the student course list, so a vocab
-- class showed the gate-test ladder and only reached words after two clicks.
-- Apply in the Supabase SQL editor.

ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'gate';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'courses_kind_check'
    ) THEN
        ALTER TABLE public.courses
            ADD CONSTRAINT courses_kind_check CHECK (kind IN ('gate', 'vocab'));
    END IF;
END $$;
