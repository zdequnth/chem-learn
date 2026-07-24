import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const fixJson = (s: string): string => {
  // Escape ALL backslashes first
  let t = s.replace(/\\/g, '\\\\')
  // Then fix the over-escaped valid JSON escapes: \" \\ \/ \b \f \n \r \t \u
  t = t.replace(/\\\\\\"/g, '\\"').replace(/\\\\\\\\/g, '\\\\').replace(/\\\\\\//g, '\\/')
  t = t.replace(/\\\\b(?=[^a-zA-Z])/g, '\\b').replace(/\\\\f(?=[^a-zA-Z])/g, '\\f')
  t = t.replace(/\\\\n(?=[^a-zA-Z])/g, '\\n').replace(/\\\\r(?=[^a-zA-Z])/g, '\\r')
  t = t.replace(/\\\\t(?=[^a-zA-Z])/g, '\\t').replace(/\\\\u/g, '\\u')
  // Remove trailing commas
  t = t.replace(/,(\s*[}\]])/g, '$1')
  return t
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

  // Strip pre-rendered KaTeX HTML + normalize LaTeX delimiters
  const cleanText = text
    .replace(/<span[^>]*class="katex"[^>]*>[\s\S]*?<\/span>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/\\\(/g, '$').replace(/\\\)/g, '$')  // \(...\) → $...$
    .replace(/\\\[/g, '$$$').replace(/\\\]/g, '$$$')  // \[...\] → $$...$$

  const prompt = `你是一位化学教师。请将以下题目文本解析为结构化JSON。
${courseName ? '课程：' + courseName : ''}${chapterTitle ? ' 章节：' + chapterTitle : ''}${lessonTitle ? ' 课时：' + lessonTitle : ''}

题目文本：
${cleanText}

规则：
1. 每道题包含 stem（题干）、4个 options（选项，含 content 和 isCorrect）、explanation（解析）、difficulty（1-5）
2. 化学式必须用 $\\ce{...}$ 包裹（重要！化学式和方程式要用 $\\ce{}$ 形式，不要用 \\( \\) 形式，不要输出HTML标签），纯文本和数字的公式用 $...$ 包裹
3. 解析以"正确答案：X"开头
4. 选项 content 不要带"A. "前缀
5. 题号/分隔符（如 ---）忽略
6. 注意：所有LaTeX公式（包括 \\( 和 \\) 格式的）一律转换为 $...$ 格式，绝对不要输出HTML标签

输出纯JSON：{"questions":[{"stem":"...","options":[{"content":"...","isCorrect":false}...],"explanation":"正确答案：B。...","difficulty":3}]}`

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是化学教师。输出纯JSON，不要markdown代码块。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 8192,
    })

    let raw = completion.choices[0]?.message?.content || ''
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    let parsed: any
    try {
      parsed = JSON.parse(fixJson(raw))
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(fixJson(match[0])) } catch {
          return NextResponse.json({ error: 'AI解析失败，请检查题目格式', raw: raw.substring(0, 300) }, { status: 500 })
        }
      } else {
        return NextResponse.json({ error: 'AI未返回有效JSON', raw: raw.substring(0, 300) }, { status: 500 })
      }
    }

    return NextResponse.json({ questions: parsed?.questions || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || '解析失败' }, { status: 500 })
  }
}
