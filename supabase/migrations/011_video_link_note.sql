-- 011: unify knowledge-point resources (video / web demo / PDF) and allow an
-- optional note on each. Resource type is stored in video_links.platform:
--   'pdf' -> PDF 资料, 'web' -> 网页/演示, anything else -> video.
-- Apply in the Supabase SQL editor.
ALTER TABLE public.video_links ADD COLUMN IF NOT EXISTS note TEXT;
