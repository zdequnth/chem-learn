import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { readStoredImage, isLocalImage } from '@/lib/storage'
import OpenAI from 'openai'

export const maxDuration = 60

/**
 * Read a timetable photograph into cells.
 *
 * The model only proposes cells; the page shows a confirmation table where the
 * teacher decides which label belongs to which class. OCR of a printed table is
 * usually good, but merged cells and hand-written subject names are not, and a
 * wrong guess written straight into the calendar would be worse than no import.
 */
const PROMPT = `这是一张学校周课表的照片或截图。请把表格里每一格的内容读出来。

输出纯 JSON（不要 markdown 代码块，不要解释）：
{"cells":[{"weekday":1,"startPeriod":3,"endPeriod":4,"text":"..."}]}

规则：
- weekday：周一=1、周二=2 … 周日=7。按表头的星期几判断，不要自己推测顺序。
- startPeriod / endPeriod：节次编号 1–13。如果一格跨越两节（连堂、合并单元格，如「第3-4节」），用范围表示，例如 startPeriod=3、endPeriod=4。只有一节时两个数字相同。
- 只输出有内容的格子。空白格、午休、晚饭、晚自习说明等非课程格不要输出。
- text 原样抄写格子里出现的文字（课程名和班级名），不要翻译、不要改写、不要把多个格子合并。一格有多行时用空格连成一行。
- 看不清的格子不要猜，跳过它。`

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const imageUrl = body?.imageUrl
  if (!isLocalImage(imageUrl)) {
    return NextResponse.json({ error: '请先上传课表图片' }, { status: 400 })
  }

  const img = await readStoredImage(imageUrl)
  if (!img) return NextResponse.json({ error: '课表图片读不出来（可能已被删除）' }, { status: 400 })

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key 未配置' }, { status: 500 })

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 50_000, maxRetries: 0 })
  const dataUrl = `data:${img.contentType};base64,${img.buf.toString('base64')}`

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-flash',
      // Deterministic reading of a table; reasoning tokens count against
      // max_tokens and this task needs none of them.
      reasoning_effort: 'none',
      max_tokens: 4096,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: dataUrl } },
        ],
      }],
    })

    let raw = completion.choices[0]?.message?.content || ''
    raw = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const m = raw.match(/\{[\s\S]*\}/)
      if (!m) throw new Error('AI 没有返回有效 JSON')
      parsed = JSON.parse(m[0])
    }

    const seen = new Set<string>()
    const cells = (Array.isArray(parsed?.cells) ? parsed.cells : [])
      .map((c: any) => {
        const weekday = Number(c?.weekday)
        const startPeriod = Number(c?.startPeriod)
        const endPeriod = Number(c?.endPeriod)
        const text = String(c?.text ?? '').trim().replace(/\s+/g, ' ').slice(0, 80)
        if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return null
        if (!Number.isInteger(startPeriod) || startPeriod < 1 || startPeriod > 13) return null
        if (!Number.isInteger(endPeriod) || endPeriod < startPeriod || endPeriod > 13) return null
        if (!text) return null
        const key = `${weekday}|${startPeriod}|${endPeriod}|${text}`
        if (seen.has(key)) return null
        seen.add(key)
        return { weekday, startPeriod, endPeriod, text }
      })
      .filter(Boolean)
      .sort((a: any, b: any) => a.weekday - b.weekday || a.startPeriod - b.startPeriod)

    if (cells.length === 0) {
      return NextResponse.json({
        error: '没有识别到课程。换一张更清晰、正对表格的照片，或改用手动排课。',
      }, { status: 422 })
    }

    return NextResponse.json({ cells })
  } catch (e: any) {
    return NextResponse.json({ error: '识别失败：' + (e?.message || e) }, { status: 502 })
  }
}
