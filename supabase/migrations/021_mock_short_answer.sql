-- 021: 模拟考支持简答题（free response）。
--
-- 现在的模拟考全是选择题：作答就是"选一个选项"（mock_test_answers.selected_option_id）。
-- 填空题、数值计算、简答说明统一成一类 answer_type='short'，靠 AI 对照参考答案判分。
--
-- 与通关题库隔离是本迁移的硬要求：通关题和模拟题其实共用 questions 表，只靠
-- question_type 区分。所以下面用 CHECK 约束把 short 锁死在 question_type='mock' 上
-- —— 让"分开"变成数据库保证，而不是靠代码里记得加过滤。
--
-- 可重复执行。Apply in the Supabase SQL editor。

-- ── 1) 作答类型。默认 'choice'，所以现有通关题、现有模拟题一个字都不变。
ALTER TABLE public.questions
    ADD COLUMN IF NOT EXISTS answer_type TEXT NOT NULL DEFAULT 'choice';

ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_answer_type_check;
ALTER TABLE public.questions
    ADD CONSTRAINT questions_answer_type_check CHECK (answer_type IN ('choice', 'short'));

-- ── 2) 参考答案。选择题为空；简答题必须有，AI 拿它判分。
--    故意不加 "short 必须有答案" 的 CHECK：老师说卷子是草稿状态，允许先存后补。
--    这条改由应用层把关（建卷页列为"需人工审核"，且没答案不许发布）。
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS answer_text TEXT;

-- 只有模拟考的题能是简答题。通关题永远只能是选择题。
ALTER TABLE public.questions DROP CONSTRAINT IF EXISTS questions_short_only_mock;
ALTER TABLE public.questions
    ADD CONSTRAINT questions_short_only_mock
    CHECK (answer_type = 'choice' OR question_type = 'mock');

-- ── 3) 大题的小问。同一大题的小问共用 group_id，共同题干（材料/表格/图）放
--    group_stem。每个小问仍是独立的一行，各自映射课时、各自记对错。
--    （编辑界面稍后接，列先建好，免得再跑一次迁移。）
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS group_id UUID;
ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS group_stem TEXT;
CREATE INDEX IF NOT EXISTS idx_questions_group
    ON public.questions(group_id) WHERE group_id IS NOT NULL;

-- ── 4) 学生的作答。简答题把学生写的内容存 answer_text，AI 批语存 feedback。
--    is_correct 复用现有的（交卷判分时才写）。
ALTER TABLE public.mock_test_answers ADD COLUMN IF NOT EXISTS answer_text TEXT;
ALTER TABLE public.mock_test_answers ADD COLUMN IF NOT EXISTS feedback TEXT;
