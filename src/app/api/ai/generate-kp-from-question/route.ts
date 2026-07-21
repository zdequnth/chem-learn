import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: Request) {
  const { stem, explanation } = await request.json()
  if (!stem) return NextResponse.json({ error: '缺少题目内容' }, { status: 400 })

  // Detect question language: count CJK characters
  const cjkCount = (stem.match(/[一-鿿㐀-䶿]/g) || []).length
  const totalChars = stem.replace(/\s/g, '').length
  const isChineseText = totalChars > 0 && cjkCount / totalChars > 0.3

  const langInst = isChineseText
    ? '使用中文（与题目的语言风格保持一致）'
    : '使用英文输出正文，最后额外附加一段中文翻译（标注"中文翻译："）'

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'API key not configured' }, { status: 500 })

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })

  const prompt = `你是一位经验丰富的国际学校教师。请根据以下错题的题干和解析，生成一份全面系统的知识点总结。

题目：${stem}
解析：${explanation || '无解析'}

要求：
1. 用纯文本格式（不用任何HTML标签），包含以下部分：
   - **核心概念**：这道题考察的核心概念是什么
   - **关键原理**：详细阐述背后的原理和规律
   - **相关公式/反应**：相关的方程式或计算公式
   - **易错辨析**：学生容易混淆的概念或常见错误
   - **知识拓展**：相关的延伸知识点
2. 围绕题目主题全面展开，不仅限于题目本身考到的点
3. 篇幅适中，每个部分2-4句话，总分总结构
4. 化学式直接写，如 Fe2O3、H2O，不要用LaTeX或KaTeX
5. ${langInst}
6. 重要：直接输出纯文本，不要包含任何HTML标签`

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
