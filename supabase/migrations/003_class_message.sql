-- Add message column to classes table
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS message TEXT;
