-- 025: 一道模拟题可以有多张配图。
--
-- 原来只有 image_url 一列，粘第二张就把第一张顶掉了。
--
-- 加一个数组列 image_urls，只给模拟考用。通关题库继续用原来的 image_url，
-- 一个字节都不动 —— "两个题库互不影响"这条一直守着。下面的回填也只看 mock。
--
-- 可重复执行。Apply in the Supabase SQL editor。

ALTER TABLE public.questions ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- 把模拟题现有的单图搬进数组，已经搬过的不动。
UPDATE public.questions
   SET image_urls = ARRAY[image_url]
 WHERE question_type = 'mock'
   AND image_url IS NOT NULL
   AND image_urls IS NULL;
