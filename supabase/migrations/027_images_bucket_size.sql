-- 027: 把 images bucket 的文件大小上限从 1MB 抬到 50MB。
--
-- 1MB 是当初只往这个 bucket 放配图时定的。现在 MinerU 解析要把整份 PDF
-- 临时存进来（浏览器签名直传，为的是绕开 Vercel 函数 4.5MB 的请求体上限），
-- 1MB 连一份普通的电子版试卷都存不下 —— 上传会以 413 "Payload too large" 失败，
-- 而且这条路上限比它本要绕开的 4.5MB 还低，等于白绕。
--
-- 配图本身仍由代码强制 ≤1MB（uploadImageBuffer 会自动压缩到 1MB 以内），
-- 所以放宽 bucket 不会让大图混进来。
--
-- 可重复执行。Apply in the Supabase SQL editor.

UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'images';
