ALTER TABLE public.wrong_question_book ADD COLUMN IF NOT EXISTS is_repeated_wrong BOOLEAN NOT NULL DEFAULT false;
