-- 024: 清掉 group_stem。
--
-- 023 加了 group_ref（存大题号）之后就没用了：分组改成按题号，不再抽共同题干，
-- 材料直接留在每道小问的题干里。023 故意没在这一步删它，是为了避免
-- "迁移跑了、代码还是旧的"那段时间页面打不开。新代码已经稳定，可以清了。
--
-- 可重复执行。Apply in the Supabase SQL editor.

ALTER TABLE public.questions DROP COLUMN IF EXISTS group_stem;
