import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadMockCourse, loadSourceOutline, isAdminUser } from '@/lib/mock-source'
import { parseAnswerKey } from '@/lib/answer-key'
import { normaliseMineruText } from '@/lib/mineru-text'
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
5. 分组题（"Questions 9-10 refer to the following…"）：把这些题的 groupRef 都填上
   那一道大题的题号（字符串，如 "1"）。独立成题的填 null。
   共用材料要【完整写进每道题自己的 stem 里】，不要省略、不要写"见上题"。

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
{"stem":"...","options":[{"content":"...","isCorrect":false}],"explanation":"...","difficulty":1,"lessonRef":"5.1","images":[],"groupRef":null}
- stem/options/explanation 保持原语言（英文），不要翻译
- LaTeX 原样保留（JSON 字符串里的反斜杠写双反斜杠）
- explanation 以 "Answer: X" 开头
- 选项 content 不要带 "(A) " 前缀
- 题目里夹着的图片：把链接放进 images 数组（一道题可能有多张图），并从 stem 里去掉那几行 ![](...)；没有就填空数组 []
- num / independentAnswer 只在有官方答案时才需要，其余情况填 null
- 绝对不要输出任何 HTML 标签

输出纯 JSON（不要 markdown 代码块）：{"questions":[...]}

试卷文本：
${text}`
}

/**
 * Free-response papers. The key difference from the multiple-choice prompt: the
 * model must produce the REFERENCE ANSWER, because that is what the grader will
 * mark students against — not a decorative explanation.
 */
function buildShortPrompt(
  text: string,
  courseName: string,
  lessonList: string,
  position: 'end' | 'inline' | 'none',
  keyText: string,
): string {
  const answerBlock =
    position === 'end' && keyText.trim()
      ? `【参考答案】
试卷末尾的答案区已由老师单独提供，下面按题号给出（本批只会用到其中一部分，其余题号与你无关）：
${keyText.trim()}

以这份答案为准：
- 题号就是本批文本里每题开头那个数字（如 "17."）。
- 对应题号的 answerText 直接填这份答案，不要用你自己解出的结果。
- 若它与你自己解出的结果不一致，仍填这份，并在 explanation 末尾用一句中文注明分歧。
- 每题额外给出 "num"：该题在试卷里的题号，整数（如 17）。`
      : position === 'inline'
      ? `【参考答案】
这份试卷的答案紧跟在每道题后面。请把答案部分从题目里剥出来，完整写进 answerText；
stem 里只留问题本身，不要保留答案。`
      : `【参考答案】
这份试卷没有答案。请你自己解题，把完整的解题过程和结论写进 answerText。

⚠️ 你写的答案会成为判分的标准答案（老师必须逐题核对后才能发布），所以请写全、写准，不要省略计算步骤。`

  return `你是 AP/IGCSE 化学题库录入助手。把下面这份试卷的文本拆成一道道简答题（问答题、计算题、填空题），输出 JSON。

【试卷排版特点，必须正确处理】
1. 大题可能带小问 (a)(b)(c)：每个小问单独成为一道题，stem 里保留小问的标号（如 "(a)"）和它的完整内容。
2. 独立的公式块或表格属于紧随其后的那道题，要并进它的 stem，不要丢，也不要单列成一道题。
3. 题号（"17."、"Question 3" 等）不要写进 stem。
4. 要求画图或填表的题：把要求原样写进 stem（图本身老师会另外补）。
5. 大题分组：若若干小问同属一道大题（共用一段材料、一组数据、一个实验描述），
   把这些小问的 groupRef 都填上那一道大题的题号（字符串，如 "1"、"2"）。
   独立成题的（不属于任何大题）填 null。
   注意：共同的那段材料要【完整写进每道小问自己的 stem 里】，不要省略、不要写
   "见上题" —— 学生看到的每一道小问都是独立的，重复没有关系。
   groupRef 只看卷面上的大题号，不要根据内容相似度去猜。

【逐题判断所属课时】
下面是这门课（${courseName}）的章节课时清单。为每道题判断它最匹配的课时，返回 lessonRef，格式 "章号.课时号"，例如 "5.1"：
${lessonList}
lessonRef 必须来自上面的清单；拿不准就填 null，不要编造。

${answerBlock}

【输出字段】每题一个对象：
{"stem":"...","answerText":"...","explanation":"...","difficulty":1,"lessonRef":"5.1","images":[],"num":null,"groupRef":null}
- groupRef：所属大题的题号（如 "1"）；独立成题的填 null
- stem / answerText / explanation 保持原语言（英文），不要翻译
- answerText 必填：完整的参考答案，含关键计算过程 —— 它就是判分标准
- explanation 是给老师看的讲解，可以简略；不要以 "Answer:" 开头（那是选择题的格式）
- LaTeX 写成 $...$ 或 $$...$$，不要用 <eq> 或任何 HTML 标签
- 题目里夹着的图片：把链接放进 images 数组（一道题可能有多张图），并从 stem 里去掉那几行 ![](...)；没有就填空数组 []
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

  const {
    text, courseId, batchIndex: rawBatchIndex, answerText,
    paperMode: rawPaperMode, answerPosition: rawAnswerPosition,
  } = await request.json()
  if (!text?.trim()) return NextResponse.json({ error: '请粘贴试卷文本' }, { status: 400 })
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })

  const paperMode: 'choice' | 'short' = rawPaperMode === 'short' ? 'short' : 'choice'
  // Where the answers are. "end" means they were pasted into the answer box;
  // without a box the only sensible fallback is for the model to solve it.
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

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })
  // A normal batch answers in ~12s. Without an explicit timeout the SDK waits up
  // to 10 MINUTES and retries twice on its own, so one stalled call keeps the
  // request alive until the platform kills the function at 60s and answers with
  // an HTML error page — which is what the browser reported as "not valid JSON".
  // Fail at 40s instead, so the route can answer properly and the client retries.
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 40_000, maxRetries: 0 })

  // Normalise the pasted text before splitting. normaliseMineruText turns
  // MinerU's <eq>…</eq> into $…$ and its HTML tables into markdown tables, so
  // the model sees structure instead of tags (and formulas survive as math).
  const cleanText = normaliseMineruText(
    text
      .replace(/<span[^>]*class="katex"[^>]*>[\s\S]*?<\/span>/g, ' ')
      .replace(/\\\(/g, '$').replace(/\\\)/g, '$')
      .replace(/\\\[/g, '$$$').replace(/\\\]/g, '$$$'),
  )

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
  // The key is usually pasted as MinerU HTML — <table><tr><td>1</td><td>B</td>…
  // Normalise it first. Without this the tags sit between the number and the
  // letter, nothing parses, and the run silently behaves as "no key given" —
  // which also means no mismatch warning.
  const keyText = normaliseMineruText(typeof answerText === 'string' ? answerText : '')
  const keyLetters = keyText.replace(/\|/g, ' ').replace(/^[\s\-:|]+$/gm, '')
  const parsedKey = paperMode === 'choice' && keyLetters.trim() ? parseAnswerKey(keyLetters) : null
  const answerKey = parsedKey && parsedKey.size > 0 ? parsedKey : null

  const prompt = paperMode === 'short'
    ? buildShortPrompt(chunk, outline.courseName, outline.promptList, answerPosition, keyText)
    : buildPrompt(chunk, outline.courseName, outline.promptList, answerKey)
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
    const common = {
      stem: String(q.stem ?? '').trim(),
      groupRef: String(q.groupRef ?? '').trim() || null,
      explanation: String(q.explanation ?? '').trim(),
      difficulty: Math.min(5, Math.max(1, Number(q.difficulty) || 3)),
      images: (Array.isArray(q.images) ? q.images : []).map((u: any) => String(u ?? '').trim()).filter(Boolean),
      lessonRef: hit ? hit.ref : null,
      lessonId: hit ? hit.lessonId : null,
      chapterId: hit ? hit.chapterId : null,
      chapterTitle: hit ? hit.chapterTitle : null,
      lessonTitle: hit ? hit.lessonTitle : null,
    }

    if (paperMode === 'short') {
      return {
        ...common,
        answerType: 'short' as const,
        answerText: String(q.answerText ?? '').trim(),
        num: Number.isInteger(q.num) ? q.num : null,
        options: [],
      }
    }

    // The model reports its own answer next to the official one; where they part
    // ways is exactly where a human should look (a wrong key, or a trap).
    const num = Number.isInteger(q.num) ? q.num : null
    const official = num !== null && answerKey ? answerKey.get(num) ?? null : null
    const own = typeof q.independentAnswer === 'string' ? q.independentAnswer.trim().toUpperCase().slice(0, 1) : ''
    const disputed = !!official && !!own && official !== own

    return {
      ...common,
      answerType: 'choice' as const,
      answerText: '',
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
  const suspect = questions.filter((q) => paperMode === 'short'
    ? !q.answerText
    : (q.options.length < 2 || q.options.filter((o: any) => o.isCorrect).length !== 1),
  ).length
  return NextResponse.json({ questions, failed, suspect, batchIndex, totalBatches: batches.length })
}
