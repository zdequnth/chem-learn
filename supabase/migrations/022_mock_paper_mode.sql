-- 022: 一份模拟卷子一种作答模式 + 简答卷的判分状态。
--
-- 建卷时就定好这份卷子是选择题还是简答题，学生端、判分、复盘都只按一种形态走，
-- 不用到处分支。注意：题目自己的 answer_type 字段保留不动，数据层仍允许混排，
-- 这里只是把它做成界面上的约束 —— 以后真要放开混合卷子，改界面即可，不必再迁移。
--
-- 可重复执行。Apply in the Supabase SQL editor。

ALTER TABLE public.mock_papers
    ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'choice';

ALTER TABLE public.mock_papers DROP CONSTRAINT IF EXISTS mock_papers_mode_check;
ALTER TABLE public.mock_papers
    ADD CONSTRAINT mock_papers_mode_check CHECK (mode IN ('choice', 'short'));

-- 简答卷判分要分批送 AI，交卷时判不完。graded_at 为空 = 还没判完，
-- 复盘页据此显示"判分中"，不显示分数。
ALTER TABLE public.mock_test_sessions
    ADD COLUMN IF NOT EXISTS graded_at TIMESTAMPTZ;
