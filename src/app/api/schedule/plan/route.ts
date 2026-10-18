import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  BREAK_PERIOD, DEFAULT_SETTINGS, HORIZON_LABEL, addDays, diffDays, isDateString,
  isoWeekday, occursOn, rowToGoal, rowToItem, startOfWeek, ymd, WEEKDAY_NAMES,
  type ScheduleItem, type ScheduleSettings,
} from '@/lib/schedule'

export const maxDuration = 60

const ITEM_FIELDS = 'id,title,kind,class_id,color,repeat,weekday,event_date,start_period,end_period,note,goal_id'

type Step = { date: string; startPeriod: number; endPeriod: number; title: string }

function compressPeriods(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b)
  const out: string[] = []
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i]
    let end = start
    while (i + 1 < sorted.length && sorted[i + 1] === end + 1) {
      end = sorted[++i]
    }
    out.push(start === end ? String(start) : `${start}-${end}`)
  }
  return out.join('、')
}

/**
 * Propose a schedule for one goal. The model never writes: the page shows the
 * steps and the teacher accepts the ones they want. Every returned date/slot is
 * re-checked against the real calendar here, because the model does not know
 * about a meeting the teacher added five minutes ago.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const goalId = typeof body?.goalId === 'string' ? body.goalId : ''
  if (!goalId) return NextResponse.json({ error: '缺少目标' }, { status: 400 })
  const today = isDateString(body?.today) ? body.today : ymd(new Date())

  const { data: goalRows } = await supabaseAdmin('schedule_goals', {
    query: `?id=eq.${goalId}&teacher_id=eq.${user.id}&select=*`,
  })
  if (!goalRows?.length) return NextResponse.json({ error: '目标不存在' }, { status: 404 })
  const goal = rowToGoal(goalRows[0])

  const { data: settingRows } = await supabaseAdmin('schedule_settings', {
    query: `?teacher_id=eq.${user.id}&select=term_start,term_weeks,periods`,
  })
  const s = settingRows?.[0]
  const settings: ScheduleSettings = s
    ? { termStart: s.term_start, termWeeks: s.term_weeks, periods: s.periods }
    : DEFAULT_SETTINGS

  const { data: itemRows } = await supabaseAdmin('schedule_items', {
    query: `?teacher_id=eq.${user.id}&select=${ITEM_FIELDS}`,
  })
  const items: ScheduleItem[] = (itemRows || []).map(rowToItem)

  const weekStart = startOfWeek(today)

  let end = goal.dueDate && goal.dueDate >= today
    ? goal.dueDate
    : goal.horizon === 'week'
      ? addDays(weekStart, 6)
      : goal.horizon === 'month'
        ? addDays(weekStart, 27)
        : addDays(settings.termStart, settings.termWeeks * 7 - 1)

  // A term goal can otherwise turn into a 22-week, 60-step list. The cap keeps
  // the prompt (and the teacher's confirmation screen) usable.
  const maxWeeks = 16
  const maxEnd = addDays(weekStart, maxWeeks * 7 - 1)
  if (end > maxEnd) end = maxEnd
  if (end < today) end = addDays(weekStart, 6)
  const weekCount = Math.max(1, Math.ceil((diffDays(weekStart, end) + 1) / 7))

  // Recurring classes occupy the same periods every week.
  const busyLines: string[] = []
  for (let d = 1; d <= 7; d++) {
    const occupied = new Set<number>()
    const names: string[] = []
    for (const it of items) {
      if (it.repeat !== 'weekly' || it.weekday !== d) continue
      for (let p = it.startPeriod; p <= it.endPeriod; p++) occupied.add(p)
      names.push(`${it.title}（第 ${it.startPeriod}${it.endPeriod !== it.startPeriod ? `-${it.endPeriod}` : ''} 节）`)
    }
    const free = Array.from({ length: 13 }, (_, i) => i + 1)
      .filter(p => p !== BREAK_PERIOD && !occupied.has(p))
    busyLines.push(
      names.length
        ? `${WEEKDAY_NAMES[d - 1]}：固定占用 ${names.join('、')}；空闲节次 ${compressPeriods(free) || '无'}`
        : `${WEEKDAY_NAMES[d - 1]}：没有固定安排；空闲节次 ${compressPeriods(free)}`,
    )
  }

  const oneOffs = items
    .filter(it => it.repeat === 'once' && it.eventDate && it.eventDate >= today && it.eventDate <= end)
    .sort((a, b) => String(a.eventDate).localeCompare(String(b.eventDate)))
    .slice(0, 40)
  const oneOffLines = oneOffs.map(it =>
    `${it.eventDate} ${WEEKDAY_NAMES[isoWeekday(it.eventDate!) - 1]} 第 ${it.startPeriod}${it.endPeriod !== it.startPeriod ? `-${it.endPeriod}` : ''} 节：${it.title}`)

  const existingSteps = items.filter(it => it.goalId === goal.id)
  const existingLines = existingSteps.map(it =>
    it.repeat === 'once'
      ? `${it.eventDate} 第 ${it.startPeriod}${it.endPeriod !== it.startPeriod ? `-${it.endPeriod}` : ''} 节：${it.title}`
      : `每周${WEEKDAY_NAMES[(it.weekday || 1) - 1]} 第 ${it.startPeriod}${it.endPeriod !== it.startPeriod ? `-${it.endPeriod}` : ''} 节：${it.title}`)

  const weekLines: string[] = []
  for (let w = 0; w < weekCount; w++) {
    const ws = addDays(weekStart, w * 7)
    const we = addDays(ws, 6)
    weekLines.push(`第 ${w + 1} 周：${ws} ~ ${we}`)
  }

  const target = goal.horizon === 'week' ? 6 : goal.horizon === 'month' ? 12 : 16

  const prompt = `你是一位中学老师的工作计划助手。请把一个目标拆成具体、可执行的小步骤，并安排到老师日历的空档里。

【目标】${goal.title}
${goal.note ? `【补充说明】${goal.note}` : ''}
【规划周期】${HORIZON_LABEL[goal.horizon]}${goal.dueDate ? `，截止 ${goal.dueDate}` : ''}
【今天】${today}
【可安排日期】${today} 到 ${end}，共 ${weekCount} 周。更早或更晚的日期都不要用。
${weekLines.join('\n')}

【每周固定占用的节次（这些时段已有课，不能占用）】
${busyLines.join('\n')}
注意：第 ${BREAK_PERIOD} 节是午饭午休，任何日子都不可安排。

【这些日期另有临时安排（同样不要占用）】
${oneOffLines.length ? oneOffLines.join('\n') : '（无）'}

【这个目标已经排过的步骤（不要重复安排）】
${existingLines.length ? existingLines.join('\n') : '（无）'}

【拆解要求】
1. 拆成 3 到 ${target} 个步骤。每个步骤要具体、可执行，例如「整理第 3 章习题并挑 10 道易错题重做」，不要写「继续推进」「复习一下」这种空话。
2. 每个步骤占用连续 1–2 节课，必须落在上面没有固定占用、也不在第 ${BREAK_PERIOD} 节的空闲节次里。
3. 尽量安排在工作日（周一至周五）。任务确实多时可以用周末。
4. 按截止日期把步骤均匀铺开：不要全塞在本周，也不要拖到最后一周才动。
5. 同一天最多 2 个步骤、合计不超过 3 节；给老师留出机动时间。
6. date 必须是 YYYY-MM-DD，且落在【可安排日期】范围内。

只输出纯 JSON（不要 markdown 代码块，不要任何解释）：
{"steps":[{"date":"${today}","startPeriod":3,"endPeriod":4,"title":"..."}]}`

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'DeepSeek API key 未配置' }, { status: 500 })

  const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 50_000, maxRetries: 0 })

  try {
    const completion = await client.chat.completions.create({
      model: 'deepseek-flash',
      reasoning_effort: 'none',
      max_tokens: 4096,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
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

    const proposed = (Array.isArray(parsed?.steps) ? parsed.steps : [])
    const accepted: Step[] = []
    let dropped = 0

    const overlaps = (date: string, a: number, b: number, extra: Step[]) =>
      items.some(it => occursOn(it, date) && it.startPeriod <= b && it.endPeriod >= a)
      || extra.some(st => st.date === date && st.startPeriod <= b && st.endPeriod >= a)

    for (const rawStep of proposed) {
      const date = typeof rawStep?.date === 'string' ? rawStep.date : ''
      const startPeriod = Number(rawStep?.startPeriod)
      const endPeriod = Number(rawStep?.endPeriod)
      const title = String(rawStep?.title ?? '').trim().slice(0, 120)

      const valid =
        isDateString(date) && date >= today && date <= end
        && Number.isInteger(startPeriod) && startPeriod >= 1 && startPeriod <= 13
        && Number.isInteger(endPeriod) && endPeriod >= startPeriod && endPeriod <= 13
        && !(startPeriod <= BREAK_PERIOD && endPeriod >= BREAK_PERIOD)
        && title.length > 0
        && !overlaps(date, startPeriod, endPeriod, accepted)

      if (!valid) {
        dropped++
        continue
      }
      accepted.push({ date, startPeriod, endPeriod, title })
      if (accepted.length >= 24) break
    }

    accepted.sort((a, b) => a.date.localeCompare(b.date) || a.startPeriod - b.startPeriod)
    return NextResponse.json({ steps: accepted, dropped, window: { from: today, to: end } })
  } catch (e: any) {
    return NextResponse.json({ error: 'AI 拆解失败：' + (e?.message || e) }, { status: 502 })
  }
}
