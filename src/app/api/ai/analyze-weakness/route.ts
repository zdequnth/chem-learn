import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

// AI analysis of a student's wrong questions, chapter by chapter.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { groups } = await request.json() // [{ chapter, stems: string[] }]
  if (!Array.isArray(groups) || groups.length === 0) {
    return NextResponse.json({ error: '暂无错题可分析' }, { status: 400 })
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })

  const body = groups.slice(0, 12).map((g: any) =>
    `### 章节：${g.chapter}\n` +
    (g.stems || []).slice(0, 30).map((s: string) => '- ' + String(s).replace(/\s+/g, ' ').slice(0, 120)).join('\n')
  ).join('\n\n')

  const prompt = `你是一位经验丰富的化学老师。下面是一位学生对各章节的错题（按章节分组，每题只给题干）。请逐章节分析他的薄弱点，给出针对性的知识点归纳和补救建议。

${body}

输出要求（Markdown）：
- 每个章节一个 ## 小节，包含：
  - **薄弱点**：这几道错题反映出的共性问题
  - **应补的知识点**：核心概念、关键公式（用 $...$ LaTeX 表示）
  - **建议**：怎么练、怎么记
- 最后给一个 "## 总体建议" 小节（整体最薄弱的 1~2 个方向 + 具体行动建议）
- 语言与题干语言一致
- 可以用表格归纳；只输出 Markdown 正文，不要 HTML 标签`

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是经验丰富的化学老师，用 Markdown 输出，公式用 LaTeX。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4, max_tokens: 3000,
    })
    return NextResponse.json({ result: completion.choices[0]?.message?.content || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'AI分析失败' }, { status: 500 })
  }
}
