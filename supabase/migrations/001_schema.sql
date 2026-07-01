-- ChemLearn: Complete Database Schema
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE public.profiles (
    id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role          TEXT NOT NULL CHECK (role IN ('student', 'teacher', 'admin')),
    display_name  TEXT NOT NULL,
    avatar_url    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- COURSES
-- ============================================================
CREATE TABLE public.courses (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    description   TEXT,
    grade_level   TEXT,
    icon          TEXT DEFAULT '🧪',
    owner_id      UUID NOT NULL REFERENCES public.profiles(id),
    sort_order    INT NOT NULL DEFAULT 0,
    is_published  BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CHAPTERS
-- ============================================================
CREATE TABLE public.chapters (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- LESSONS
-- ============================================================
CREATE TABLE public.lessons (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chapter_id    UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- KNOWLEDGE POINTS
-- ============================================================
CREATE TABLE public.knowledge_points (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id     UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    title         TEXT NOT NULL,
    description   TEXT,
    sort_order    INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- VIDEO LINKS (external: Bilibili, YouTube, etc.)
-- ============================================================
CREATE TABLE public.video_links (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_point_id UUID NOT NULL REFERENCES public.knowledge_points(id) ON DELETE CASCADE,
    title             TEXT NOT NULL,
    url               TEXT NOT NULL,
    platform          TEXT DEFAULT 'other',
    sort_order        INT NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- QUESTIONS
-- ============================================================
CREATE TABLE public.questions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    knowledge_point_id UUID REFERENCES public.knowledge_points(id) ON DELETE SET NULL,
    lesson_id         UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    question_type     TEXT NOT NULL CHECK (question_type IN ('gate_test', 'boss_test')),
    difficulty        INT NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
    stem              TEXT NOT NULL,
    explanation       TEXT NOT NULL DEFAULT '',
    image_url         TEXT,
    is_approved       BOOLEAN NOT NULL DEFAULT false,
    is_ai_generated   BOOLEAN NOT NULL DEFAULT false,
    created_by        UUID REFERENCES public.profiles(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- QUESTION OPTIONS
-- ============================================================
CREATE TABLE public.question_options (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id   UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    content       TEXT NOT NULL,
    is_correct    BOOLEAN NOT NULL DEFAULT false,
    display_order INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CLASSES
-- ============================================================
CREATE TABLE public.classes (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    teacher_id    UUID NOT NULL REFERENCES public.profiles(id),
    course_id     UUID REFERENCES public.courses(id),
    invite_code   TEXT UNIQUE NOT NULL DEFAULT substring(md5(gen_random_uuid()::text), 1, 8),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- CLASS MEMBERS
-- ============================================================
CREATE TABLE public.class_members (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id      UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(class_id, student_id)
);

-- ============================================================
-- STUDENT PROGRESS (per lesson)
-- ============================================================
CREATE TABLE public.student_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id     UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'unlocked', 'in_progress', 'passed')),
    stars_earned  INT NOT NULL DEFAULT 0 CHECK (stars_earned BETWEEN 0 AND 3),
    passed_at     TIMESTAMPTZ,
    attempt_count INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(student_id, lesson_id)
);

-- ============================================================
-- BOSS PROGRESS (per chapter)
-- ============================================================
CREATE TABLE public.boss_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    chapter_id    UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    status        TEXT NOT NULL DEFAULT 'locked' CHECK (status IN ('locked', 'available', 'passed')),
    stars_earned  INT NOT NULL DEFAULT 0 CHECK (stars_earned BETWEEN 0 AND 3),
    passed_at     TIMESTAMPTZ,
    attempt_count INT NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(student_id, chapter_id)
);

-- ============================================================
-- GATE TEST SESSIONS
-- ============================================================
CREATE TABLE public.gate_test_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    lesson_id           UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress', 'passed', 'failed', 'locked')),
    questions_asked     INT NOT NULL DEFAULT 0,
    consecutive_correct INT NOT NULL DEFAULT 0,
    total_correct       INT NOT NULL DEFAULT 0,
    total_wrong         INT NOT NULL DEFAULT 0,
    score_percentage    DECIMAL(5,2),
    stars_earned        INT DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

-- ============================================================
-- GATE TEST ANSWERS
-- ============================================================
CREATE TABLE public.gate_test_answers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES public.gate_test_sessions(id) ON DELETE CASCADE,
    question_id         UUID NOT NULL REFERENCES public.questions(id),
    selected_option_id  UUID REFERENCES public.question_options(id),
    is_correct          BOOLEAN NOT NULL,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- BOSS TEST SESSIONS
-- ============================================================
CREATE TABLE public.boss_test_sessions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    chapter_id          UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    status              TEXT NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress', 'passed', 'failed', 'locked')),
    questions_asked     INT NOT NULL DEFAULT 0,
    consecutive_correct INT NOT NULL DEFAULT 0,
    total_correct       INT NOT NULL DEFAULT 0,
    total_wrong         INT NOT NULL DEFAULT 0,
    score_percentage    DECIMAL(5,2),
    stars_earned        INT DEFAULT 0,
    locked_until        TIMESTAMPTZ,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at        TIMESTAMPTZ
);

-- ============================================================
-- BOSS TEST ANSWERS
-- ============================================================
CREATE TABLE public.boss_test_answers (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id          UUID NOT NULL REFERENCES public.boss_test_sessions(id) ON DELETE CASCADE,
    question_id         UUID NOT NULL REFERENCES public.questions(id),
    selected_option_id  UUID REFERENCES public.question_options(id),
    is_correct          BOOLEAN NOT NULL,
    answered_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- WRONG QUESTION BOOK (personalized per student per chapter)
-- ============================================================
CREATE TABLE public.wrong_question_book (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    question_id     UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    chapter_id      UUID NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
    last_wrong_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    wrong_count     INT NOT NULL DEFAULT 1,
    is_resolved     BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(student_id, question_id)
);

-- ============================================================
-- AI GENERATION LOGS
-- ============================================================
CREATE TABLE public.ai_generation_logs (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id        UUID NOT NULL REFERENCES public.profiles(id),
    chapter_id        UUID REFERENCES public.chapters(id),
    lesson_id         UUID REFERENCES public.lessons(id),
    input_text        TEXT,
    prompt_tokens     INT,
    completion_tokens INT,
    generated_json    JSONB,
    status            TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'completed', 'failed')),
    error_message     TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- DAILY ACTIVITY
-- ============================================================
CREATE TABLE public.daily_activity (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    activity_date       DATE NOT NULL DEFAULT CURRENT_DATE,
    gate_tests_attempted INT NOT NULL DEFAULT 0,
    gate_tests_passed   INT NOT NULL DEFAULT 0,
    questions_answered  INT NOT NULL DEFAULT 0,
    time_spent_seconds  INT NOT NULL DEFAULT 0,
    UNIQUE(student_id, activity_date)
);

-- ============================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chapters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gate_test_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_test_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boss_test_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wrong_question_book ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_generation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_activity ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS: PROFILES
-- ============================================================
CREATE POLICY "profiles_select_all" ON public.profiles
    FOR SELECT USING (true);

CREATE POLICY "profiles_insert_own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- ============================================================
-- RLS: COURSES
-- ============================================================
CREATE POLICY "courses_select" ON public.courses
    FOR SELECT USING (is_published = true OR auth.uid() = owner_id);

CREATE POLICY "courses_insert_teacher" ON public.courses
    FOR INSERT WITH CHECK (
        EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('teacher', 'admin'))
        AND owner_id = auth.uid()
    );

CREATE POLICY "courses_update_owner" ON public.courses
    FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "courses_delete_owner" ON public.courses
    FOR DELETE USING (owner_id = auth.uid());

-- ============================================================
-- RLS: CHAPTERS, LESSONS, KNOWLEDGE POINTS, VIDEO LINKS
-- ============================================================
CREATE POLICY "content_select" ON public.chapters
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = chapters.course_id
            AND (c.is_published = true OR c.owner_id = auth.uid())
        )
    );

CREATE POLICY "content_teacher_manage" ON public.chapters
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = chapters.course_id AND c.owner_id = auth.uid()
        )
    );

CREATE POLICY "content_select" ON public.lessons
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.chapters ch
            JOIN public.courses c ON ch.course_id = c.id
            WHERE ch.id = lessons.chapter_id
            AND (c.is_published = true OR c.owner_id = auth.uid())
        )
    );

CREATE POLICY "content_teacher_manage" ON public.lessons
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.chapters ch
            JOIN public.courses c ON ch.course_id = c.id
            WHERE ch.id = lessons.chapter_id AND c.owner_id = auth.uid()
        )
    );

CREATE POLICY "content_select" ON public.knowledge_points
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE l.id = knowledge_points.lesson_id
            AND (c.is_published = true OR c.owner_id = auth.uid())
        )
    );

CREATE POLICY "content_teacher_manage" ON public.knowledge_points
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE l.id = knowledge_points.lesson_id AND c.owner_id = auth.uid()
        )
    );

CREATE POLICY "content_select" ON public.video_links
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.knowledge_points kp
            JOIN public.lessons l ON kp.lesson_id = l.id
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE kp.id = video_links.knowledge_point_id
            AND (c.is_published = true OR c.owner_id = auth.uid())
        )
    );

CREATE POLICY "content_teacher_manage" ON public.video_links
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.knowledge_points kp
            JOIN public.lessons l ON kp.lesson_id = l.id
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE kp.id = video_links.knowledge_point_id AND c.owner_id = auth.uid()
        )
    );

-- ============================================================
-- RLS: QUESTIONS
-- ============================================================
CREATE POLICY "questions_teacher_manage" ON public.questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE questions.lesson_id = l.id AND c.owner_id = auth.uid()
        )
    );

CREATE POLICY "questions_student_read_approved" ON public.questions
    FOR SELECT USING (is_approved = true);

-- ============================================================
-- RLS: QUESTION OPTIONS
-- ============================================================
CREATE POLICY "options_student_read" ON public.question_options
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.questions q
            WHERE q.id = question_options.question_id AND q.is_approved = true
        )
    );

CREATE POLICY "options_teacher_manage" ON public.question_options
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.questions q
            JOIN public.lessons l ON q.lesson_id = l.id
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE q.id = question_options.question_id AND c.owner_id = auth.uid()
        )
    );

-- ============================================================
-- RLS: CLASSES & MEMBERS
-- ============================================================
CREATE POLICY "classes_teacher_manage" ON public.classes
    FOR ALL USING (teacher_id = auth.uid());

CREATE POLICY "classes_select_all" ON public.classes
    FOR SELECT USING (true);

CREATE POLICY "members_student_own" ON public.class_members
    FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "members_teacher_manage" ON public.class_members
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.classes cl
            WHERE cl.id = class_members.class_id AND cl.teacher_id = auth.uid()
        )
    );

CREATE POLICY "members_insert_join" ON public.class_members
    FOR INSERT WITH CHECK (student_id = auth.uid());

-- ============================================================
-- RLS: STUDENT PROGRESS
-- ============================================================
CREATE POLICY "progress_student_own" ON public.student_progress
    FOR ALL USING (student_id = auth.uid());

CREATE POLICY "progress_teacher_view_class" ON public.student_progress
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.class_members cm
            JOIN public.classes cl ON cm.class_id = cl.id
            WHERE cm.student_id = student_progress.student_id
            AND cl.teacher_id = auth.uid()
        )
    );

-- ============================================================
-- RLS: BOSS PROGRESS
-- ============================================================
CREATE POLICY "boss_progress_student_own" ON public.boss_progress
    FOR ALL USING (student_id = auth.uid());

CREATE POLICY "boss_progress_teacher_view" ON public.boss_progress
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.class_members cm
            JOIN public.classes cl ON cm.class_id = cl.id
            WHERE cm.student_id = boss_progress.student_id
            AND cl.teacher_id = auth.uid()
        )
    );

-- ============================================================
-- RLS: TEST SESSIONS
-- ============================================================
CREATE POLICY "gate_test_student_own" ON public.gate_test_sessions
    FOR ALL USING (student_id = auth.uid());

CREATE POLICY "gate_test_answers_student_own" ON public.gate_test_answers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.gate_test_sessions gts WHERE gts.id = session_id AND gts.student_id = auth.uid())
    );

CREATE POLICY "boss_test_student_own" ON public.boss_test_sessions
    FOR ALL USING (student_id = auth.uid());

CREATE POLICY "boss_test_answers_student_own" ON public.boss_test_answers
    FOR ALL USING (
        EXISTS (SELECT 1 FROM public.boss_test_sessions bts WHERE bts.id = session_id AND bts.student_id = auth.uid())
    );

-- ============================================================
-- RLS: WRONG QUESTION BOOK
-- ============================================================
CREATE POLICY "wrong_book_student_own" ON public.wrong_question_book
    FOR ALL USING (student_id = auth.uid());

-- ============================================================
-- RLS: AI GENERATION LOGS
-- ============================================================
CREATE POLICY "ai_logs_teacher_own" ON public.ai_generation_logs
    FOR ALL USING (teacher_id = auth.uid());

-- ============================================================
-- RLS: DAILY ACTIVITY
-- ============================================================
CREATE POLICY "activity_student_own" ON public.daily_activity
    FOR ALL USING (student_id = auth.uid());

CREATE POLICY "activity_teacher_view_class" ON public.daily_activity
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.class_members cm
            JOIN public.classes cl ON cm.class_id = cl.id
            WHERE cm.student_id = daily_activity.student_id
            AND cl.teacher_id = auth.uid()
        )
    );

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================

-- Auto-create profile on auth.users insert
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, role, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'role', 'student'),
        COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Unlock next lesson and/or boss test when a lesson is passed
CREATE OR REPLACE FUNCTION public.unlock_next_lesson()
RETURNS TRIGGER AS $$
DECLARE
    v_chapter_id UUID;
    v_next_lesson_id UUID;
    v_all_passed BOOLEAN;
BEGIN
    IF NEW.status = 'passed' AND OLD.status != 'passed' THEN
        -- Find the chapter
        SELECT chapter_id INTO v_chapter_id
        FROM public.lessons WHERE id = NEW.lesson_id;

        -- Find next lesson in same chapter
        SELECT id INTO v_next_lesson_id
        FROM public.lessons
        WHERE chapter_id = v_chapter_id
          AND sort_order > (SELECT sort_order FROM public.lessons WHERE id = NEW.lesson_id)
        ORDER BY sort_order ASC LIMIT 1;

        IF v_next_lesson_id IS NOT NULL THEN
            INSERT INTO public.student_progress (student_id, lesson_id, status)
            VALUES (NEW.student_id, v_next_lesson_id, 'unlocked')
            ON CONFLICT (student_id, lesson_id) DO NOTHING;
        END IF;

        -- Check if all lessons in chapter are passed
        SELECT NOT EXISTS (
            SELECT 1 FROM public.lessons l
            LEFT JOIN public.student_progress sp
                ON l.id = sp.lesson_id AND sp.student_id = NEW.student_id
            WHERE l.chapter_id = v_chapter_id
              AND (sp.status IS NULL OR sp.status != 'passed')
        ) INTO v_all_passed;

        IF v_all_passed THEN
            UPDATE public.boss_progress
            SET status = 'available', updated_at = now()
            WHERE student_id = NEW.student_id AND chapter_id = v_chapter_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER on_lesson_passed
    AFTER UPDATE ON public.student_progress
    FOR EACH ROW EXECUTE FUNCTION public.unlock_next_lesson();

-- Initialize progress when student first accesses a course
CREATE OR REPLACE FUNCTION public.init_course_progress(p_student_id UUID, p_course_id UUID)
RETURNS VOID AS $$
DECLARE
    v_first_chapter_id UUID;
    v_first_lesson_id UUID;
BEGIN
    -- Find first chapter of course
    SELECT id INTO v_first_chapter_id
    FROM public.chapters
    WHERE course_id = p_course_id
    ORDER BY sort_order ASC LIMIT 1;

    IF v_first_chapter_id IS NULL THEN RETURN; END IF;

    -- Find first lesson of first chapter
    SELECT id INTO v_first_lesson_id
    FROM public.lessons
    WHERE chapter_id = v_first_chapter_id
    ORDER BY sort_order ASC LIMIT 1;

    IF v_first_lesson_id IS NULL THEN RETURN; END IF;

    -- Unlock first lesson
    INSERT INTO public.student_progress (student_id, lesson_id, status)
    VALUES (p_student_id, v_first_lesson_id, 'unlocked')
    ON CONFLICT (student_id, lesson_id) DO NOTHING;

    -- Init boss progress for first chapter
    INSERT INTO public.boss_progress (student_id, chapter_id, status)
    VALUES (p_student_id, v_first_chapter_id, 'locked')
    ON CONFLICT (student_id, chapter_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Indexes for performance
CREATE INDEX idx_lessons_chapter ON public.lessons(chapter_id, sort_order);
CREATE INDEX idx_chapters_course ON public.chapters(course_id, sort_order);
CREATE INDEX idx_questions_lesson_type ON public.questions(lesson_id, question_type);
CREATE INDEX idx_questions_kp ON public.questions(knowledge_point_id);
CREATE INDEX idx_questions_approved ON public.questions(is_approved);
CREATE INDEX idx_student_progress_student ON public.student_progress(student_id);
CREATE INDEX idx_gate_test_sessions_student_lesson ON public.gate_test_sessions(student_id, lesson_id);
CREATE INDEX idx_wrong_book_student_chapter ON public.wrong_question_book(student_id, chapter_id);
CREATE INDEX idx_class_members_student ON public.class_members(student_id);
CREATE INDEX idx_class_members_class ON public.class_members(class_id);
