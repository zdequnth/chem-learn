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

  const prompt = `你是一位经验丰富的国际学校化学教师。请根据下面这道错题，为学生生成一份系统、可复习的知识点总结。

题目：${stem}
解析：${explanation || '无解析'}

请用 Markdown 输出，包含以下几个部分（标题用 ##）：

## 一、核心概念
这道题真正考察的核心概念，讲清楚"是什么、为什么"。

## 二、关键公式 / 反应
相关的公式、方程式，**必须用 LaTeX 写**：行内用 $...$，独立公式用 $$...$$；化学方程式可用 $\\ce{2H2 + O2 -> 2H2O}$ 这种形式。

## 三、常见考点
这类知识点在考试中通常怎么考，列出 2~4 条。

## 四、易错点与辨析
学生最常犯的错误、容易混淆的概念。需要比较时，用 Markdown 表格，例如：
| 项目 | 正确理解 | 常见错误 |
| --- | --- | --- |
| ... | ... | ... |

## 五、解题与记忆技巧
遇到这类题该怎么想、怎么快速判断。

规则：
- 篇幅充实（约 300~600 字），围绕本题主题展开，可适当延伸到同一知识块
- 公式/化学式一律用 LaTeX（$...$ 或 \\ce{}）表示，**不要写成纯文本**
- 可以用 Markdown 表格做对比归纳
- 语言：${langInst}
- 只输出 Markdown 正文，不要 HTML 标签，不要代码块围栏`

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: '你是经验丰富的化学教师，用 Markdown 输出，公式用 LaTeX。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.5, max_tokens: 2500,
    })

    return NextResponse.json({ result: completion.choices[0]?.message?.content || '' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'AI生成失败' }, { status: 500 })
  }
}
