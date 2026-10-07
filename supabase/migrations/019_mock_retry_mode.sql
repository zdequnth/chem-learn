-- 019: 模拟考的「错题重测」场次。
--   full  = 完整做一遍整套卷
--   retry = 只考这份卷子里"至今没答对过"的题（题目顺序打乱）
-- 同一个学生针对同一份卷子会不断产生新的场次，用 mode 区分是哪一种。
-- 可重复执行。Apply in the Supabase SQL editor.

ALTER TABLE public.mock_test_sessions
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'full';

-- 用 DO 块加约束，重复执行不会报错
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'mock_test_sessions_mode_check'
          AND conrelid = 'public.mock_test_sessions'::regclass
    ) THEN
        ALTER TABLE public.mock_test_sessions
            ADD CONSTRAINT mock_test_sessions_mode_check
            CHECK (mode IN ('full', 'retry'));
    END IF;
END $$;
