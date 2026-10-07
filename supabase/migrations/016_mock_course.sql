-- 016: 模拟考课程（mock exam course）—— 第三类课程。
--   kind='mock' 是考前冲刺用的限时套题训练，绑定一门 gate 课程；
--   试卷里的题复用 questions 表（question_type='mock'），lesson_id 指向
--   被绑定课程的课时，于是"这道题属于哪章哪课时"白送，不需要额外的映射列。
-- 可重复执行。Apply in the Supabase SQL editor.

-- ── 1) 课程类型放开到三种（014 的约束先删后加）
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_kind_check;
ALTER TABLE public.courses
    ADD CONSTRAINT courses_kind_check CHECK (kind IN ('gate', 'vocab', 'mock'));

-- ── 2) mock 课程绑定的那门 gate 课程。其它类型必须为空。
ALTER TABLE public.courses
    ADD COLUMN IF NOT EXISTS mock_source_course_id UUID
        REFERENCES public.courses(id) ON DELETE SET NULL;
ALTER TABLE public.courses DROP CONSTRAINT IF EXISTS courses_mock_source_check;
ALTER TABLE public.courses
    ADD CONSTRAINT courses_mock_source_check
    CHECK (mock_source_course_id IS NULL OR kind = 'mock');

-- ── 3) 题型放开，允许 mock。
-- 001 里 question_type 的行内 CHECK 是 Postgres 自动命名的，按定义内容找出来删，
-- 免得依赖某个具体名字。
DO $$
DECLARE cname TEXT;
BEGIN
    SELECT conname INTO cname
      FROM pg_constraint
     WHERE conrelid = 'public.questions'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%question_type%';
    IF cname IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.questions DROP CONSTRAINT %I', cname);
    END IF;
END $$;

ALTER TABLE public.questions
    ADD CONSTRAINT questions_question_type_check
    CHECK (question_type IN ('gate_test', 'boss_test', 'mock'));

-- ── 4) 试卷
CREATE TABLE IF NOT EXISTS public.mock_papers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mock_course_id   UUID NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
    title            TEXT NOT NULL,
    duration_minutes INT NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 1 AND 600),
    sort_order       INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 5) 试卷 ↔ 题目（卷面顺序在这里；lesson 顺序代替不了）
CREATE TABLE IF NOT EXISTS public.mock_paper_questions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    paper_id    UUID NOT NULL REFERENCES public.mock_papers(id) ON DELETE CASCADE,
    question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (paper_id, question_id)
);

-- ── 6) 考试场次。expires_at 在开考时算一次，是唯一的权威截止时间。
CREATE TABLE IF NOT EXISTS public.mock_test_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id       UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    paper_id         UUID NOT NULL REFERENCES public.mock_papers(id) ON DELETE CASCADE,
    status           TEXT NOT NULL DEFAULT 'in_progress'
                        CHECK (status IN ('in_progress', 'submitted')),
    submit_reason    TEXT CHECK (submit_reason IN ('manual', 'timeout')),
    duration_seconds INT NOT NULL,                       -- 开考时对试卷时长的快照
    started_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at       TIMESTAMPTZ NOT NULL,
    submitted_at     TIMESTAMPTZ,
    total_questions  INT NOT NULL DEFAULT 0,
    total_correct    INT NOT NULL DEFAULT 0,
    total_wrong      INT NOT NULL DEFAULT 0,
    score_percentage DECIMAL(5,2)
);

-- ── 7) 作答行。开考时按卷面顺序每题预插一行，所以这张表同时是本场次的
--      "卷面快照"：刷新后按 sort_order 重读即可续答，老师中途改卷也影响不到它。
CREATE TABLE IF NOT EXISTS public.mock_test_answers (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id         UUID NOT NULL REFERENCES public.mock_test_sessions(id) ON DELETE CASCADE,
    question_id        UUID NOT NULL REFERENCES public.questions(id),
    sort_order         INT NOT NULL DEFAULT 0,
    selected_option_id UUID REFERENCES public.question_options(id),
    is_correct         BOOLEAN NOT NULL DEFAULT false,   -- 只在交卷判分时写入
    answered_at        TIMESTAMPTZ,
    UNIQUE (session_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_mock_papers_course         ON public.mock_papers(mock_course_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mock_paper_questions_paper  ON public.mock_paper_questions(paper_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_mock_paper_questions_q      ON public.mock_paper_questions(question_id);
CREATE INDEX IF NOT EXISTS idx_mock_sessions_student_paper ON public.mock_test_sessions(student_id, paper_id);
CREATE INDEX IF NOT EXISTS idx_mock_sessions_paper         ON public.mock_test_sessions(paper_id);
CREATE INDEX IF NOT EXISTS idx_mock_answers_session        ON public.mock_test_answers(session_id, sort_order);
-- 一个人在一张卷子上同时只能有一场进行中的考试
CREATE UNIQUE INDEX IF NOT EXISTS mock_sessions_one_active
    ON public.mock_test_sessions(student_id, paper_id) WHERE status = 'in_progress';

ALTER TABLE public.mock_papers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_paper_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_test_sessions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mock_test_answers    ENABLE ROW LEVEL SECURITY;

-- 试卷：学生看已发布的课程，owner / 协作者可管理（与 004 的协作者判定同款）
DROP POLICY IF EXISTS "mock_papers_select" ON public.mock_papers;
CREATE POLICY "mock_papers_select" ON public.mock_papers
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = mock_papers.mock_course_id
            AND (c.is_published = true
                 OR c.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.course_collaborators cc
                            WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "mock_papers_teacher_manage" ON public.mock_papers;
CREATE POLICY "mock_papers_teacher_manage" ON public.mock_papers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.courses c
            WHERE c.id = mock_papers.mock_course_id
            AND (c.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.course_collaborators cc
                            WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "mock_paper_q_select" ON public.mock_paper_questions;
CREATE POLICY "mock_paper_q_select" ON public.mock_paper_questions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.mock_papers p
            JOIN public.courses c ON c.id = p.mock_course_id
            WHERE p.id = mock_paper_questions.paper_id
            AND (c.is_published = true
                 OR c.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.course_collaborators cc
                            WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "mock_paper_q_teacher_manage" ON public.mock_paper_questions;
CREATE POLICY "mock_paper_q_teacher_manage" ON public.mock_paper_questions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.mock_papers p
            JOIN public.courses c ON c.id = p.mock_course_id
            WHERE p.id = mock_paper_questions.paper_id
            AND (c.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.course_collaborators cc
                            WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()))
        )
    );

-- 场次：学生读写自己的；课程 owner / 协作者可读（教师看成绩）
DROP POLICY IF EXISTS "mock_sessions_student_own" ON public.mock_test_sessions;
CREATE POLICY "mock_sessions_student_own" ON public.mock_test_sessions
    FOR ALL USING (student_id = auth.uid());

DROP POLICY IF EXISTS "mock_sessions_teacher_read" ON public.mock_test_sessions;
CREATE POLICY "mock_sessions_teacher_read" ON public.mock_test_sessions
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.mock_papers p
            JOIN public.courses c ON c.id = p.mock_course_id
            WHERE p.id = mock_test_sessions.paper_id
            AND (c.owner_id = auth.uid()
                 OR EXISTS (SELECT 1 FROM public.course_collaborators cc
                            WHERE cc.course_id = c.id AND cc.teacher_id = auth.uid()))
        )
    );

DROP POLICY IF EXISTS "mock_answers_student_own" ON public.mock_test_answers;
CREATE POLICY "mock_answers_student_own" ON public.mock_test_answers
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.mock_test_sessions s
            WHERE s.id = mock_test_answers.session_id AND s.student_id = auth.uid()
        )
    );

GRANT ALL ON public.mock_papers          TO service_role;
GRANT ALL ON public.mock_paper_questions TO service_role;
GRANT ALL ON public.mock_test_sessions   TO service_role;
GRANT ALL ON public.mock_test_answers    TO service_role;
