import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadMockCourse, loadSourceOutline, isAdminUser } from '@/lib/mock-source'
import { parseAnswerKey } from '@/lib/answer-key'
import OpenAI from 'openai'

// Batching makes this slower than Vercel's default function timeout.
export const maxDuration = 60

// Measured: a 6.7k-char batch generates ~30 questions in ~12s, so this is many
// times inside the 60s function limit. The limit is not what breaks; a stalled
// call is (see the client timeout below).
const MAX_CHARS_PER_BATCH = 3000

/**
 * Split pasted paper text into chunks small enough for one reliable LLM call.
 * Splits on blank lines, then groups paragraphs into per-question units so a
 * question is never cut in half (a half question was emitted as two).
 */
function splitIntoBatches(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const isQuestionStart = (p: string) => /^\s*\**\s*\d+\s*[.、)．:]\s*\S/.test(p)
  const units: string[] = []
  let cur: string[] = []
  let sawStart = false
  for (const para of paragraphs) {
    if (isQuestionStart(para)) {
      if (cur.length > 0) { units.push(cur.join('\n\n')); cur = [] }
      sawStart = true
    }
    cur.push(para)
  }
  if (cur.length > 0) units.push(cur.join('\n\n'))

  const packables = sawStart ? units : paragraphs
  const batches: string[] = []
  let current: string[] = []
  let currentLen = 0
  for (const unit of packables) {
    if (current.length > 0 && currentLen + unit.length + 2 > MAX_CHARS_PER_BATCH) {
      batches.push(current.join('\n\n'))
      current = []
      currentLen = 0
    }
    current.push(unit)
    currentLen += unit.length + 2
  }
  if (current.length > 0) batches.push(current.join('\n\n'))
  return batches.length > 0 ? batches : [text]
}

function buildPrompt(text: string, courseName: string, lessonList: string, answerKey: Map<number, string> | null): string {
  return `你是 AP/IGCSE 化学题库录入助手。把下面这份试卷的文本拆成一道道的单项选择题，输出 JSON。

【试卷排版特点，必须正确处理】
1. 题型一「配对题」：先给一组共用选项 (A)-(E)，后面跟若干条编号陈述。每条陈述各自成为一道题：stem = 该条陈述，options = 那 5 个共用选项。
2. 题型二「普通选择题」：一个题干，后面跟 (A)-(E) 五个选项。选项有时一行写完（如 "(A) x (B) y (C) z"），有时一行一个——两种都要正确拆开。
3. 独立的公式块（$$...$$）属于紧随其后的那道题，要并进它的 stem，不要丢，也不要单列成一道题。
4. 题号（"17."、"Questions 9-10" 等）不要写进 stem。

【逐题判断所属课时】
下面是这门课（${courseName}）的章节课时清单。为每道题判断它最匹配的课时，返回 lessonRef，格式 "章号.课时号"，例如 "5.1"：
${lessonList}
lessonRef 必须来自上面的清单；拿不准就填 null，不要编造。

${answerKey && answerKey.size > 0 ? `【官方答案】
试卷末尾的答案区已由老师单独提供，下面是「题号:选项」（本批只会用到其中一部分，其余题号与你无关）：
${[...answerKey].map(([n, l]) => `${n}:${l}`).join('  ')}

以官方答案为准：
- 题号就是本批文本里每题开头那个数字（如 "17."）。
- 本批中出现的题号，直接按官方答案标 isCorrect，不要用你自己解出的结果。
- 若官方答案与你自己独立解出的结果不一致，仍按官方答案标 isCorrect，并在 explanation 末尾加一句中文注明分歧，例如"⚠️ 官方答案 B，独立解答为 C"。
- 每题额外多给两个字段，老师要靠它们复核：
  - "num"：该题在试卷里的题号，整数（如 17）
  - "independentAnswer"：假设你没看到官方答案、自己解题会选哪个，单个大写字母（如 "C"）
` : `【求解答案】
这份试卷没有答案。请你自己解题，标出正确选项并写解析——这是给老师核对的草稿。
`}
【输出字段】每题一个对象：
{"stem":"...","options":[{"content":"...","isCorrect":false}],"explanation":"...","difficulty":1,"lessonRef":"5.1","imageUrl":null}
- stem/options/explanation 保持原语言（英文），不要翻译
- LaTeX 原样保留（JSON 字符串里的反斜杠写双反斜杠）
- explanation 以 "Answer: X" 开头
- 选项 content 不要带 "(A) " 前缀
- 题目里夹着的图片：链接放进 imageUrl，并从 stem 里去掉那行 ![](...)；没有就填 null
- num / independentAnswer 只在有官方答案时才需要，其余情况填 null
- 绝对不要输出任何 HTML 标签

输出纯 JSON（不要 markdown 代码块）：{"questions":[...]}

试卷文本：
${text}`
}

async function parseChunk(client: OpenAI, prompt: string): Promise<{ ok: boolean; questions: any[] }> {
  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是题目解析助手。只输出纯JSON，不要markdown代码块，不要任何多余文字。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    })
    let raw = completion.choices[0]?.message?.content || ''
    raw = raw.replace(/<[a-zA-Z/!][^>]*>/g, ' ')
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) throw new Error('AI未返回有效JSON')
      parsed = JSON.parse(match[0])
    }
    return { ok: true, questions: Array.isArray(parsed?.questions) ? parsed.questions : [] }
  } catch {
    return { ok: false, questions: [] }
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { text, courseId, batchIndex: rawBatchIndex, answerText } = await request.json()
  if (!text?.trim()) return NextResponse.json({ error: '请粘贴试卷文本' }, { status: 400 })
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

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

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })
  // A normal batch answers in ~12s. Without an explicit timeout the SDK waits up
  // to 10 MINUTES and retries twice on its own, so one stalled call keeps the
  // request alive until the platform kills the function at 60s and answers with
  // an HTML error page — which is what the browser reported as "not valid JSON".
  // Fail at 40s instead, so the route can answer properly and the client retries.
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 40_000, maxRetries: 0 })

  // Strip pre-rendered KaTeX HTML + normalize LaTeX delimiters. Only real HTML
  // tags are removed — a bare "<" (e.g. "a < b") must stay.
  const cleanText = text
    .replace(/<span[^>]*class="katex"[^>]*>[\s\S]*?<\/span>/g, ' ')
    .replace(/<[a-zA-Z/!][^>]*>/g, '')
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
    .replace(/\\\[/g, '$$$').replace(/\\\]/g, '$$$')

  // ONE batch per request, with the client looping over batchIndex. A whole paper
  // is 10+ LLM calls; doing them in a single request exceeded the serverless
  // timeout and the platform returned an HTML error page, which surfaced in the
  // browser as "Unexpected token 'A' ... is not valid JSON". Splitting the text is
  // deterministic, so the client can just ask for batch 0, 1, 2 … in turn.
  const batches = splitIntoBatches(cleanText)
  const batchIndex = Math.min(Math.max(0, Number(rawBatchIndex) || 0), batches.length - 1)
  const chunk = batches[batchIndex]

  // The key is the same for every batch, so the whole thing is handed to each
  // one and the model picks out the numbers it sees. Far simpler than working
  // out which question numbers landed in which chunk.
  const parsedKey = typeof answerText === 'string' && answerText.trim() ? parseAnswerKey(answerText) : null
  const answerKey = parsedKey && parsedKey.size > 0 ? parsedKey : null

  const prompt = buildPrompt(chunk, outline.courseName, outline.promptList, answerKey)
  // One attempt only: a second one could add 40s to a request that has 60s to
  // live. The route answers 200 with `failed` instead, and the client decides
  // whether to re-run.
  const result = await parseChunk(client, prompt)
  const raw: any[] = result.ok ? result.questions : []
  const failed: string[] = result.ok ? [] : [chunk.slice(0, 80)]

  // Validate every lessonRef against the outline. The model can only ever name a
  // lesson that exists; anything else becomes null and the teacher picks.
  const questions = raw.map((q) => {
    const ref = typeof q.lessonRef === 'string' ? q.lessonRef.trim() : null
    const hit = ref ? outline.byRef.get(ref) : undefined

    // The model reports its own answer next to the official one; where they part
    // ways is exactly where a human should look (a wrong key, or a trap).
    const num = Number.isInteger(q.num) ? q.num : null
    const official = num !== null && answerKey ? answerKey.get(num) ?? null : null
    const own = typeof q.independentAnswer === 'string' ? q.independentAnswer.trim().toUpperCase().slice(0, 1) : ''
    const disputed = !!official && !!own && official !== own

    return {
      stem: String(q.stem ?? '').trim(),
      explanation: String(q.explanation ?? '').trim(),
      difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 3)),
      imageUrl: typeof q.imageUrl === 'string' && q.imageUrl.trim() ? q.imageUrl.trim() : null,
      lessonRef: hit ? hit.ref : null,
      lessonId: hit ? hit.lessonId : null,
      chapterId: hit ? hit.chapterId : null,
      chapterTitle: hit ? hit.chapterTitle : null,
      lessonTitle: hit ? hit.lessonTitle : null,
      num,
      officialAnswer: official,
      independentAnswer: own || null,
      disputed,
      options: (Array.isArray(q.options) ? q.options : [])
        .map((o: any) => ({ content: String(o?.content ?? '').trim(), isCorrect: o?.isCorrect === true }))
        .filter((o: any) => o.content),
    }
  }).filter((q) => q.stem)

  // Kept rather than dropped, so a question the model mangled can be repaired in
  // the review UI instead of silently disappearing. Counted here so the page can
  // warn about exactly how many need a look.
  const suspect = questions.filter(
    (q) => q.options.length < 2 || q.options.filter((o: any) => o.isCorrect).length !== 1,
  ).length
  return NextResponse.json({ questions, failed, suspect, batchIndex, totalBatches: batches.length })
}
