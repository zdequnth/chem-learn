ALTER TABLE public.courses ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT 'Chemistry';
UPDATE public.courses SET subject = 'Chemistry' WHERE subject IS NULL OR subject = '';
