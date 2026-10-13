import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadMockCourse, loadSourceOutline, isAdminUser } from '@/lib/mock-source'
import { parseAnswerKey } from '@/lib/answer-key'
import { normaliseMineruText } from '@/lib/mineru-text'
import { readStoredImage } from '@/lib/storage'
import OpenAI from 'openai'

export const maxDuration = 60

/**
 * Read a paper's questions straight off page screenshots.
 *
 * The text pipeline goes PDF → MinerU → plain text → questions, and the layout
 * is destroyed in the middle step: which options belong to which stem, which
 * figure belongs to which question. A vision model sees the page as a page, so
 * that information is still there.
 *
 * One PAGE per request. Each request also carries the NEXT page, purely so a
 * question whose options run over the page break can be read whole — the model
 * is told to emit only the questions that START on the requested page.
 */
function buildPrompt(opts: {
  courseName: string; lessonList: string; pageNo: number; totalPages: number
  paperMode: 'choice' | 'short'; answerBlock: string
}): string {
  const { courseName, lessonList, pageNo, totalPages, paperMode, answerBlock } = opts

  const shape = paperMode === 'short'
    ? `{"number":1,"stem":"...","answerText":"...","explanation":"...","lessonRef":"5.1","groupRef":null,"hasFigure":false}`
    : `{"number":1,"stem":"...","options":[{"content":"...","isCorrect":false}],"explanation":"...","lessonRef":"5.1","groupRef":null,"hasFigure":false}`

  const shortNote = paperMode === 'short'
    ? `- answerText 必填：完整的参考答案，含关键计算过程 —— 它就是判分标准
- LaTeX 写成 $...$ 或 $$...$$`
    : `- 选项 content 不要带 "(A) " 前缀
- explanation 以 "Answer: X" 开头`

  return `这是一份化学试卷第 ${pageNo} 页（共 ${totalPages} 页）的截图。可能还附带了下一页的截图，那只是让你看清在本页末尾被截断的题目。

【最重要的一条】只输出【起始于第 ${pageNo} 页】的题目。下一页上开始的题目不要输出，那是下一轮的事。

【怎么拆】
1. ${paperMode === 'short' ? '简答题/计算题：大题可能带 (a)(b)(c) 小问，每个小问单独成为一道题，stem 里保留小问的标号。' : '选择题：题干后面跟 (A)(B)(C)(D) 选项。选项可能横排一行，也可能一行一个 —— 两种都要按顺序正确拆开。'}
2. 共用的材料（一段文字、一个数据表、一段实验描述）：把材料【完整写进每道题的 stem 里】，不要写"见上题" —— 学生看到的每一道题都是独立的，重复没关系。同时把这些题的 groupRef 都填上那一道大题的题号（字符串，如 "1"）；独立成题的填 null。
3. 题号不要写进 stem；另外用 number 字段给出它在卷面上的题号（整数）。
4. 题干里若带插图（结构式、装置图、曲线图）：hasFigure 填 true，【不要去描述图的内容】（图片老师会另外补）。没有插图就填 false。表格不要当插图 —— 表格要连内容一起写进 stem。
5. 看不清的地方不要猜，宁可留空。

【逐题判断所属课时】
下面是这门课（${courseName}）的章节课时清单。为每道题判断它最匹配的课时，返回 lessonRef，格式 "章号.课时号"，例如 "5.1"：
${lessonList}
lessonRef 必须来自上面的清单；拿不准就填 null，不要编造。

${answerBlock}

【输出字段】每题一个对象：
${shape}
- stem / ${paperMode === 'short' ? 'answerText' : 'options'} / explanation 保持原语言（英文），不要翻译
${shortNote}
- 绝对不要输出任何 HTML 标签

输出纯 JSON（不要 markdown 代码块）：{"questions":[...]}`
}

function answerBlockFor(
  paperMode: 'choice' | 'short',
  position: 'end' | 'inline' | 'none',
  keyText: string,
  key: Map<number, string> | null,
): string {
  if (paperMode === 'short') {
    if (position === 'inline') {
      return `【参考答案】\n答案就印在题目里（图里能看到）。把答案部分从题目里剥出来，完整写进 answerText；\nstem 里只留问题本身，不要保留答案。`
    }
    if (keyText.trim()) {
      return `【参考答案】\n试卷的答案区已由老师单独提供，按题号给出（本页只会用到其中一部分，其余题号与你无关）：\n${keyText.trim()}\n\n对应题号的 answerText 直接填这份答案，不要用你自己解出的结果。`
    }
    return `【参考答案】\n这份试卷没有答案。请你自己解题，把完整的解题过程和结论写进 answerText。\n⚠️ 你写的答案会成为判分的标准答案，老师必须逐题核对后才能发布。`
  }
  return key && key.size > 0
    ? `【官方答案】\n老师单独提供了答案区，下面是「题号:选项」（本页只会用到其中一部分，其余题号与你无关）：\n${[...key].map(([n, l]) => `${n}:${l}`).join('  ')}\n\n以官方答案为准：本页出现的题号直接按官方答案标 isCorrect，不要用你自己解出的结果。`
    : `【求解答案】\n这份试卷没有答案。请你自己解题，标出正确选项并写解析 —— 这是给老师核对的草稿。`
}

async function parsePage(client: OpenAI, prompt: string, images: { url: string }[]): Promise<{ ok: boolean; questions: any[] }> {
  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-flash',
      max_tokens: 8192,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...images.map((i) => ({ type: 'image_url' as const, image_url: { url: i.url } })),
        ],
      }],
    })
    let raw = completion.choices[0]?.message?.content || ''
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let parsed: any
    try { parsed = JSON.parse(raw) } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('AI未返回有效JSON')
      parsed = JSON.parse(m[0])
    }
    return { ok: true, questions: Array.isArray(parsed?.questions) ? parsed.questions : [] }
  } catch {
    return { ok: false, questions: [] }
  }
}

// POST { courseId, images: string[], pageIndex, paperMode, answerText? }
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const {
    courseId, images, pageIndex: rawPageIndex,
    paperMode: rawPaperMode, answerText, answerPosition: rawAnswerPosition,
  } = await request.json()

  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })
  const list: string[] = Array.isArray(images) ? images.filter((u: any) => typeof u === 'string') : []
  if (list.length === 0) return NextResponse.json({ error: '没有收到页面图片' }, { status: 400 })
  const pageIndex = Math.min(Math.max(0, Number(rawPageIndex) || 0), list.length - 1)
  const paperMode: 'choice' | 'short' = rawPaperMode === 'short' ? 'short' : 'choice'
  const answerPosition: 'end' | 'inline' | 'none' =
    rawAnswerPosition === 'inline' ? 'inline'
    : rawAnswerPosition === 'none' ? 'none'
    : String(answerText ?? '').trim() ? 'end' : 'none'

  const { course, error, status } = await loadMockCourse(user.id, courseId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })
  if (!course!.mock_source_course_id) {
    return NextResponse.json({ error: '这门模拟考课程还没有绑定通关课程' }, { status: 400 })
  }

  const outline = await loadSourceOutline(course!.mock_source_course_id)
  if (!outline) return NextResponse.json({ error: '绑定的通关课程不存在' }, { status: 400 })
  if (outline.lessons.length === 0) {
    return NextResponse.json({ error: '绑定的通关课程还没有章节课时，无法标注对应关系' }, { status: 400 })
  }

  // The requested page, plus the next one so a question split by the page break
  // can be read whole. The prompt keeps the model to the requested page only.
  const want = [list[pageIndex], list[pageIndex + 1]].filter(Boolean)
  const loaded: { url: string }[] = []
  for (const url of want) {
    const img = await readStoredImage(url)
    if (!img) continue
    loaded.push({ url: `data:${img.contentType};base64,${img.buf.toString('base64')}` })
  }
  if (loaded.length === 0) return NextResponse.json({ error: '页面图片读不出来（可能已被删除）' }, { status: 400 })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 45_000, maxRetries: 0 })

  // The key is often pasted as MinerU HTML — normalise it first, or the tags sit
  // between the number and the letter and nothing parses (same trap as the text
  // import path).
  const keyText = normaliseMineruText(typeof answerText === 'string' ? answerText : '')
  const keyLetters = keyText.replace(/\|/g, ' ').replace(/^[\s\-:|]+$/gm, '')
  const parsedKey = paperMode === 'choice' && keyLetters.trim() ? parseAnswerKey(keyLetters) : null
  const answerKey = parsedKey && parsedKey.size > 0 ? parsedKey : null

  const prompt = buildPrompt({
    courseName: outline.courseName,
    lessonList: outline.promptList,
    pageNo: pageIndex + 1,
    totalPages: list.length,
    paperMode,
    answerBlock: answerBlockFor(paperMode, answerPosition, keyText, answerKey),
  })

  const result = await parsePage(client, prompt, loaded)

  const questions = (result.ok ? result.questions : []).map((q) => {
    const ref = typeof q.lessonRef === 'string' ? q.lessonRef.trim() : null
    const hit = ref ? outline.byRef.get(ref) : undefined
    const common = {
      stem: String(q.stem ?? '').trim(),
      groupRef: String(q.groupRef ?? '').trim() || null,
      explanation: String(q.explanation ?? '').trim(),
      lessonRef: hit ? hit.ref : null,
      lessonId: hit ? hit.lessonId : null,
      chapterId: hit ? hit.chapterId : null,
      chapterTitle: hit ? hit.chapterTitle : null,
      lessonTitle: hit ? hit.lessonTitle : null,
      // The figure is inside the PAGE image, not something we can carve out —
      // so flag it and let the teacher paste it onto the question.
      needsFigure: q.hasFigure === true,
      num: Number.isInteger(q.number) ? q.number : null,
    }
    if (paperMode === 'short') {
      return { ...common, answerType: 'short' as const, answerText: String(q.answerText ?? '').trim(), options: [] }
    }
    return {
      ...common,
      answerType: 'choice' as const,
      answerText: '',
      options: (Array.isArray(q.options) ? q.options : [])
        .map((o: any) => ({ content: String(o?.content ?? '').trim(), isCorrect: o?.isCorrect === true }))
        .filter((o: any) => o.content),
    }
  }).filter((q) => q.stem)

  return NextResponse.json({
    questions,
    failed: result.ok ? [] : ['本页'],
    pageIndex,
    totalPages: list.length,
  })
}
