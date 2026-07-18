import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const fixJson = (s: string): string => {
  let t = s
  t = t.replace(/(?<!\\)\\(?=[a-zA-Z()\[\]])/g, '\\\\')
  t = t.replace(/,(\s*[}\]])/g, '$1')
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
      { role: 'system', content: '你是国际学校教师。输出纯JSON，不要markdown代码块。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.8, max_tokens: 4096,
  })
  let raw = completion.choices[0]?.message?.content || ''
  raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  try { return JSON.parse(fixJson(raw)).questions || [] }
  catch {
    const match = raw.match(/\{[\s\S]*\}/)
    if (match) { try { return JSON.parse(fixJson(match[0])).questions || [] } catch { return [] } }
    return []
  }
}

const subjects: Record<string, { role: string; rules: string }> = {
  Chinese: { role: '国际学校中文教师', rules: '用简体中文出题。考察语言运用、阅读理解、文学常识等。' },
  Math: { role: '国际学校数学教师', rules: '数学公式用 LaTeX 书写（如 $x^2 + y^2 = z^2$）。不要使用 \\ce{}。' },
  English: { role: '国际学校英文教师', rules: '用英文出题。考察 grammar、vocabulary、reading comprehension 等。不要使用 LaTeX。' },
  'Second foreign Language': { role: '第二外语教师', rules: '根据课程内容出题。不要使用 LaTeX。' },
  Physics: { role: '国际学校物理教师', rules: '公式用 LaTeX 书写（如 $F=ma$）。化学式用 \\ce{}。' },
  Chemistry: { role: '国际学校化学教师', rules: '所有化学式用 \\ce{...} 包裹。离子电荷用 ^ 上标，如 \\ce{Cu^2+}。方程式如 \\ce{2H2 + O2 -> 2H2O}。' },
  Biology: { role: '国际学校生物教师', rules: '科学术语保持准确性。可用 \\ce{} 写化学式。' },
  Humanities: { role: '国际学校人文教师', rules: '考察历史、地理、社会等人文学科知识。不要使用 LaTeX。' },
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { lessonId, questionType, count, topic, subject } = await request.json()
  const subj = subject || 'Chemistry'
  const cfg = subjects[subj] || subjects['Chemistry']
  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })

  const BATCH_SIZE = 5
  const batches = Math.ceil((count || 30) / BATCH_SIZE)
  const allQuestions: any[] = []

  for (let i = 0; i < batches; i++) {
    const batchCount = Math.min(BATCH_SIZE, (count || 30) - i * BATCH_SIZE)
    const batchPrompt = `你是一位经验丰富的${cfg.role}。请用中文生成 ${batchCount} 道单选题（4个选项）。${topic ? '课程主题：' + topic : ''}难度：中等偏上。${cfg.rules}每题配详细解析，选项有干扰性。解析必须以"正确答案：X"开头，然后才是详细解释。不要在选项内容前加"A. "等字母前缀。输出纯JSON：{"questions":[{"stem":"题目内容","options":[{"content":"选项文本","isCorrect":false}...],"explanation":"正确答案：B。详细解析...","difficulty":3}]}`
    const questions = await generateBatch(client, batchPrompt)
    allQuestions.push(...questions)
  }

  return NextResponse.json({ questions: allQuestions })
}
