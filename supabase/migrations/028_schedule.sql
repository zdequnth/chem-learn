-- 028: 教师周计划表
--
-- 每天 13 节（第 6 节是午饭午休，照常占一行），周一到周日整周展示。
-- 安排分「每周重复」和「仅这一次」两种；完成/跳过按【某一次】记录，
-- 所以周一那节课划掉不会把下周一一并划掉 —— 这也是 schedule_marks 单独一张表的原因。
-- 日期一律 DATE，不带时区，避免服务器时区把本地日期算错。
-- 可重复执行。Apply in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.schedule_settings (
    teacher_id  UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    term_start  DATE NOT NULL,
    term_weeks  INT  NOT NULL DEFAULT 22 CHECK (term_weeks BETWEEN 1 AND 60),
    periods     JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.schedule_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id   UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'task' CHECK (kind IN ('class', 'meeting', 'task', 'other')),
    class_id     UUID REFERENCES public.classes(id) ON DELETE SET NULL,
    color        TEXT NOT NULL DEFAULT '#2563eb',
    repeat       TEXT NOT NULL DEFAULT 'weekly' CHECK (repeat IN ('once', 'weekly')),
    -- weekly: 1=周一 … 7=周日；once: 用 event_date
    weekday      INT CHECK (weekday BETWEEN 1 AND 7),
    event_date   DATE,
    start_period INT NOT NULL CHECK (start_period BETWEEN 1 AND 13),
    end_period   INT NOT NULL CHECK (end_period BETWEEN 1 AND 13),
    note         TEXT NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (end_period >= start_period),
    CHECK (
        (repeat = 'weekly' AND weekday IS NOT NULL AND event_date IS NULL)
        OR (repeat = 'once' AND event_date IS NOT NULL AND weekday IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_schedule_items_teacher ON public.schedule_items(teacher_id, weekday);

CREATE TABLE IF NOT EXISTS public.schedule_marks (
    teacher_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES public.schedule_items(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    status          TEXT NOT NULL CHECK (status IN ('done', 'skipped')),
    marked_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (item_id, occurrence_date)
);

CREATE INDEX IF NOT EXISTS idx_schedule_marks_teacher_date ON public.schedule_marks(teacher_id, occurrence_date);

ALTER TABLE public.schedule_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_marks    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "schedule_settings_own" ON public.schedule_settings;
CREATE POLICY "schedule_settings_own" ON public.schedule_settings
    FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "schedule_items_own" ON public.schedule_items;
CREATE POLICY "schedule_items_own" ON public.schedule_items
    FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "schedule_marks_own" ON public.schedule_marks;
CREATE POLICY "schedule_marks_own" ON public.schedule_marks
    FOR ALL USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());

GRANT ALL ON public.schedule_settings TO service_role;
GRANT ALL ON public.schedule_items    TO service_role;
GRANT ALL ON public.schedule_marks    TO service_role;
