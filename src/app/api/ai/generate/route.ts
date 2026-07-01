import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (user.user_metadata as any)?.role
  if (role !== 'teacher' && role !== 'admin') {
    return NextResponse.json({ error: '仅教师可用' }, { status: 403 })
  }

  const { lessonId, questionType, count, difficultyMin, difficultyMax, topic, language } = await request.json()

  const difficulty = difficultyMin && difficultyMax
    ? `${difficultyMin}-${difficultyMax}`
    : (difficultyMin || difficultyMax || 3)

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key not configured' }, { status: 500 })

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com' })

  const typeLabels: Record<string, string> = {
    gate_test: 'gate test questions',
    boss_test: 'chapter boss test questions',
  }

  const lang = language === 'chinese' ? '中文' : 'English'
  const chemistryRules = language === 'chinese'
    ? `化学式规则：所有化学式必须用 \\ce{...} 包裹。离子电荷用 ^ 上标，如 \\ce{Cu^2+}（不要写成 Cu^{2+} 或 Cu^{2}+）。同位素如 \\ce{^235_92U}。水合离子如 \\ce{[Cu(H2O)6]^2+}。化学方程式如 \\ce{2H2 + O2 -> 2H2O}。不要在选项内容前加"A. "等字母前缀。`
    : `Chemistry notation rules: ALWAYS wrap ALL chemical formulas in \\ce{...}. Use ^ for superscript charges: \\ce{Cu^2+} (NOT Cu^{2+} or Cu^{2}+). Isotopes: \\ce{^235_92U}. Hydrated ions: \\ce{[Cu(H2O)6]^2+}. Equations: \\ce{2H2 + O2 -> 2H2O}. Do NOT add "A. " prefixes in option content.`

  const basePrompt = language === 'chinese'
    ? `你是一位经验丰富的国际学校化学教师。请用中文生成 ${count} 道${typeLabels[questionType] || '题目'}。${topic ? '课程主题：' + topic : ''}难度范围：${difficulty}/5，题型：单选题（4个选项）。${chemistryRules}每题配详细解析，选项有干扰性。解析必须以"正确答案：X"开头，然后才是详细解释。输出纯JSON：{"questions":[{"stem":"题目内容","options":[{"content":"选项文本","isCorrect":false}...],"explanation":"正确答案：B。详细解析...","difficulty":3}]}`
    : `You are an experienced international school chemistry teacher. Generate ${count} ${typeLabels[questionType] || 'questions'}.${topic ? ' Topic: ' + topic : ''} Difficulty range: ${difficulty}/5. Type: multiple choice (4 options). ${chemistryRules}Each question must have a detailed explanation. Explanation MUST start with "Answer: X" followed by detailed reasoning. Output ONLY valid JSON: {"questions":[{"stem":"Question text","options":[{"content":"Option text","isCorrect":false}...],"explanation":"Answer: B. Detailed explanation...","difficulty":3}]}`

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: lang === 'English' ? 'You are a chemistry teacher. Output raw JSON only, no markdown.' : '你是化学教师。输出纯JSON，不要markdown代码块。' },
        { role: 'user', content: basePrompt },
      ],
      temperature: 0.8,
      max_tokens: 8192,
    })

    let raw = completion.choices[0]?.message?.content || ''

    // Strip markdown code fences
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // Fix LaTeX backslashes: \c, \f, \b, \t, \n, \r followed by letters are LaTeX commands,
    // not JSON escapes. Escape them so JSON.parse doesn't choke.
    const fixLatex = (s: string) => s.replace(/(?<!\\)\\(?=[a-zA-Z])/g, '\\\\')

    // Try to parse, with escalating fixes
    let generated: any
    try {
      generated = JSON.parse(fixLatex(raw))
    } catch (e1) {
      // Try extracting just the JSON object
      const match = raw.match(/\{[\s\S]*\}/)
      if (match) {
        try {
          generated = JSON.parse(fixLatex(match[0]))
        } catch (e2) {
          return NextResponse.json({
            error: 'AI返回格式异常，请重试。错误: ' + (e2 as Error).message,
            raw: raw.substring(0, 500),
          }, { status: 500 })
        }
      } else {
        return NextResponse.json({
          error: 'AI返回格式异常（未找到JSON），请重试',
          raw: raw.substring(0, 500),
        }, { status: 500 })
      }
    }

    const questions = generated?.questions || []

    return NextResponse.json({ questions })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'AI生成失败' }, { status: 500 })
  }
}
