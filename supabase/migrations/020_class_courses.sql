-- 020: 一个班级可以绑定多门课程，一类最多一门（一门通关 + 一门背单词 + 一门模拟考）。
--
-- 原来 classes.course_id 是单值。加一张关联表而不是改它，原因是有三处代码在读
-- classes.course_id（学生首页的班级卡片、学情分析按班级、词汇/模拟考的可见范围），
-- 改它的形状会牵动这三处；加表是纯增量。classes.course_id 继续作为「主课程」，
-- 通关课程的绑定会同时写回它，保持两边一致。
--
-- kind 冗余存在这里，是为了让 UNIQUE(class_id, kind) 这条"一类只能绑一个"的
-- 约束真的能生效（kind 在 courses 表上，约束里没法引用）。
-- 可重复执行。Apply in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.class_courses (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id   UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    course_id  UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    kind       TEXT NOT NULL CHECK (kind IN ('gate', 'vocab', 'mock')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (class_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_class_courses_class  ON public.class_courses(class_id);
CREATE INDEX IF NOT EXISTS idx_class_courses_course ON public.class_courses(course_id);

-- 把现有的一对一绑定搬进来（kind 取课程自己的类型）
INSERT INTO public.class_courses (class_id, course_id, kind)
SELECT c.id, c.course_id, COALESCE(co.kind, 'gate')
  FROM public.classes c
  JOIN public.courses co ON co.id = c.course_id
 WHERE c.course_id IS NOT NULL
ON CONFLICT (class_id, kind) DO NOTHING;

ALTER TABLE public.class_courses ENABLE ROW LEVEL SECURITY;

-- 学生：能看到自己所在班级的绑定
DROP POLICY IF EXISTS "class_courses_select" ON public.class_courses;
CREATE POLICY "class_courses_select" ON public.class_courses
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.class_members m
            WHERE m.class_id = class_courses.class_id AND m.student_id = auth.uid()
        )
        OR EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = class_courses.class_id AND c.teacher_id = auth.uid()
        )
    );

-- 老师：管理自己班级的绑定
DROP POLICY IF EXISTS "class_courses_teacher_manage" ON public.class_courses;
CREATE POLICY "class_courses_teacher_manage" ON public.class_courses
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = class_courses.class_id AND c.teacher_id = auth.uid()
        )
    );

GRANT ALL ON public.class_courses TO service_role;
