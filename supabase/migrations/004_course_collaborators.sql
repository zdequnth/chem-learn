-- Course collaborators (teachers who can co-edit a course)
CREATE TABLE public.course_collaborators (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id  UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(course_id, teacher_id)
);

ALTER TABLE public.course_collaborators ENABLE ROW LEVEL SECURITY;

-- Course owner can manage collaborators
CREATE POLICY "collaborators_owner_manage" ON public.course_collaborators
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = course_collaborators.course_id AND c.owner_id = auth.uid()
        )
    );

-- Collaborators can view the list
CREATE POLICY "collaborators_select_self" ON public.course_collaborators
    FOR SELECT USING (teacher_id = auth.uid());

-- Update chapters RLS to allow collaborators
DROP POLICY IF EXISTS "content_teacher_manage" ON public.chapters;
CREATE POLICY "content_teacher_manage" ON public.chapters
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = chapters.course_id
            AND (
                c.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.course_collaborators cc
                    WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()
                )
            )
        )
    );

-- Update lessons RLS to allow collaborators
DROP POLICY IF EXISTS "content_teacher_manage" ON public.lessons;
CREATE POLICY "content_teacher_manage" ON public.lessons
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.chapters ch
            JOIN public.courses c ON ch.course_id = c.id
            WHERE ch.id = lessons.chapter_id
            AND (
                c.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.course_collaborators cc
                    WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()
                )
            )
        )
    );

-- Update knowledge_points RLS to allow collaborators
DROP POLICY IF EXISTS "content_teacher_manage" ON public.knowledge_points;
CREATE POLICY "content_teacher_manage" ON public.knowledge_points
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE l.id = knowledge_points.lesson_id
            AND (
                c.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.course_collaborators cc
                    WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()
                )
            )
        )
    );

-- Update video_links RLS to allow collaborators
DROP POLICY IF EXISTS "content_teacher_manage" ON public.video_links;
CREATE POLICY "content_teacher_manage" ON public.video_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.knowledge_points kp
            JOIN public.lessons l ON kp.lesson_id = l.id
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE kp.id = video_links.knowledge_point_id
            AND (
                c.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.course_collaborators cc
                    WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()
                )
            )
        )
    );

-- Update questions RLS to allow collaborators
DROP POLICY IF EXISTS "questions_teacher_manage" ON public.questions;
CREATE POLICY "questions_teacher_manage" ON public.questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE questions.lesson_id = l.id
            AND (
                c.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.course_collaborators cc
                    WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()
                )
            )
        )
    );

-- Update question_options RLS to allow collaborators
DROP POLICY IF EXISTS "options_teacher_manage" ON public.question_options;
CREATE POLICY "options_teacher_manage" ON public.question_options
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.questions q
            JOIN public.lessons l ON q.lesson_id = l.id
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE q.id = question_options.question_id
            AND (
                c.owner_id = auth.uid()
                OR EXISTS (
                    SELECT 1 FROM public.course_collaborators cc
                    WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()
                )
            )
        )
    );
