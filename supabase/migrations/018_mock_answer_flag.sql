-- 018: 模拟考里给题目做标记（"这题不太会，先跳过，回头再看"）。
-- 标记落在作答行上——开考时每题已经预插了一行，所以不需要新表。
-- 可重复执行。Apply in the Supabase SQL editor.

ALTER TABLE public.mock_test_answers
    ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT false;
