import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: Request) {
  const { stem, explanation } = await request.json()
  if (!stem) return NextResponse.json({ error: '缺少题目内容' }, { status: 400 })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })

  const prompt = `你是一位国际学校化学教师。请根据以下错题的题干和解析，总结出这道题对应的核心知识点。

题目：${stem}
解析：${explanation || '无解析'}

要求：
1. 用 Markdown 格式，包含以下部分：
   - **核心概念**：1-2句话概括这道题考察的关键化学概念
   - **关键公式/反应**：使用 $\\ce{}$ 书写相关化学式或方程式
   - **常见误区**：学生容易犯的错误
   - **学习建议**：如何理解这个知识点
2. 简洁扼要，不超过200字
3. 使用中文`

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是化学教师。用Markdown精简输出。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5, max_tokens: 1024,
    })

    return NextResponse.json({ result: completion.choices[0]?.message?.content || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'AI生成失败' }, { status: 500 })
  }
}
