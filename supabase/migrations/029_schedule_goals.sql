-- 029: 计划表 —— 目标规划
--
-- 老师按周/月/学期建目标；AI 把目标拆成具体步骤并给出建议排期，
-- 老师确认后才写进 schedule_items。goal_id 让步骤挂回目标，便于显示进度。
-- Apply in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.schedule_goals (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title      TEXT NOT NULL,
    note       TEXT NOT NULL DEFAULT '',
    horizon    TEXT NOT NULL DEFAULT 'week' CHECK (horizon IN ('week', 'month', 'term')),
    due_date   DATE,
    status     TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_goals_teacher ON public.schedule_goals(teacher_id, status);

ALTER TABLE public.schedule_items
    ADD COLUMN IF NOT EXISTS goal_id UUID REFERENCES public.schedule_goals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_items_goal ON public.schedule_items(goal_id);

ALTER TABLE public.schedule_goals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_goals_own" ON public.schedule_goals;
CREATE POLICY "schedule_goals_own" ON public.schedule_goals
    FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

GRANT ALL ON public.schedule_goals TO service_role;
