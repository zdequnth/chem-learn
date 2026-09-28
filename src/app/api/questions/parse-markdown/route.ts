import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// Rule-based parser for the standard question template:
//   **1.** stem
//   - A. ...
//   - B. ...
//   **Answer: B**
//   Explanation: ...
// It is exact and free (no AI). Falls back to nothing (caller uses AI) when the
// text does not match this shape.
function parseMarkdownQuestions(text: string) {
  const clean = text
    .replace(/<span[^>]*class="katex"[^>]*>[\s\S]*?<\/span>/g, ' ')
    .replace(/<[a-zA-Z/!][^>]*>/g, '')
  const lines = clean.replace(/\r\n/g, '\n').split('\n')
  const raw: any[] = []
  let cur: any = null
  let stage = 'none'
  const isStart = (l: string) => /^\s*\*\*\s*\d+\s*[.)、．:]/.test(l) || /^\s*\d+\s*[.)、．:]\s+\S/.test(l)

  for (const line0 of lines) {
    const line = line0.trim()
    if (!line) continue
    if (isStart(line)) {
      cur = { stem: line.replace(/^\s*\**\s*\d+\s*[.、)．:]\s*/, '').replace(/\*\*/g, '').trim(), options: [], answer: null, explanation: '' }
      raw.push(cur)
      stage = 'stem'
      continue
    }
    if (!cur) continue
    if (/^-{3,}$/.test(line)) continue
    let m: RegExpMatchArray | null
    if ((m = line.match(/^[-*]\s*([A-D])[.)、]\s*(.*)$/))) {
      cur.options.push({ letter: m[1].toUpperCase(), content: m[2].replace(/\*\*/g, '').trim() })
      stage = 'options'
      continue
    }
    if ((m = line.match(/^\**\s*Answer\s*[:：]\s*\(?([A-D])/i))) { cur.answer = m[1].toUpperCase(); stage = 'answer'; continue }
    if ((m = line.match(/^\**\s*Explanation\s*[:：]\s*([\s\S]*)$/i))) { cur.explanation = m[1].replace(/\*\*/g, '').trim(); stage = 'explanation'; continue }
    const t = line.replace(/\*\*/g, '')
    if (stage === 'explanation' || stage === 'answer') cur.explanation += (cur.explanation ? '\n' : '') + t
    else if (stage === 'stem') cur.stem += '\n' + t
  }

  const out: any[] = []
  for (const q of raw) {
    const options = q.options.filter((o: any) => o.content)
    if (!q.stem || options.length < 2) continue
    if (!q.answer || !options.some((o: any) => o.letter === q.answer)) continue
    out.push({
      stem: q.stem,
      explanation: q.explanation ? `Answer: ${q.answer}. ${q.explanation}` : `Answer: ${q.answer}.`,
      difficulty: 3,
      options: options.map((o: any) => ({ content: o.content, isCorrect: o.letter === q.answer })),
    })
  }
  return out
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { text } = await request.json()
  if (!text?.trim()) return NextResponse.json({ error: '请输入题目内容' }, { status: 400 })

  const questions = parseMarkdownQuestions(text)
  if (questions.length === 0) {
    return NextResponse.json(
      { error: '快速解析没找到题目：请确认是"编号 + A/B/C/D 选项 + Answer + Explanation"的格式；否则请改用 AI 解析。' },
      { status: 400 }
    )
  }
  return NextResponse.json({ questions })
}
