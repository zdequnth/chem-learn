-- 012: record how many times a student left the gate-test window during a test.
-- Used as an anti-cheat signal (2 strikes ends the attempt).
-- Apply in the Supabase SQL editor.
ALTER TABLE public.gate_test_sessions ADD COLUMN IF NOT EXISTS focus_lost_count INT NOT NULL DEFAULT 0;
