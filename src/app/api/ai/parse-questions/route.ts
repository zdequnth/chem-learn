import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// Batching makes this slower than Vercel's default function timeout.
export const maxDuration = 60

// Source characters sent per LLM call. Small batches keep the model's JSON
// output well below its token cap, which is where it becomes unreliable.
const MAX_CHARS_PER_BATCH = 3500

/**
 * Split pasted text into chunks small enough for one reliable LLM call each.
 * Splits on blank lines first; an oversized paragraph is further split at the
 * start of numbered questions, so a single question is never cut in half.
 */
function splitIntoBatches(text: string): string[] {
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)

  const units: string[] = []
  for (const para of paragraphs) {
    if (para.length <= MAX_CHARS_PER_BATCH) {
      units.push(para)
      continue
    }
    const runs = para.split(/^(?=\s*\d+\s*[.、)．:]\s*)/m).map((r) => r.trim()).filter((r) => r.length > 0)
    if (runs.length > 1) units.push(...runs)
    else units.push(para) // one genuinely huge question — send it alone
  }

  const batches: string[] = []
  let current: string[] = []
  let currentLen = 0
  for (const unit of units) {
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

function buildPrompt(text: string, ctx: { courseName?: string; chapterTitle?: string; lessonTitle?: string }): string {
  const { courseName, chapterTitle, lessonTitle } = ctx
  const context = [
    courseName && `课程：${courseName}`,
    chapterTitle && `章节：${chapterTitle}`,
    lessonTitle && `课时：${lessonTitle}`,
  ].filter(Boolean).join(' ')

  return `请将以下题目文本解析为结构化JSON。${context ? context + '。' : ''}

题目文本：
${text}

规则：
1. 每道题包含 stem、options（4个，含 content 和 isCorrect）、explanation、difficulty（1-5）
2. 题目中已有的LaTeX公式（$...$ 或 \\(...\\) 格式）原样保留在 stem/options/explanation 中；JSON 字符串里的反斜杠写成双反斜杠（例如 \\ce、\\text）
3. 普通文本中的上下角标保持原文（如 P₄O₁₀、H₂O）
4. 必须输出题目文本中的全部题目，数量与输入一致，不可省略、合并或跳过任何一道
5. 题干、选项、解析严格保持原有语言，禁止翻译（例如英文解析不要翻译成中文）
6. explanation 开头写明正确答案，语言与题目一致：英文题用"Answer: X"，中文题用"正确答案：X"（X为A/B/C/D），然后接详细解析
7. 选项 content 不要带"A. "前缀
8. 题号/分隔符忽略
9. 绝对不要输出任何HTML标签（<span>、<div>、<math>等）
10. stem/explanation 中需要换行或分点的地方，用 \\n 表示换行，保持原有分段，不要挤成一行

输出纯JSON（不要markdown代码块）：{"questions":[{"stem":"...","options":[{"content":"...","isCorrect":false}...],"explanation":"Answer: B. ...","difficulty":3}]}`
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

    // JSON mode returns parseable JSON, so parse it directly — a regex "fix"
    // used to escape LaTeX backslashes but also mangled real newlines into
    // the literal characters "\n".
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
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, lessonTitle, chapterTitle, courseName } = await request.json()
  if (!text?.trim()) return NextResponse.json({ error: '请输入题目内容' }, { status: 400 })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })

  // Strip pre-rendered KaTeX HTML + normalize LaTeX delimiters.
  // Only real HTML tags are removed — a bare "<" (e.g. "a < b" comparisons in
  // question options) must stay, or it eats the text up to the next ">".
  const cleanText = text
    .replace(/<span[^>]*class="katex"[^>]*>[\s\S]*?<\/span>/g, ' ')
    .replace(/<[a-zA-Z/!][^>]*>/g, '')
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')  // \(...\) → $...$
    .replace(/\\\[/g, '$$$').replace(/\\\]/g, '$$$')  // \[...\] → $$...$$

  const ctx = { courseName, chapterTitle, lessonTitle }
  const allQuestions: any[] = []
  const failed: string[] = []

  for (const chunk of splitIntoBatches(cleanText)) {
    const prompt = buildPrompt(chunk, ctx)
    let result = await parseChunk(client, prompt)
    if (!result.ok) result = await parseChunk(client, prompt) // retry once (failures are random)
    if (result.ok) allQuestions.push(...result.questions)
    else failed.push(chunk.slice(0, 80))
  }

  if (allQuestions.length === 0) {
    return NextResponse.json(
      { error: 'AI解析失败，请检查题目格式', raw: failed[0] || '' },
      { status: 500 }
    )
  }
  return NextResponse.json({ questions: allQuestions, failed })
}
