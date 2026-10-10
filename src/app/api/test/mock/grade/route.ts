import { createClient } from '@/lib/supabase/server'
import { applyGrades, buildReview, loadSession, pendingShortAnswers } from '@/lib/mock-source'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export const maxDuration = 60

// One batch per request, with the client looping — a whole paper is dozens of
// answers, and grading them all in one request would blow the serverless limit.
const BATCH = 10

const SYSTEM = '你是化学阅卷老师。只输出纯JSON，不要markdown代码块，不要任何多余文字。'

interface PendingItem {
  questionId: string
  stem: string
  reference: string
  studentAnswer: string
}

function buildPrompt(batch: PendingItem[]): string {
  const items = batch
    .map((b, i) => `[${i}] 题目：${b.stem}\n    参考答案：${b.reference}\n    学生作答：${b.studentAnswer}`)
    .join('\n\n')
  return `下面是若干道简答题，请逐题判断学生的作答算不算对。

判分原则：
- 只看知识是否正确，不要求措辞和参考答案一致；等价的说法一样算对。
- 数值题：数值对就算对，有效数字、书写格式的差别不算错。单位错或数量级错算错。
- 答对主要得分点即可，不要求面面俱到；答非所问、结论错误算错。
- 书写格式不扣分：括号的多少（[A][B]/[C][D] 和 ([A][B])/([C][D]) 是同一个式子）、
  上下标写成 ^ 或 _ 或干脆不写、大小写与空格差异，都不算错。
  判断的唯一依据是式子表达的含义是否相同 —— 学生是在纯文本框里手打的，写不出规范排版。
- 拿不准时倾向判对，并在评语里写明需要老师复核。

每题输出一个对象，i 是题目序号（从 0 开始）：
{"results":[{"i":0,"correct":true,"feedback":"一句中文批语：对在哪、错在哪，或为什么拿不准（限 60 字）"}]}

输出纯 JSON：{"results":[...]}

题目：
${items}`
}

/** Returns null when the call failed — the batch is then left ungraded for a retry. */
async function gradeBatch(
  client: OpenAI,
  batch: PendingItem[],
): Promise<{ questionId: string; correct: boolean; feedback: string }[] | null> {
  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-flash',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: buildPrompt(batch) },
      ],
      temperature: 0,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    })
    let raw = completion.choices[0]?.message?.content || ''
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let parsed: any
    try { parsed = JSON.parse(raw) } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) return null
      parsed = JSON.parse(m[0])
    }
    const results: any[] = Array.isArray(parsed?.results) ? parsed.results : []
    if (results.length === 0) return null

    const byIndex = new Map(results.map((r) => [Number(r?.i), r]))
    return batch.map((b, i) => {
      const r: any = byIndex.get(i)
      // A missing verdict is not "correct" — better to under-credit and let the
      // teacher's review catch it than to hand out marks nobody awarded.
      return { questionId: b.questionId, correct: r?.correct === true, feedback: String(r?.feedback ?? '').trim() }
    })
  } catch {
    return null
  }
}

// POST { sessionId } → grade the next batch of free-response answers.
//   { graded, remaining, done, failed?, review? }
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { sessionId } = await request.json()
  if (!sessionId) return NextResponse.json({ error: '缺少sessionId' }, { status: 400 })

  const session = await loadSession(sessionId)
  if (!session || session.student_id !== user.id) return NextResponse.json({ error: '考试不存在' }, { status: 404 })
  if (session.status !== 'submitted') return NextResponse.json({ error: '还没交卷' }, { status: 400 })

  // Already finished (or a paper with no free-response questions at all).
  if (session.graded_at) {
    return NextResponse.json({ graded: 0, remaining: 0, done: true, review: await buildReview(session) })
  }

  const { batch, remaining } = await pendingShortAnswers(session, BATCH)

  // Nothing left in the queue: close out the score. (Blank answers were marked
  // wrong inside pendingShortAnswers and never entered a batch.)
  if (batch.length === 0) {
    await applyGrades(session, [])
    const done = (await loadSession(sessionId)) ?? session
    return NextResponse.json({ graded: 0, remaining: 0, done: true, review: await buildReview(done) })
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })
  // Same reasoning as the paper parser: without an explicit timeout the SDK
  // waits ten minutes and retries twice, long past the platform's 60s kill.
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 40_000, maxRetries: 0 })

  const grades = await gradeBatch(client, batch)
  if (!grades) {
    // Leave them ungraded so the client can retry this batch.
    return NextResponse.json({ graded: 0, remaining: remaining + batch.length, done: false, failed: true })
  }

  const { remaining: left } = await applyGrades(session, grades)
  const payload: any = { graded: grades.length, remaining: left, done: left === 0 }
  if (left === 0) {
    const done = (await loadSession(sessionId)) ?? session
    payload.review = await buildReview(done)
  }
  return NextResponse.json(payload)
}
