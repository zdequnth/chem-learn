-- Student course favorites
CREATE TABLE public.student_favorites (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    course_id  UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(student_id, course_id)
);

ALTER TABLE public.student_favorites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "favorites_student_own" ON public.student_favorites
    FOR ALL USING (student_id = auth.uid());

GRANT ALL ON public.student_favorites TO service_role;
