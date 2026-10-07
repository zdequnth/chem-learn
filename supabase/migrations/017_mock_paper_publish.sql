-- 017: 模拟卷的发布开关。
-- 新建的卷子默认「未发布」——老师把 AI 拆出来的题逐题审完、确认无误之后再发布，
-- 发布之后学生才看得到、才能开考。可重复执行。
-- Apply in the Supabase SQL editor.

ALTER TABLE public.mock_papers
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_mock_papers_published
    ON public.mock_papers(mock_course_id, is_published);
