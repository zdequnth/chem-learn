import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

const fixJson = (s: string): string => {
  return s
    .replace(/(?<!\\)\\(?=[a-zA-Z()\[\]])/g, '\\\\')
    .replace(/,(\s*[}\]])/g, '$1')
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

  const prompt = `请将以下题目文本解析为结构化JSON。${courseName ? '课程：' + courseName : ''}${chapterTitle ? ' 章节：' + chapterTitle : ''}${lessonTitle ? ' 课时：' + lessonTitle : ''}

题目文本：
${cleanText}

规则：
1. 每道题包含 stem、options（4个，含 content 和 isCorrect）、explanation、difficulty（1-5）
2. 题目中已有的LaTeX公式（$...$ 或 \\(...\\) 格式）原样保留在 stem/options/explanation 中
3. 普通文本中的上下角标保持原文（如 P₄O₁₀、H₂O）
4. 解析以"正确答案：X"开头
5. 选项 content 不要带"A. "前缀
6. 题号/分隔符忽略
7. 绝对不要输出任何HTML标签（<span>、<div>、<math>等）

输出纯JSON（不要markdown代码块）：{"questions":[{"stem":"...","options":[{"content":"...","isCorrect":false}...],"explanation":"正确答案：B。...","difficulty":3}]}`

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
    // Aggressively strip any HTML tags from AI response
    raw = raw.replace(/<[^>]+>/g, ' ')
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
