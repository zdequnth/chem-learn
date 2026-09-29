-- 013: IGCSE 化学「背单词」模块。
-- vocab_words 挂在 lessons 上（和 questions 同一个骨架）；
-- vocab_progress 记录每个学生每个词的 Leitner 箱与下次复习时间。
-- 掌握度只由 box 推导（box >= 3 视为已掌握），不另存列。
-- Apply in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.vocab_words (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_id   UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
    term        TEXT NOT NULL,
    ipa         TEXT,
    pos         TEXT,
    zh          TEXT NOT NULL,
    en_def      TEXT,
    example_en  TEXT,
    example_zh  TEXT,
    image_url   TEXT,          -- 预留：本版界面不用，将来放 Supabase storage
    note        TEXT,          -- 易错点 / 近义词辨析
    difficulty  INT NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
    sort_order  INT NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vocab_progress (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    word_id       UUID NOT NULL REFERENCES public.vocab_words(id) ON DELETE CASCADE,
    last_result   TEXT CHECK (last_result IN ('known','fuzzy','unknown')),
    box           INT NOT NULL DEFAULT 0 CHECK (box BETWEEN 0 AND 5),
    due_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    correct_count INT NOT NULL DEFAULT 0,
    wrong_count   INT NOT NULL DEFAULT 0,
    last_seen_at  TIMESTAMPTZ,
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (student_id, word_id)
);

CREATE INDEX IF NOT EXISTS idx_vocab_words_lesson       ON public.vocab_words(lesson_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_student   ON public.vocab_progress(student_id, due_at);
CREATE INDEX IF NOT EXISTS idx_vocab_progress_word      ON public.vocab_progress(word_id);

ALTER TABLE public.vocab_words    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_progress ENABLE ROW LEVEL SECURITY;

-- 词库：与 chapters/lessons 的 content_select / content_teacher_manage 同款
DROP POLICY IF EXISTS "vocab_words_select" ON public.vocab_words;
CREATE POLICY "vocab_words_select" ON public.vocab_words
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE l.id = vocab_words.lesson_id
            AND (c.is_published = true OR c.owner_id = auth.uid())
        )
    );

DROP POLICY IF EXISTS "vocab_words_teacher_manage" ON public.vocab_words;
CREATE POLICY "vocab_words_teacher_manage" ON public.vocab_words
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.lessons l
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE l.id = vocab_words.lesson_id AND c.owner_id = auth.uid()
        )
    );

-- 进度：学生读写自己的；课程 owner 可读
DROP POLICY IF EXISTS "vocab_progress_student_own" ON public.vocab_progress;
CREATE POLICY "vocab_progress_student_own" ON public.vocab_progress
    FOR ALL USING (student_id = auth.uid());

DROP POLICY IF EXISTS "vocab_progress_teacher_read" ON public.vocab_progress;
CREATE POLICY "vocab_progress_teacher_read" ON public.vocab_progress
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.vocab_words w
            JOIN public.lessons l ON w.lesson_id = l.id
            JOIN public.chapters ch ON l.chapter_id = ch.id
            JOIN public.courses c ON ch.course_id = c.id
            WHERE w.id = vocab_progress.word_id AND c.owner_id = auth.uid()
        )
    );

GRANT ALL ON public.vocab_words    TO service_role;
GRANT ALL ON public.vocab_progress TO service_role;
