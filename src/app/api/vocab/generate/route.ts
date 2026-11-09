import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { normaliseDifficulty } from '@/lib/types'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// AI generation can take a few batches; the route still has to finish inside
// the serverless limit.
export const maxDuration = 60

const MAX_WORDS = 60
const BATCH_SIZE = 20

async function checkLessonAccess(userId: string, lessonId: string): Promise<string | null> {
  const role = (await (await createClient()).auth.getUser()).data.user?.user_metadata?.role
  if (role === 'admin') return ''
  const { data: ln } = await supabaseAdmin('lessons', { query: `?id=eq.${lessonId}&select=chapter_id` })
  if (!ln?.length) return null
  const { data: ch } = await supabaseAdmin('chapters', { query: `?id=eq.${ln[0].chapter_id}&select=course_id` })
  if (!ch?.length) return null
  const courseId = ch[0].course_id
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id,subject,kind` })
  const owner = course?.[0]?.owner_id
  if (owner === userId) return course?.[0]?.subject || ''
  const { data: cc } = await supabaseAdmin('course_collaborators', {
    query: `?course_id=eq.${courseId}&teacher_id=eq.${userId}&select=id`,
  })
  return (cc || []).length ? (course?.[0]?.subject || '') : null
}

// Accept one word per line, and also commas / Chinese commas / semicolons.
// Strip list numbering and bullets so "1. atom" becomes "atom".
function parseTerms(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const piece of raw.split(/[\n\r,，;；、]+/)) {
    const term = piece.replace(/^\s*(?:\d+[.)、]\s*|[-*•]\s*)/, '').trim()
    if (!term) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(term)
    if (out.length >= MAX_WORDS) break
  }
  return out
}

function buildPrompt(terms: string[], subject: string): string {
  return `你是一位国际学校${subject || '学科'}教师，正在为「背单词」课程生成词条。请为下面每个英文词或短语生成一条完整词条。

词汇列表：
${terms.map((t, i) => `${i + 1}. ${t}`).join('\n')}

只输出纯 JSON（不要 markdown 代码块，不要任何解释）：
{"words":[{"term":"atom","ipa":"/ˈætəm/","pos":"n.","zh":"原子","en_def":"The smallest particle of an element.","example_en":"An atom of carbon has six protons.","note":"","difficulty":"核心必背"}]}

字段要求：
- term：与列表中的写法完全一致
- ipa：英式音标，用 /.../ 包裹；不确定就填空字符串
- pos：词性缩写，如 n. / v. / adj. / adv. / phr.
- zh：简明准确的简体中文释义
- en_def：一句适合国际学校学生的英文定义
- example_en：一个自然的英文例句
- note：易错点、近义词辨析或记忆提示，可空字符串
- difficulty：只能填「核心必背」「重要理解」「拓展阅读」之一（基础高频词用核心必背，常规术语用重要理解，偏门词用拓展阅读）

规则：每个词一条，不要漏，也不要添加列表以外的词；术语要符合${subject || '该学科'}规范。`
}

async function generateBatch(client: OpenAI, prompt: string): Promise<any[]> {
  const completion = await client.chat.completions.create({
    model: 'deepseek-flash',
    reasoning_effort: 'none',
    temperature: 0.3,
    max_tokens: 8192,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '你是词条编辑助手。只输出纯 JSON，不要 markdown 代码块。' },
      { role: 'user', content: prompt },
    ],
  })
  let raw = completion.choices[0]?.message?.content || ''
  raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  let parsed: any
  try {
    parsed = JSON.parse(raw)
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('AI did not return valid JSON（AI 未返回有效 JSON）')
    parsed = JSON.parse(match[0])
  }
  return Array.isArray(parsed?.words) ? parsed.words : Array.isArray(parsed) ? parsed : []
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in（请先登录）' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const lessonId = typeof body?.lessonId === 'string' ? body.lessonId : ''
  const rawWords = typeof body?.words === 'string' ? body.words : ''
  if (!lessonId) return NextResponse.json({ error: 'Missing lessonId（缺少 lessonId）' }, { status: 400 })

  const terms = parseTerms(rawWords)
  if (terms.length === 0) return NextResponse.json({ error: 'Please paste at least one word（请至少粘贴一个单词）' }, { status: 400 })

  const subject = await checkLessonAccess(user.id, lessonId)
  if (subject === null) return NextResponse.json({ error: 'Not allowed（无权操作）' }, { status: 403 })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key is not configured（DeepSeek API key 未配置）' }, { status: 500 })
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 45_000, maxRetries: 0 })

  // Generate in small batches: the JSON output for 60 words at once is close to
  // the token cap and becomes unreliable.
  const generated: any[] = []
  try {
    for (let i = 0; i < terms.length; i += BATCH_SIZE) {
      const batch = terms.slice(i, i + BATCH_SIZE)
      generated.push(...await generateBatch(client, buildPrompt(batch, subject)))
    }
  } catch (e: any) {
    return NextResponse.json(
      { error: 'AI generation failed（AI 生成失败）: ' + (e?.message || e) },
      { status: 502 },
    )
  }

  const wanted = new Map(terms.map(t => [t.toLowerCase(), t]))
  const byTerm = new Map<string, any>()
  for (const item of generated) {
    const term = String(item?.term ?? '').trim()
    const zh = String(item?.zh ?? '').trim()
    if (!term || !zh) continue
    const key = term.toLowerCase()
    // Discard anything the model invented beyond the teacher's list.
    if (!wanted.has(key) || byTerm.has(key)) continue
    byTerm.set(key, item)
  }
  const missing = terms.filter(t => !byTerm.has(t.toLowerCase()))

  if (byTerm.size === 0) {
    return NextResponse.json({ error: 'AI did not return usable words. Please check the spelling and try again.（AI 没有生成可用词条，请检查单词拼写后重试）' }, { status: 502 })
  }

  const { data: existing } = await supabaseAdmin('vocab_words', {
    query: `?lesson_id=eq.${lessonId}&select=term,sort_order`,
  })
  const have = new Set((existing || []).map((w: any) => String(w.term).toLowerCase()))
  let nextOrder = (existing || []).reduce((m: number, w: any) => Math.max(m, w.sort_order ?? 0), -1) + 1
  const skipped: string[] = []
  const rows: any[] = []

  for (const term of terms) {
    const key = term.toLowerCase()
    const item = byTerm.get(key) as any
    if (!item) continue
    if (have.has(key)) { skipped.push(term); continue }
    have.add(key)
    rows.push({
      lesson_id: lessonId,
      term: wanted.get(key) || term,
      ipa: String(item.ipa ?? '').trim() || null,
      pos: String(item.pos ?? '').trim() || null,
      zh: String(item.zh ?? '').trim(),
      en_def: String(item.en_def ?? '').trim() || null,
      example_en: String(item.example_en ?? '').trim() || null,
      example_zh: String(item.example_zh ?? '').trim() || null,
      note: String(item.note ?? '').trim() || null,
      difficulty: normaliseDifficulty(item.difficulty),
      sort_order: nextOrder++,
    })
  }

  if (rows.length === 0) {
    return NextResponse.json({ saved: 0, skipped: skipped.length, missing })
  }

  const { data, error } = await supabaseAdmin('vocab_words', {
    method: 'POST', body: rows, query: '?select=*',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ saved: (data || []).length, skipped: skipped.length, missing, words: data })
}
