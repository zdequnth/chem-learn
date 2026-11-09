// API routes return error strings produced by shared helpers in src/lib, which
// are Chinese-only. Those helpers are outside the API layer's edit scope, so the
// translation happens here, at the boundary, before the message reaches a client.
//
// Only known messages are rewritten into the same `English（中文）` shape the
// routes use. Anything else (English DB errors, unknown text) is returned as-is.

const FIXED: Record<string, string> = {
  // src/lib/schedule.ts
  '请填写目标': 'Goal title is required（请填写目标）',
  '截止日期不正确': 'Invalid due date（截止日期不正确）',
  '请填写标题': 'Title is required（请填写标题）',
  '开始节次不正确': 'Invalid start period（开始节次不正确）',
  '结束节次不正确': 'Invalid end period（结束节次不正确）',
  '星期不正确': 'Invalid weekday（星期不正确）',
  '日期不正确': 'Invalid date（日期不正确）',
  '学期起始日不正确': 'Invalid term start date（学期起始日不正确）',
  '学期周数需在 1–60 之间': 'Term weeks must be between 1 and 60（学期周数需在 1–60 之间）',
  '需要 13 个节次': '13 periods are required（需要 13 个节次）',
  '节次时间格式应为 HH:MM': 'Period time must be in HH:MM format（节次时间格式应为 HH:MM）',

  // src/lib/mock-source.ts
  '课程不存在': 'Course not found（课程不存在）',
  '这不是模拟考课程': 'This is not a mock course（这不是模拟考课程）',
  '无权操作': 'Not allowed（无权操作）',
  '试卷不存在': 'Paper not found（试卷不存在）',

  // src/lib/mineru.ts
  'MinerU 返回了空响应': 'MinerU returned an empty response（MinerU 返回了空响应）',
  '未配置 MINERU_API_KEY（请在 MinerU 账号里生成 token 并填进环境变量）':
    'MINERU_API_KEY is not configured (generate a token in your MinerU account and add it to the environment variables)（未配置 MINERU_API_KEY（请在 MinerU 账号里生成 token 并填进环境变量））',
  'MinerU 提交后没有返回 task_id': 'MinerU did not return a task_id after submission（MinerU 提交后没有返回 task_id）',
  '未配置 MINERU_API_KEY': 'MINERU_API_KEY is not configured（未配置 MINERU_API_KEY）',
  'MinerU 参数错误': 'MinerU parameter error（MinerU 参数错误）',
  'PDF 太大（上限 200MB）': 'PDF is too large (limit 200MB)（PDF 太大（上限 200MB））',
  'PDF 页数太多（上限 200 页）': 'PDF has too many pages (limit 200 pages)（PDF 页数太多（上限 200 页））',
  'MinerU 取不到这份文件（下载地址不可达）': 'MinerU could not fetch this file (download URL unreachable)（MinerU 取不到这份文件（下载地址不可达））',
  'MinerU 解析失败': 'MinerU parsing failed（MinerU 解析失败）',
  'MinerU 今日免费额度已用完（1000 页/天），明天再试，或改用「本地转图片」':
    'MinerU daily free quota is used up (1000 pages/day). Try again tomorrow, or use "convert locally to images"（MinerU 今日免费额度已用完（1000 页/天），明天再试，或改用「本地转图片」）',
  'MinerU 网页读取失败（被限流）': 'MinerU failed to read the page (rate limited)（MinerU 网页读取失败（被限流））',
  'MinerU token 无效。请到 mineru.net/apiManage/token 重新生成，更新 .env.local 和 Vercel 的 MINERU_API_KEY，再 Redeploy':
    'Invalid MinerU token. Regenerate it at mineru.net/apiManage/token, update MINERU_API_KEY in .env.local and Vercel, then redeploy（MinerU token 无效。请到 mineru.net/apiManage/token 重新生成，更新 .env.local 和 Vercel 的 MINERU_API_KEY，再 Redeploy）',
  'MinerU token 已过期（有效期 90 天，不能续期）。请到 mineru.net/apiManage/token 重新生成，更新 .env.local 和 Vercel 的 MINERU_API_KEY，再 Redeploy':
    'MinerU token has expired (valid for 90 days and cannot be renewed). Regenerate it at mineru.net/apiManage/token, update MINERU_API_KEY in .env.local and Vercel, then redeploy（MinerU token 已过期（有效期 90 天，不能续期）。请到 mineru.net/apiManage/token 重新生成，更新 .env.local 和 Vercel 的 MINERU_API_KEY，再 Redeploy）',

  // src/lib/storage.ts
  '只支持 PNG / JPG / WebP / GIF 图片': 'Only PNG / JPG / WebP / GIF images are supported（只支持 PNG / JPG / WebP / GIF 图片）',
  '签名上传失败：返回里没有地址': 'Signed upload failed: no URL in the response（签名上传失败：返回里没有地址）',
  '签名下载失败：返回里没有地址': 'Signed download failed: no URL in the response（签名下载失败：返回里没有地址）',
}

export function bilingualError(message: string): string {
  if (!message || !/[一-鿿]/.test(message)) return message

  const fixed = FIXED[message]
  if (fixed) return fixed

  let m: RegExpMatchArray | null

  // src/lib/mock-paper-write.ts
  if ((m = message.match(/^第 (\d+) 题没有指定所属章节\/课时（或指定的课时不属于这门课的绑定课程）$/))) {
    return `Question ${m[1]}: no chapter/lesson specified (or the specified lesson does not belong to this course's bound gate course)（第 ${m[1]} 题没有指定所属章节/课时（或指定的课时不属于这门课的绑定课程））`
  }
  if ((m = message.match(/^第 (\d+) 题的题型和这份试卷不一致（这份是(简答题|选择题)卷）$/))) {
    const enType = m[2] === '简答题' ? 'short-answer' : 'multiple-choice'
    return `Question ${m[1]}: question type does not match this paper (this is a ${enType} paper)（第 ${m[1]} 题的题型和这份试卷不一致（这份是${m[2]}卷））`
  }
  if ((m = message.match(/^第 (\d+) 题是简答题但没填参考答案，AI 无法判分$/))) {
    return `Question ${m[1]}: short-answer question has no reference answer, so the AI cannot grade it（第 ${m[1]} 题是简答题但没填参考答案，AI 无法判分）`
  }
  if ((m = message.match(/^第 (\d+) 题配图未能入库（([\s\S]*)）$/))) {
    return `Question ${m[1]}: image could not be stored（第 ${m[1]} 题配图未能入库）（${bilingualError(m[2])}）`
  }

  // src/lib/mineru.ts
  if ((m = message.match(/^MinerU 提交失败 HTTP (\d+)$/))) {
    return `MinerU submission failed: HTTP ${m[1]}（MinerU 提交失败 HTTP ${m[1]}）`
  }
  if ((m = message.match(/^MinerU 查询失败 HTTP (\d+)$/))) {
    return `MinerU query failed: HTTP ${m[1]}（MinerU 查询失败 HTTP ${m[1]}）`
  }
  if ((m = message.match(/^MinerU 提交出错：([\s\S]*)$/))) {
    return `MinerU submission error: ${m[1]}（MinerU 提交出错：${m[1]}）`
  }
  if ((m = message.match(/^MinerU 查询出错：([\s\S]*)$/))) {
    return `MinerU query error: ${m[1]}（MinerU 查询出错：${m[1]}）`
  }
  if ((m = message.match(/^MinerU 认证失败：([\s\S]*)$/))) {
    return `MinerU authentication failed: ${m[1]}（MinerU 认证失败：${m[1]}）`
  }
  if ((m = message.match(/^MinerU 出错：([\s\S]*)$/))) {
    return `MinerU error: ${m[1]}（MinerU 出错：${m[1]}）`
  }

  // src/lib/storage.ts
  if ((m = message.match(/^上传失败：([\s\S]*)$/))) {
    return `Upload failed: ${m[1]}（上传失败：${m[1]}）`
  }
  if ((m = message.match(/^取图失败 HTTP (\d+)$/))) {
    return `Failed to fetch image: HTTP ${m[1]}（取图失败 HTTP ${m[1]}）`
  }
  if ((m = message.match(/^取图出错：([\s\S]*)$/))) {
    return `Failed to fetch image: ${m[1]}（取图出错：${m[1]}）`
  }
  if ((m = message.match(/^签名上传失败：([\s\S]*)$/))) {
    return `Signed upload failed: ${m[1]}（签名上传失败：${m[1]}）`
  }
  if ((m = message.match(/^签名下载失败：([\s\S]*)$/))) {
    return `Signed download failed: ${m[1]}（签名下载失败：${m[1]}）`
  }
  if ((m = message.match(/^图片需小于 1MB，当前 (\d+)KB，自动压缩也压不下来$/))) {
    return `Image must be under 1MB; it is currently ${m[1]}KB and could not be compressed automatically（图片需小于 1MB，当前 ${m[1]}KB，自动压缩也压不下来）`
  }

  return message
}
