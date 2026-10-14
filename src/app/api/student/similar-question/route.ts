import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

/**
 * Nothing in the bank tests this topic, so write one on the spot.
 *
 * Without this the 「同类型题目重复训练」 button simply has nothing to give for any
 * lesson whose bank is thin — which is most of them early on. A generated
 * question is not stored: it is practice, not bank material, and the teacher
 * never reviewed it.
 */
async function generateSimilar(q: { id: string; stem: string; answer_text?: string | null }): Promise<any | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return null

  const { data: opts } = await supabaseAdmin('question_options', {
    query: `?question_id=eq.${q.id}&order=display_order&select=content,is_correct`,
  })
  const list = (opts || []) as any[]
  const optionsText = list.map((o, i) => `(${String.fromCharCode(65 + i)}) ${o.content}`).join('\n')
  const correct = list.find((o) => o.is_correct)?.content || q.answer_text || ''

  const prompt = `你是化学老师。下面是一道学生做错的题。请出【一道新的同类题】考同一个知识点，但题干、数字、情境都要换掉 —— 不要只是把原题改个数字。

原题题干：
${q.stem}
${optionsText ? `\n原题选项：\n${optionsText}\n` : ''}${correct ? `\n正确答案：${correct}\n` : ''}
要求：
1. 4 个选项，恰好 1 个正确。
2. 干扰项要像真的（学生常犯的错），不要一眼就能排除。
3. 语言与原题一致（原题是英文，新题也用英文）。
4. 公式、化学式用 $...$ 包起来（LaTeX）。
5. explanation 一两句话：为什么对、其它为什么错。
6. 如果这道题依赖图片、或本身不适合出同类题，返回 {"skip":true}。

只输出 JSON，不要 markdown 代码块：
{"stem":"...","options":[{"content":"...","isCorrect":false}],"explanation":"..."}`

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 40_000, maxRetries: 0 })
  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-flash',
      // 关掉推理：实测质量不变，但快 3~4 倍 —— 图像解析原来就是被推理拖过了 45 秒超时
      reasoning_effort: 'none',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 8192,
      response_format: { type: 'json_object' },
    })
    let raw = completion.choices[0]?.message?.content || ''
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(raw)
    if (parsed?.skip) return null

    const stem = String(parsed?.stem ?? '').trim()
    const options = (Array.isArray(parsed?.options) ? parsed.options : [])
      .map((o: any, i: number) => ({ id: `ai-${i}`, content: String(o?.content ?? '').trim(), isCorrect: o?.isCorrect === true }))
      .filter((o: any) => o.content)
    // Same bar the teacher's own questions have to clear.
    if (!stem || options.length < 2 || options.filter((o: any) => o.isCorrect).length !== 1) return null

    return {
      id: `ai-${q.id.slice(0, 8)}-${Date.now().toString(36)}`,
      stem,
      imageUrl: null,
      explanation: String(parsed?.explanation ?? '').trim(),
      scope: 'generated',
      generated: true,
      options,
    }
  } catch {
    return null
  }
}

// Pick another approved question testing the same knowledge point (falling back
// to the same lesson) for extra practice on a wrong question.
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const questionId = searchParams.get('questionId')
  if (!questionId) return NextResponse.json({ error: '缺少questionId' }, { status: 400 })

  const { data: cur } = await supabaseAdmin('questions', {
    query: `?id=eq.${questionId}&select=id,lesson_id,knowledge_point_id,question_type,stem,answer_text`,
  })
  const q = cur?.[0]
  if (!q) return NextResponse.json({ error: '题目不存在' }, { status: 404 })

  const qtype = q.question_type || 'gate_test'
  // Mock questions point at a lesson of the bound gate course, but there are only
  // ever a handful of mock questions per lesson — so on their own they rarely
  // turn up a match. For a mock question we therefore also draw on the gate
  // questions of the same lesson, which is exactly the drilling material a
  // student who just missed that topic needs.
  const types = qtype === 'mock' ? ['mock', 'gate_test'] : [qtype]
  const candidatesFor = async (filter: string, type: string) => {
    const { data } = await supabaseAdmin('questions', {
      query: `?${filter}&question_type=eq.${type}&is_approved=eq.true&id=neq.${q.id}&select=id,stem,image_url,explanation&limit=100`,
    })
    return data || []
  }
  const gather = async (filter: string) => {
    for (const t of types) {
      const found = await candidatesFor(filter, t)
      if (found.length > 0) return found
    }
    return []
  }

  let candidates = q.knowledge_point_id ? await candidatesFor(`knowledge_point_id=eq.${q.knowledge_point_id}`, qtype) : []
  let scope = 'knowledge_point'
  if (candidates.length === 0) {
    candidates = await gather(`lesson_id=eq.${q.lesson_id}`)
    scope = 'lesson'
  }
  // Bank has nothing for this topic — write one instead of leaving the button dead.
  if (candidates.length === 0) return NextResponse.json({ question: await generateSimilar(q) })

  // Prefer questions the student has not already answered correctly — across
  // both the gate tests and any mock exams they have sat.
  const answeredCorrect = new Set<string>()
  const { data: sess } = await supabaseAdmin('gate_test_sessions', { query: `?student_id=eq.${user.id}&select=id` })
  const sids = (sess || []).map((s: any) => s.id)
  for (let i = 0; i < sids.length; i += 150) {
    const { data } = await supabaseAdmin('gate_test_answers', {
      query: `?session_id=in.(${sids.slice(i, i + 150).join(',')})&is_correct=eq.true&select=question_id`,
    })
    for (const a of (data || [])) answeredCorrect.add(a.question_id)
  }
  const { data: mockSess } = await supabaseAdmin('mock_test_sessions', {
    query: `?student_id=eq.${user.id}&status=eq.submitted&select=id`,
  })
  const msids = (mockSess || []).map((s: any) => s.id)
  for (let i = 0; i < msids.length; i += 150) {
    const { data } = await supabaseAdmin('mock_test_answers', {
      query: `?session_id=in.(${msids.slice(i, i + 150).join(',')})&is_correct=eq.true&select=question_id`,
    })
    for (const a of (data || [])) answeredCorrect.add(a.question_id)
  }
  const preferred = candidates.filter((c: any) => !answeredCorrect.has(c.id))
  const pool = preferred.length > 0 ? preferred : candidates
  const chosen = pool[Math.floor(Math.random() * pool.length)]

  const { data: opts } = await supabaseAdmin('question_options', {
    query: `?question_id=eq.${chosen.id}&order=display_order&select=id,content,is_correct`,
  })

  return NextResponse.json({
    question: {
      id: chosen.id,
      stem: chosen.stem,
      imageUrl: chosen.image_url || null,
      explanation: chosen.explanation || '',
      scope,
      options: (opts || []).map((o: any) => ({ id: o.id, content: o.content, isCorrect: o.is_correct })),
    },
  })
}
