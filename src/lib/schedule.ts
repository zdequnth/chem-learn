// Shared pieces of the teacher's weekly plan: the 13 periods of the school day,
// date arithmetic on plain `YYYY-MM-DD` strings, and the row shape the API and
// the page pass around. Dates are strings on purpose — a DATE column read back
// as a timestamp would shift a day around midnight depending on timezone.

export interface PeriodTime {
  start: string
  end: string
}

export interface ScheduleSettings {
  /** 第一周周一的日期，YYYY-MM-DD */
  termStart: string
  termWeeks: number
  periods: PeriodTime[]
}

export type ScheduleKind = 'class' | 'meeting' | 'task' | 'other'
export type RepeatMode = 'once' | 'weekly'
export type MarkStatus = 'done' | 'skipped'

export interface ScheduleItem {
  id: string
  title: string
  kind: ScheduleKind
  classId: string | null
  color: string
  repeat: RepeatMode
  /** 1=周一 … 7=周日（仅 weekly） */
  weekday: number | null
  eventDate: string | null
  startPeriod: number
  endPeriod: number
  note: string
  /** 由 AI 拆解出来的步骤会挂到目标上 */
  goalId: string | null
}

export type GoalHorizon = 'week' | 'month' | 'term'
export type GoalStatus = 'open' | 'done'

export interface ScheduleGoal {
  id: string
  title: string
  note: string
  horizon: GoalHorizon
  dueDate: string | null
  status: GoalStatus
  /** 已排进计划表的步骤数 / 已完成数，由 API 计算 */
  itemCount?: number
  doneCount?: number
}

export const HORIZON_LABEL: Record<GoalHorizon, string> = {
  week: '本周',
  month: '本月',
  term: '学期',
}

export interface ScheduleMark {
  itemId: string
  date: string
  status: MarkStatus
}

export const PERIOD_COUNT = 13
/** 第 6 节是午饭午休，表格里仍占一行。 */
export const BREAK_PERIOD = 6

export const DEFAULT_PERIODS: PeriodTime[] = [
  { start: '08:00', end: '08:45' },
  { start: '08:50', end: '09:35' },
  { start: '09:45', end: '10:30' },
  { start: '10:35', end: '11:20' },
  { start: '11:30', end: '12:15' },
  { start: '12:15', end: '13:50' }, // 午饭 · 午休
  { start: '13:50', end: '14:35' },
  { start: '14:50', end: '15:35' },
  { start: '15:45', end: '16:30' },
  { start: '16:40', end: '17:30' },
  { start: '18:30', end: '19:30' }, // 晚自习一
  { start: '19:40', end: '20:30' }, // 晚自习二
  { start: '20:40', end: '21:30' }, // 晚自习三
]

export const DEFAULT_SETTINGS: ScheduleSettings = {
  termStart: '2026-08-31',
  termWeeks: 22,
  periods: DEFAULT_PERIODS,
}

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

// Four separate colour pools. Classes (what the teacher must teach) are cool
// blues/teals, personal work is warm orange/red, meetings violet, everything
// else neutral — so a glance at the grid tells you WHAT a block is, not just
// that something is booked.
export const CLASS_PALETTE = [
  '#2563eb', '#0891b2', '#0d9488', '#16a34a',
  '#0284c7', '#65a30d', '#0f766e', '#1d4ed8',
]
export const TASK_PALETTE = [
  '#ea580c', '#d97706', '#ca8a04', '#dc2626',
  '#b45309', '#e11d48', '#f59e0b',
]
export const MEETING_PALETTE = [
  '#7c3aed', '#9333ea', '#a21caf', '#6d28d9', '#c026d3',
]
export const OTHER_PALETTE = [
  '#475569', '#64748b', '#78716c', '#57534e', '#737373',
]

export const KIND_PALETTE: Record<ScheduleKind, string[]> = {
  class: CLASS_PALETTE,
  task: TASK_PALETTE,
  meeting: MEETING_PALETTE,
  other: OTHER_PALETTE,
}

export function kindPalette(kind: ScheduleKind): string[] {
  return KIND_PALETTE[kind] || TASK_PALETTE
}

export const KIND_LABEL: Record<ScheduleKind, string> = {
  class: '课程',
  meeting: '会议',
  task: '任务',
  other: '其他',
}

/** 同一个 seed 每次得到同一个颜色（用于同一个班级 / 同一个目标）。 */
export function kindColor(kind: ScheduleKind, seed: string): string {
  const palette = kindPalette(kind)
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return palette[h % palette.length]
}

/** 班级永远取「课程」色池，不会和任务/会议的颜色撞。 */
export function classColor(classId: string): string {
  return kindColor('class', classId)
}

const SUBJECT_WORDS = new Set(['化学', '物理', '数学', '英语', '语文', '生物', '历史', '地理', '政治'])

/** A timetable cell is often "课程/班级/老师/教室/时间" on separate lines. */
function cleanParts(text: string): string[] {
  return text
    .split(/[\/|｜]/)
    .map(s => s.trim())
    .filter(Boolean)
    // 08:00-08:40 / 13:50~14:35
    .filter(p => !/^\d{1,2}:\d{2}\s*[-–—~]\s*\d{1,2}:\d{2}$/.test(p))
    // room codes such as A116 or B-205
    .filter(p => !/^[A-Za-z]{0,3}[-]?\d{1,4}$/.test(p))
}

/**
 * The title to show for a cell. Class-matched entries use the class name
 * instead; this is for everything else (self-study, clubs, competitions).
 */
export function cleanTimetableLabel(text: string): string {
  const parts = cleanParts(text)
  if (!parts.length) return text.trim().replace(/\s+/g, ' ').slice(0, 60)
  const first = parts[0]
  // "化学 /AP Chemistry-1班" — keep both, or "化学" alone says nothing.
  const label = SUBJECT_WORDS.has(first) && parts[1] ? `${first} ${parts[1]}` : first
  return label.replace(/\s+/g, ' ').trim().slice(0, 60)
}

function normaliseName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/[\s\-_·.,，。、/\\|:：]/g, '')
    .replace(/[０-９ａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
}

function bigrams(value: string): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i < value.length - 1; i++) out.add(value.slice(i, i + 2))
  return out
}

/**
 * Distinctive tokens: "A-2", "G9", "AP". The timetable writes "A-2班" while a
 * class name may write "化学A-2班", so spaces and CJK are both boundaries.
 */
function matchTokens(text: string): Set<string> {
  const lower = text.toLowerCase()
  const out = new Set<string>()
  for (const m of lower.matchAll(/(?:^|[^a-z0-9])([a-z]{1,3})\s*[-–—]?\s*(\d{1,4})/g)) {
    out.add(m[1] + m[2])
  }
  for (const m of lower.matchAll(/[a-z]{2,}/g)) out.add(m[0])
  return out
}

/**
 * Match a timetable cell to one of the teacher's classes.
 *
 * Cells look like "化学A/Chemistry A-2班/郑德群/A116/08:00-08:40", so exact
 * containment alone fails. Two signals are combined: how much of the class
 * name's character pairs appear in the cell, and whether a distinctive code
 * ("A-2", "G9", "AP") is shared. A match must be strong AND clearly ahead of
 * the runner-up — ambiguous cells are left unmatched rather than guessed.
 */
export function matchClassName(label: string, classes: { id: string; name: string }[]): string | null {
  const cleaned = cleanParts(label).join(' ')
  const L = normaliseName(cleaned)
  if (!L) return null
  const lb = bigrams(L)
  const labelTokens = matchTokens(cleaned)

  let bestId: string | null = null
  let best = 0
  let second = 0

  for (const c of classes) {
    const C = normaliseName(c.name)
    if (!C) continue
    let score = 0

    if (C.includes(L) || L.includes(C)) {
      score = 1
    } else {
      const cb = bigrams(C)
      if (cb.size) {
        let hit = 0
        for (const g of cb) if (lb.has(g)) hit++
        score = hit / cb.size
      }
      for (const token of matchTokens(c.name)) {
        if (labelTokens.has(token)) {
          score = Math.max(score, 0.9)
          break
        }
      }
    }

    if (score > best) {
      second = best
      best = score
      bestId = c.id
    } else if (score > second) {
      second = score
    }
  }

  return best >= 0.5 && best >= second + 0.1 ? bestId : null
}

export function ymd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isDateString(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return ymd(parseYmd(value)) === value
}

export function addDays(date: string, n: number): string {
  const d = parseYmd(date)
  d.setDate(d.getDate() + n)
  return ymd(d)
}

/** 该日期所在周的周一。 */
export function startOfWeek(date: string): string {
  const d = parseYmd(date)
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return ymd(d)
}

/** 1=周一 … 7=周日 */
export function isoWeekday(date: string): number {
  return ((parseYmd(date).getDay() + 6) % 7) + 1
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseYmd(to).getTime() - parseYmd(from).getTime()) / 86400000)
}

export function monthDay(date: string): string {
  const d = parseYmd(date)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export function occursOn(item: ScheduleItem, date: string): boolean {
  return item.repeat === 'once' ? item.eventDate === date : item.weekday === isoWeekday(date)
}

export function markKey(itemId: string, date: string): string {
  return `${itemId}|${date}`
}

export function rowToItem(r: any): ScheduleItem {
  return {
    id: r.id,
    title: r.title,
    kind: r.kind,
    classId: r.class_id ?? null,
    color: r.color,
    repeat: r.repeat,
    weekday: r.weekday ?? null,
    eventDate: r.event_date ?? null,
    startPeriod: r.start_period,
    endPeriod: r.end_period,
    note: r.note ?? '',
    goalId: r.goal_id ?? null,
  }
}

export function rowToGoal(r: any): ScheduleGoal {
  const horizon: GoalHorizon = r.horizon === 'month' || r.horizon === 'term' ? r.horizon : 'week'
  return {
    id: r.id,
    title: r.title,
    note: r.note ?? '',
    horizon,
    dueDate: r.due_date ?? null,
    status: r.status === 'done' ? 'done' : 'open',
  }
}

export interface GoalInput {
  title: string
  note: string
  horizon: GoalHorizon
  dueDate: string | null
}

export function parseGoalInput(body: any): { input?: GoalInput; error?: string } {
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) return { error: '请填写目标' }
  const horizon: GoalHorizon =
    body?.horizon === 'month' || body?.horizon === 'term' ? body.horizon : 'week'
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : ''
  if (body?.dueDate != null && body.dueDate !== '' && !isDateString(body.dueDate)) {
    return { error: '截止日期不正确' }
  }
  const dueDate = isDateString(body?.dueDate) ? body.dueDate : null
  return { input: { title, note, horizon, dueDate } }
}

export interface ItemInput {
  title: string
  kind: ScheduleKind
  classId: string | null
  color: string
  repeat: RepeatMode
  weekday: number | null
  eventDate: string | null
  startPeriod: number
  endPeriod: number
  note: string
}

const KINDS: ScheduleKind[] = ['class', 'meeting', 'task', 'other']

/** 服务端和客户端共用的一份校验，避免两边对“什么算合法”理解不一致。 */
export function parseItemInput(body: any): { input?: ItemInput; error?: string } {
  const title = typeof body?.title === 'string' ? body.title.trim().slice(0, 200) : ''
  if (!title) return { error: '请填写标题' }

  const kind: ScheduleKind = KINDS.includes(body?.kind) ? body.kind : 'task'
  const repeat: RepeatMode = body?.repeat === 'once' ? 'once' : 'weekly'
  const startPeriod = Number(body?.startPeriod)
  const endPeriod = Number(body?.endPeriod)
  if (!Number.isInteger(startPeriod) || startPeriod < 1 || startPeriod > PERIOD_COUNT) {
    return { error: '开始节次不正确' }
  }
  if (!Number.isInteger(endPeriod) || endPeriod < startPeriod || endPeriod > PERIOD_COUNT) {
    return { error: '结束节次不正确' }
  }

  let weekday: number | null = null
  let eventDate: string | null = null
  if (repeat === 'weekly') {
    weekday = Number(body?.weekday)
    if (!Number.isInteger(weekday) || weekday < 1 || weekday > 7) return { error: '星期不正确' }
  } else {
    if (!isDateString(body?.eventDate)) return { error: '日期不正确' }
    eventDate = body.eventDate
  }

  const color = typeof body?.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)
    ? body.color.toLowerCase()
    : kindPalette(kind)[0]
  const classId = typeof body?.classId === 'string' && body.classId ? body.classId : null
  const note = typeof body?.note === 'string' ? body.note.slice(0, 2000) : ''

  return { input: { title, kind, classId, color, repeat, weekday, eventDate, startPeriod, endPeriod, note } }
}

export function parseSettingsInput(body: any): { settings?: ScheduleSettings; error?: string } {
  if (!isDateString(body?.termStart)) return { error: '学期起始日不正确' }
  const termWeeks = Number(body?.termWeeks)
  if (!Number.isInteger(termWeeks) || termWeeks < 1 || termWeeks > 60) {
    return { error: '学期周数需在 1–60 之间' }
  }
  const raw = body?.periods
  if (!Array.isArray(raw) || raw.length !== PERIOD_COUNT) return { error: '需要 13 个节次' }
  const periods: PeriodTime[] = []
  for (const p of raw) {
    const start = typeof p?.start === 'string' ? p.start : ''
    const end = typeof p?.end === 'string' ? p.end : ''
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end)) {
      return { error: '节次时间格式应为 HH:MM' }
    }
    periods.push({ start, end })
  }
  return { settings: { termStart: body.termStart, termWeeks, periods } }
}
