import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const fixJson = (s: string): string => {
  let t = s
  // Escape LaTeX backslashes: \ followed by letters or ( [
  t = t.replace(/(?<!\\)\\(?=[a-zA-Z()\[\]])/g, '\\\\')
  // Remove trailing commas
  t = t.replace(/,(\s*[}\]])/g, '$1')
  // Escape raw control chars inside strings
  t = t.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (_m, inner) => {
    const cleaned = inner.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
      .replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t')
    return '"' + cleaned + '"'
  })
  return t
}

async function generateBatch(client: OpenAI, prompt: string): Promise<any[]> {
  const completion = await client.chat.completions.create({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: '你是化学教师。输出纯JSON，不要markdown代码块。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 4096,
  })

  let raw = completion.choices[0]?.message?.content || ''
  raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

  try {
    return JSON.parse(fixJson(raw)).questions || []
  } catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) {
      try {
        return JSON.parse(fixJson(match[0])).questions || []
      } catch {
        return []
      }
    }
    return []
  }
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lessonId, questionType, count, topic } = await request.json()
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })
  const typeLabels: Record<string, string> = {
    gate_test: 'gate test questions',
    boss_test: 'chapter boss test questions',
  }
  const chemistryRules = `化学式规则：所有化学式必须用 \\ce{...} 包裹。离子电荷用 ^ 上标，如 \\ce{Cu^2+}（不要写成 Cu^{2+} 或 Cu^{2}+）。同位素如 \\ce{^235_92U}。水合离子如 \\ce{[Cu(H2O)6]^2+}。化学方程式如 \\ce{2H2 + O2 -> 2H2O}。不要在选项内容前加"A. "等字母前缀。`

  // Generate in batches of 5 for reliability
  const BATCH_SIZE = 5
  const batches = Math.ceil((count || 30) / BATCH_SIZE)
  const allQuestions: any[] = []

  for (let i = 0; i < batches; i++) {
    const batchCount = Math.min(BATCH_SIZE, (count || 30) - i * BATCH_SIZE)
    const batchPrompt = `你是一位经验丰富的国际学校化学教师。请用中文生成 ${batchCount} 道${typeLabels[questionType] || '题目'}。${topic ? '课程主题：' + topic : ''}难度：中等偏上（国际学校化学课程水平），题型：单选题（4个选项）。${chemistryRules}每题配详细解析，选项有干扰性。解析必须以"正确答案：X"开头，然后才是详细解释。输出纯JSON：{"questions":[{"stem":"题目内容","options":[{"content":"选项文本","isCorrect":false}...],"explanation":"正确答案：B。详细解析...","difficulty":3}]}`

    const questions = await generateBatch(client, batchPrompt)
    allQuestions.push(...questions)
  }

  return NextResponse.json({ questions: allQuestions })
}
