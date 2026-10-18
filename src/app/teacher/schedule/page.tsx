'use client'

import { useCallback, useEffect, useMemo, useRef, useState, Fragment } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import {
  CalendarDays, Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, Plus,
  Settings2, SkipForward, Sparkles, Square, Target, Trash2, X,
} from 'lucide-react'
import {
  BREAK_PERIOD, DEFAULT_SETTINGS, HORIZON_LABEL, KIND_LABEL, PALETTE, WEEKDAY_NAMES,
  addDays, classColor, diffDays, isDateString, isoWeekday, markKey, monthDay,
  occursOn, parseYmd, startOfWeek, ymd,
  type GoalHorizon, type MarkStatus, type RepeatMode, type ScheduleGoal,
  type ScheduleItem, type ScheduleKind, type ScheduleSettings,
} from '@/lib/schedule'
import { shrinkImageFile } from '@/lib/shrink-image-file'

type Editor = {
  id?: string
  /** 点击的那一天：weekly 用来“跳过这一次”，once 用来改日期 */
  occurrenceDate: string
  weekday: number
  eventDate: string
  start: number
  end: number
  title: string
  kind: ScheduleKind
  classId: string
  color: string
  repeat: RepeatMode
  note: string
}

const KINDS: ScheduleKind[] = ['class', 'meeting', 'task', 'other']

type TimetableCell = { weekday: number; startPeriod: number; endPeriod: number; text: string }
type PlanStep = { date: string; startPeriod: number; endPeriod: number; title: string }
type GoalForm = { title: string; horizon: GoalHorizon; dueDate: string; note: string }

function dateLabel(date: string): string {
  const d = parseYmd(date)
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
}

export default function SchedulePage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  const [weekStart, setWeekStart] = useState('')
  const [now, setNow] = useState<Date | null>(null)
  const [settings, setSettings] = useState<ScheduleSettings>(DEFAULT_SETTINGS)
  const [items, setItems] = useState<ScheduleItem[]>([])
  const [marks, setMarks] = useState<Record<string, MarkStatus>>({})
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [saving, setSaving] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [draft, setDraft] = useState<ScheduleSettings | null>(null)

  const [importOpen, setImportOpen] = useState(false)
  const [importBusy, setImportBusy] = useState(false)
  const [importSaving, setImportSaving] = useState(false)
  const [importError, setImportError] = useState('')
  const [importCells, setImportCells] = useState<TimetableCell[] | null>(null)
  const [importTargets, setImportTargets] = useState<Record<string, string>>({})
  const [importTitles, setImportTitles] = useState<Record<string, string>>({})

  const [goalsOpen, setGoalsOpen] = useState(false)
  const [goals, setGoals] = useState<ScheduleGoal[]>([])
  const [goalsLoading, setGoalsLoading] = useState(false)
  const [goalForm, setGoalForm] = useState<GoalForm | null>(null)
  const [goalBusy, setGoalBusy] = useState(false)
  const [planGoal, setPlanGoal] = useState<ScheduleGoal | null>(null)
  const [planSteps, setPlanSteps] = useState<PlanStep[] | null>(null)
  const [planDropped, setPlanDropped] = useState(0)
  const [planChecked, setPlanChecked] = useState<Record<number, boolean>>({})
  const [planBusy, setPlanBusy] = useState(false)

  const [dragSel, setDragSel] = useState<{ day: number; from: number; to: number } | null>(null)
  const dragRef = useRef<{ day: number; anchor: number } | null>(null)
  const dragSelRef = useRef(dragSel)
  // A touch has no hover, so drag-select is mouse-only. A tap still creates —
  // but only if the finger did not travel (that gesture was a scroll).
  const touchStartRef = useRef<{ x: number; y: number; date: string; period: number } | null>(null)

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  // "Today" is computed only after mount: rendering it on the server would use
  // the server's clock/timezone and disagree with the browser on hydration.
  useEffect(() => {
    const tick = () => {
      const d = new Date()
      setNow(d)
      setWeekStart(w => w || startOfWeek(ymd(d)))
    }
    tick()
    const id = setInterval(tick, 30000)
    return () => clearInterval(id)
  }, [])

  const load = useCallback(async (week: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/schedule?week=${week}`)
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || '计划表加载失败')
        return
      }
      setSettings(json.settings || DEFAULT_SETTINGS)
      setItems(json.items || [])
      const next: Record<string, MarkStatus> = {}
      for (const m of json.marks || []) next[markKey(m.itemId, m.date)] = m.status
      setMarks(next)
    } catch (e: any) {
      alert('计划表加载失败：' + e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (weekStart) load(weekStart)
  }, [weekStart, load])

  useEffect(() => {
    fetch('/api/classes')
      .then(r => r.json())
      .then(j => setClasses(j.classes || []))
      .catch(() => {})
  }, [])

  const days = useMemo(
    () => (weekStart ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : []),
    [weekStart],
  )
  const today = now ? ymd(now) : ''
  const classById = useMemo(() => new Map(classes.map(c => [c.id, c])), [classes])

  const weekNo = useMemo(() => {
    if (!weekStart) return null
    return Math.floor(diffDays(settings.termStart, weekStart) / 7) + 1
  }, [weekStart, settings.termStart])

  const openCreate = useCallback((date: string, start: number, end: number) => {
    setEditor({
      occurrenceDate: date,
      weekday: isoWeekday(date),
      eventDate: date,
      start,
      end,
      title: '',
      kind: 'task',
      classId: '',
      color: PALETTE[0],
      repeat: 'weekly',
      note: '',
    })
  }, [])

  const openEdit = (item: ScheduleItem, date: string) => {
    setEditor({
      id: item.id,
      occurrenceDate: date,
      weekday: item.weekday ?? isoWeekday(date),
      eventDate: item.eventDate ?? date,
      start: item.startPeriod,
      end: item.endPeriod,
      title: item.title,
      kind: item.kind,
      classId: item.classId ?? '',
      color: item.color,
      repeat: item.repeat,
      note: item.note,
    })
  }

  useEffect(() => { dragSelRef.current = dragSel }, [dragSel])

  // A press-drag-release anywhere on the grid becomes one time unit. Releasing
  // outside the grid still counts, which is what every calendar does.
  useEffect(() => {
    const up = (e: PointerEvent) => {
      const started = dragRef.current
      const sel = dragSelRef.current
      dragRef.current = null
      setDragSel(null)

      const touch = touchStartRef.current
      touchStartRef.current = null
      if (touch) {
        const moved = Math.abs(e.clientX - touch.x) + Math.abs(e.clientY - touch.y)
        if (moved < 12) openCreate(touch.date, touch.period, touch.period)
        return
      }

      const date = sel ? days[sel.day - 1] : null
      if (started && sel && date) openCreate(date, sel.from, sel.to)
    }
    const cancel = () => {
      dragRef.current = null
      touchStartRef.current = null
      setDragSel(null)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
    }
  }, [days, openCreate])

  const cellPointerDown = (
    e: React.PointerEvent, day: number, period: number, date: string, occupied: boolean,
  ) => {
    if (occupied) return
    if (e.pointerType !== 'mouse') {
      touchStartRef.current = { x: e.clientX, y: e.clientY, date, period }
      return
    }
    dragRef.current = { day, anchor: period }
    setDragSel({ day, from: period, to: period })
  }

  const cellPointerEnter = (day: number, period: number) => {
    const started = dragRef.current
    if (!started || started.day !== day) return
    setDragSel({ day, from: Math.min(started.anchor, period), to: Math.max(started.anchor, period) })
  }

  const itemsFor = (date: string) =>
    items
      .filter(it => occursOn(it, date) && marks[markKey(it.id, date)] !== 'skipped')
      .sort((a, b) => a.startPeriod - b.startPeriod || a.endPeriod - b.endPeriod)

  // Overlaps are allowed only after a confirmation; give them side-by-side lanes.
  const layoutFor = (date: string) => {
    const list = itemsFor(date)
    const lane: Record<string, number> = {}
    const laneEnd: number[] = []
    for (const it of list) {
      let k = laneEnd.findIndex(end => end < it.startPeriod)
      if (k === -1) {
        k = laneEnd.length
        laneEnd.push(it.endPeriod)
      } else {
        laneEnd[k] = it.endPeriod
      }
      lane[it.id] = k
    }
    return { list, lane, lanes: Math.max(1, laneEnd.length) }
  }

  const occupiedAt = (date: string, period: number) =>
    items.some(it =>
      occursOn(it, date)
      && marks[markKey(it.id, date)] !== 'skipped'
      && period >= it.startPeriod && period <= it.endPeriod
    )

  const isPast = (date: string, period: number) => {
    if (!now) return false
    const p = settings.periods[period - 1]
    if (!p) return false
    const end = parseYmd(date)
    const [h, m] = p.end.split(':').map(Number)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return false
    end.setHours(h, m, 0, 0)
    return end.getTime() <= now.getTime()
  }

  const findConflict = (e: Editor): ScheduleItem | null => {
    const dates = e.repeat === 'once'
      ? [e.eventDate]
      : days.filter(d => isoWeekday(d) === e.weekday)
    for (const date of dates) {
      for (const it of items) {
        if (it.id === e.id) continue
        if (!occursOn(it, date)) continue
        if (marks[markKey(it.id, date)] === 'skipped') continue
        if (it.startPeriod <= e.end && it.endPeriod >= e.start) return it
      }
    }
    return null
  }

  const save = async () => {
    if (!editor || saving) return
    const title = editor.title.trim()
    if (!title) return alert('请填写标题')
    if (editor.repeat === 'once' && !isDateString(editor.eventDate)) return alert('请选择日期')

    const conflict = findConflict({ ...editor, title })
    if (conflict && !confirm(`这个时段已经有「${conflict.title}」了，仍然保存吗？`)) return

    const payload = {
      title,
      kind: editor.kind,
      classId: editor.classId || null,
      color: editor.color,
      repeat: editor.repeat,
      weekday: editor.repeat === 'weekly' ? editor.weekday : null,
      eventDate: editor.repeat === 'once' ? editor.eventDate : null,
      startPeriod: editor.start,
      endPeriod: editor.end,
      note: editor.note,
    }

    setSaving(true)
    try {
      const res = await fetch(editor.id ? `/api/schedule/${editor.id}` : '/api/schedule', {
        method: editor.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '保存失败')
      setEditor(null)
      await load(weekStart)
    } catch (e: any) {
      alert('保存失败：' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const setMark = async (itemId: string, date: string, status: MarkStatus | 'none') => {
    try {
      const res = await fetch('/api/schedule/marks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, date, status }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '操作失败')
      setMarks(prev => {
        const next = { ...prev }
        const key = markKey(itemId, date)
        if (status === 'none') delete next[key]
        else next[key] = status
        return next
      })
    } catch (e: any) {
      alert('操作失败：' + e.message)
    }
  }

  const skipOccurrence = async () => {
    if (!editor?.id) return
    await setMark(editor.id, editor.occurrenceDate, 'skipped')
    setEditor(null)
  }

  const deleteSeries = async () => {
    if (!editor?.id) return
    if (!confirm('删除整个系列？以后每周的这次安排都会一起删除。')) return
    try {
      const res = await fetch(`/api/schedule/${editor.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '删除失败')
      setEditor(null)
      await load(weekStart)
    } catch (e: any) {
      alert('删除失败：' + e.message)
    }
  }

  const openSettings = () => {
    setDraft({
      termStart: settings.termStart,
      termWeeks: settings.termWeeks,
      periods: settings.periods.map(p => ({ ...p })),
    })
    setSettingsOpen(true)
  }

  const saveSettings = async () => {
    if (!draft || saving) return
    if (draft.periods.some(p => !p.start || !p.end)) return alert('请填写完整的节次时间')
    setSaving(true)
    try {
      const res = await fetch('/api/schedule/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '保存失败')
      setSettings(json.settings)
      setSettingsOpen(false)
    } catch (e: any) {
      alert('保存失败：' + e.message)
    } finally {
      setSaving(false)
    }
  }

  const importLabels = useMemo(() => {
    if (!importCells) return []
    const counts = new Map<string, number>()
    for (const c of importCells) counts.set(c.text, (counts.get(c.text) || 0) + 1)
    return [...counts.entries()].map(([text, count]) => ({ text, count }))
  }, [importCells])

  const resetImport = () => {
    setImportCells(null)
    setImportError('')
    setImportTargets({})
    setImportTitles({})
    setImportBusy(false)
    setImportSaving(false)
  }

  const handleTimetableFile = async (file: File) => {
    setImportBusy(true)
    setImportError('')
    setImportCells(null)
    try {
      const toSend = await shrinkImageFile(file)
      const fd = new FormData()
      fd.append('file', toSend)
      const up = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const uj = await up.json().catch(() => ({}))
      if (!up.ok || !uj.url) throw new Error(uj.error || '图片上传失败')

      const res = await fetch('/api/schedule/parse-timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: uj.url }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || '识别失败')

      const cells: TimetableCell[] = Array.isArray(json.cells) ? json.cells : []
      if (!cells.length) throw new Error('没有识别到课程')
      setImportCells(cells)
      const targets: Record<string, string> = {}
      const titles: Record<string, string> = {}
      for (const c of cells) {
        targets[c.text] = 'task'
        titles[c.text] = c.text
      }
      setImportTargets(targets)
      setImportTitles(titles)
    } catch (e: any) {
      setImportError(e.message || '识别失败')
    } finally {
      setImportBusy(false)
    }
  }

  const confirmImport = async () => {
    if (!importCells || importSaving) return
    const colorByLabel = new Map(importLabels.map((l, i) => [l.text, PALETTE[i % PALETTE.length]]))
    const itemsToCreate = importCells.map(c => {
      const target = importTargets[c.text] ?? 'task'
      if (!target) return null
      const title = (importTitles[c.text] || c.text).trim()
      if (!title) return null
      const isClass = target.startsWith('class:')
      const classId = isClass ? target.slice('class:'.length) : null
      return {
        title,
        kind: (isClass ? 'class' : target) as ScheduleKind,
        classId,
        color: classId ? classColor(classId) : (colorByLabel.get(c.text) || PALETTE[0]),
        repeat: 'weekly' as const,
        weekday: c.weekday,
        eventDate: null,
        startPeriod: c.startPeriod,
        endPeriod: c.endPeriod,
        note: '从课表照片导入',
      }
    }).filter(Boolean)

    if (!itemsToCreate.length) return alert('没有选择要导入的课程')

    setImportSaving(true)
    try {
      const res = await fetch('/api/schedule/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToCreate }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '导入失败')
      setImportOpen(false)
      resetImport()
      await load(weekStart)
      alert(`已导入 ${json.items?.length ?? itemsToCreate.length} 个时段`)
    } catch (e: any) {
      alert('导入失败：' + e.message)
    } finally {
      setImportSaving(false)
    }
  }

  const loadGoals = async () => {
    setGoalsLoading(true)
    try {
      const res = await fetch('/api/schedule/goals')
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '目标加载失败')
      setGoals(json.goals || [])
    } catch (e: any) {
      alert('目标加载失败：' + e.message)
    } finally {
      setGoalsLoading(false)
    }
  }

  const defaultDue = (horizon: GoalHorizon) =>
    horizon === 'week' ? addDays(weekStart, 6)
      : horizon === 'month' ? addDays(weekStart, 27)
        : addDays(settings.termStart, settings.termWeeks * 7 - 1)

  const createGoal = async () => {
    if (!goalForm || goalBusy) return
    if (!goalForm.title.trim()) return alert('请填写目标')
    setGoalBusy(true)
    try {
      const res = await fetch('/api/schedule/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(goalForm),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '保存失败')
      setGoalForm(null)
      await loadGoals()
    } catch (e: any) {
      alert('保存失败：' + e.message)
    } finally {
      setGoalBusy(false)
    }
  }

  const patchGoal = async (goal: ScheduleGoal, patch: any) => {
    try {
      const res = await fetch(`/api/schedule/goals/${goal.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '操作失败')
      await loadGoals()
    } catch (e: any) {
      alert('操作失败：' + e.message)
    }
  }

  const deleteGoal = async (goal: ScheduleGoal) => {
    if (!confirm(`删除目标「${goal.title}」？已经排进计划表的步骤会保留。`)) return
    try {
      const res = await fetch(`/api/schedule/goals/${goal.id}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '删除失败')
      if (planGoal?.id === goal.id) {
        setPlanGoal(null)
        setPlanSteps(null)
      }
      await loadGoals()
    } catch (e: any) {
      alert('删除失败：' + e.message)
    }
  }

  const runPlan = async (goal: ScheduleGoal) => {
    setPlanGoal(goal)
    setPlanSteps(null)
    setPlanDropped(0)
    setPlanChecked({})
    setPlanBusy(true)
    try {
      const res = await fetch('/api/schedule/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ goalId: goal.id, today: today || ymd(new Date()) }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(json.error || 'AI 拆解失败')
        setPlanGoal(null)
        return
      }
      const steps: PlanStep[] = Array.isArray(json.steps) ? json.steps : []
      setPlanSteps(steps)
      setPlanDropped(Number(json.dropped) || 0)
      setPlanChecked(Object.fromEntries(steps.map((_, i) => [i, true])))
      if (!steps.length) {
        alert('AI 没有给出可用安排。可以在目标里补充说明，或先清理一下日程再试。')
      }
    } catch (e: any) {
      alert('AI 拆解失败：' + e.message)
      setPlanGoal(null)
    } finally {
      setPlanBusy(false)
    }
  }

  const acceptPlan = async () => {
    if (!planGoal || !planSteps || planBusy) return
    const chosen = planSteps.filter((_, i) => planChecked[i] !== false)
    if (!chosen.length) return alert('请至少勾选一个步骤')

    setPlanBusy(true)
    try {
      const res = await fetch('/api/schedule/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goalId: planGoal.id,
          items: chosen.map(s => ({
            title: s.title,
            kind: 'task',
            classId: null,
            color: classColor(planGoal.id),
            repeat: 'once',
            eventDate: s.date,
            startPeriod: s.startPeriod,
            endPeriod: s.endPeriod,
            note: 'AI 拆解',
          })),
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return alert(json.error || '加入计划表失败')
      setPlanGoal(null)
      setPlanSteps(null)
      await load(weekStart)
      await loadGoals()
      alert(`已把 ${json.items?.length ?? chosen.length} 个步骤加入计划表`)
    } catch (e: any) {
      alert('加入计划表失败：' + e.message)
    } finally {
      setPlanBusy(false)
    }
  }

  const periodRange = (start: number, end: number) => {
    const a = settings.periods[start - 1]?.start || ''
    const b = settings.periods[end - 1]?.end || ''
    return a && b ? `${a} – ${b}` : ''
  }

  if (authLoading || !weekStart) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-3 pt-24 pb-10">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-emerald-600" /> 计划表
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {days.length ? `${dateLabel(days[0])} – ${dateLabel(days[6])}` : ''}
              {weekNo !== null && (
                <span className={`ml-2 px-2 py-0.5 rounded-full text-xs ${weekNo >= 1 && weekNo <= settings.termWeeks ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                  {weekNo < 1 ? '学期前' : `第 ${weekNo} 周`}
                  {weekNo > settings.termWeeks ? '（学期已结束）' : ''}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              拖动可选连续几节 · 点空白新建 · 点事件编辑 · 勾选即完成
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border bg-white">
              <button onClick={() => setWeekStart(addDays(weekStart, -7))} title="上一周"
                className="p-2 hover:bg-gray-100 rounded-l-lg"><ChevronLeft className="w-4 h-4" /></button>
              <button onClick={() => now && setWeekStart(startOfWeek(ymd(now)))}
                className="px-3 py-2 text-sm hover:bg-gray-100 border-x">回到本周</button>
              <button onClick={() => setWeekStart(addDays(weekStart, 7))} title="下一周"
                className="p-2 hover:bg-gray-100 rounded-r-lg"><ChevronRight className="w-4 h-4" /></button>
            </div>
            <button
              onClick={() => {
                const date = now && days.includes(ymd(now)) ? ymd(now) : days[0]
                openCreate(date, 1, 1)
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600">
              <Plus className="w-4 h-4" /> 新建
            </button>
            <button
              onClick={() => { resetImport(); setImportOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-2 border bg-white rounded-lg text-sm hover:bg-gray-50">
              <ImagePlus className="w-4 h-4" /> 课表导入
            </button>
            <button
              onClick={() => { setGoalsOpen(true); loadGoals() }}
              className="flex items-center gap-1.5 px-3 py-2 border bg-white rounded-lg text-sm hover:bg-gray-50">
              <Target className="w-4 h-4" /> 目标规划
            </button>
            <button onClick={openSettings}
              className="flex items-center gap-1.5 px-3 py-2 border bg-white rounded-lg text-sm hover:bg-gray-50">
              <Settings2 className="w-4 h-4" /> 节次时间
            </button>
          </div>
        </div>

        {loading ? (
          <div className="h-[60vh] flex items-center justify-center">
            <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
          </div>
        ) : (
          <div className="rounded-xl border bg-white shadow-sm overflow-auto max-h-[calc(100vh-13rem)]">
            <div className="grid select-none"
              style={{
                gridTemplateColumns: '96px repeat(7, minmax(120px, 1fr))',
                gridTemplateRows: '56px repeat(13, 64px)',
                minWidth: 1080,
              }}>

              <div style={{ gridColumn: 1, gridRow: 1 }}
                className="sticky left-0 top-0 z-50 bg-white border-b border-r flex items-center justify-center text-xs font-medium text-muted-foreground">
                节次
              </div>

              {days.map((date, i) => {
                const isToday = date === today
                return (
                  <div key={`h-${date}`} style={{ gridColumn: i + 2, gridRow: 1 }}
                    className={`sticky top-0 z-40 border-b border-r px-2 flex flex-col justify-center ${isToday ? 'bg-emerald-50' : 'bg-white'}`}>
                    <span className={`text-sm font-semibold leading-tight ${isToday ? 'text-emerald-700' : ''}`}>
                      {WEEKDAY_NAMES[i]}
                      <span className="ml-1 text-xs font-normal text-muted-foreground">{monthDay(date)}</span>
                    </span>
                    {isToday && <span className="text-[10px] text-emerald-600">今天</span>}
                  </div>
                )
              })}

              {Array.from({ length: 13 }, (_, pi) => {
                const period = pi + 1
                const time = settings.periods[pi]
                const isBreak = period === BREAK_PERIOD
                const isGroupStart = period === 6 || period === 11
                return (
                  <Fragment key={`row-${period}`}>
                    <div style={{ gridColumn: 1, gridRow: period + 1 }}
                      className={`sticky left-0 z-20 border-b border-r px-2 flex flex-col items-center justify-center ${isBreak ? 'bg-amber-50' : 'bg-white'} ${isGroupStart ? 'border-t-2 border-t-slate-300' : ''}`}>
                      <span className="text-xs font-semibold">第 {period} 节</span>
                      <span className="text-[10px] text-muted-foreground">{time ? `${time.start}–${time.end}` : ''}</span>
                      {isBreak && <span className="text-[10px] text-amber-700 leading-tight">午饭·午休</span>}
                    </div>

                    {days.map((date, di) => {
                      const occupied = occupiedAt(date, period)
                      const selected = dragSel && dragSel.day === di + 1
                        && period >= dragSel.from && period <= dragSel.to
                      return (
                        <div key={`c-${date}-${period}`}
                          style={{ gridColumn: di + 2, gridRow: period + 1 }}
                          onPointerDown={e => cellPointerDown(e, di + 1, period, date, occupied)}
                          onPointerEnter={() => cellPointerEnter(di + 1, period)}
                          className={`border-b border-r ${isGroupStart ? 'border-t-2 border-t-slate-300' : ''} ${
                            selected ? 'bg-emerald-100'
                              : isBreak ? 'bg-amber-50/50'
                              : di >= 5 ? 'bg-slate-50/60' : 'bg-white'
                          }`}
                        />
                      )
                    })}
                  </Fragment>
                )
              })}

              {days.map((date, di) => {
                const { list, lane, lanes } = layoutFor(date)
                return list.map(it => {
                  const done = marks[markKey(it.id, date)] === 'done'
                  const className = it.classId ? classById.get(it.classId)?.name : ''
                  return (
                    <div key={`i-${it.id}-${date}`}
                      style={{
                        gridColumn: di + 2,
                        gridRow: `${it.startPeriod + 1} / ${it.endPeriod + 2}`,
                        backgroundColor: it.color + '18',
                        borderLeftColor: it.color,
                        marginLeft: lanes > 1 ? `${(lane[it.id] || 0) * 10}px` : undefined,
                        zIndex: 20 + (lane[it.id] || 0),
                      }}
                      onPointerDown={e => e.stopPropagation()}
                      onClick={() => openEdit(it, date)}
                      className={`relative m-0.5 rounded-md border-l-4 px-1.5 py-1 overflow-hidden cursor-pointer hover:shadow-sm ${done ? 'opacity-60' : ''}`}>
                      <div className="flex items-start gap-1">
                        <span className={`flex-1 text-[11px] font-medium leading-tight ${done ? 'line-through text-muted-foreground' : ''}`}>
                          {it.title}
                        </span>
                        <button
                          onClick={e => { e.stopPropagation(); setMark(it.id, date, done ? 'none' : 'done') }}
                          title={done ? '撤销完成' : '标记完成'}
                          className="shrink-0 mt-0.5 text-muted-foreground hover:text-emerald-600">
                          {done ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Square className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <div className="text-[10px] text-muted-foreground truncate">
                        {it.startPeriod}–{it.endPeriod} 节
                        {className && it.classId && (
                          <>
                            {' · '}
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                router.push(`/teacher/classes/${it.classId}`)
                              }}
                              className="underline hover:text-sky-700">
                              {className}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })
              })}

              {now && days.map((date, di) =>
                Array.from({ length: 13 }, (_, pi) => {
                  const period = pi + 1
                  if (!isPast(date, period)) return null
                  return (
                    <div key={`p-${date}-${period}`}
                      style={{ gridColumn: di + 2, gridRow: period + 1 }}
                      className="pointer-events-none bg-slate-900/[0.055] z-30" />
                  )
                })
              )}
            </div>
          </div>
        )}
      </main>

      {editor && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{editor.id ? '编辑安排' : '新建安排'}</h2>
              <button onClick={() => setEditor(null)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            <div className="space-y-3">
              <input autoFocus value={editor.title}
                onChange={e => setEditor({ ...editor, title: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') save() }}
                placeholder="例如：化学A-3班 / 教研会议 / 批改作业"
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-muted-foreground">类型</span>
                  <select value={editor.kind}
                    onChange={e => setEditor({ ...editor, kind: e.target.value as ScheduleKind })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                    {KINDS.map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">班级（可选）</span>
                  <select value={editor.classId}
                    onChange={e => {
                      const id = e.target.value
                      setEditor({
                        ...editor,
                        classId: id,
                        kind: id ? 'class' : editor.kind,
                        color: id ? classColor(id) : editor.color,
                      })
                    }}
                    className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                    <option value="">不绑定班级</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>

              <div>
                <div className="text-sm text-muted-foreground mb-1">重复</div>
                <div className="flex gap-2">
                  <button onClick={() => setEditor({ ...editor, repeat: 'weekly' })}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${editor.repeat === 'weekly' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white hover:bg-gray-50'}`}>
                    每周重复
                  </button>
                  <button onClick={() => setEditor({ ...editor, repeat: 'once' })}
                    className={`px-3 py-1.5 rounded-lg border text-sm ${editor.repeat === 'once' ? 'bg-emerald-50 border-emerald-400 text-emerald-700' : 'bg-white hover:bg-gray-50'}`}>
                    仅这一次
                  </button>
                </div>
              </div>

              {editor.repeat === 'weekly' ? (
                <label className="block text-sm">
                  <span className="text-muted-foreground">每周</span>
                  <select value={editor.weekday}
                    onChange={e => setEditor({ ...editor, weekday: Number(e.target.value) })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                    {WEEKDAY_NAMES.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
                  </select>
                </label>
              ) : (
                <label className="block text-sm">
                  <span className="text-muted-foreground">日期</span>
                  <input type="date" value={editor.eventDate}
                    onChange={e => setEditor({ ...editor, eventDate: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-muted-foreground">开始节次</span>
                  <select value={editor.start}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setEditor({ ...editor, start: v, end: Math.max(v, editor.end) })
                    }}
                    className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                    {Array.from({ length: 13 }, (_, i) => i + 1).map(p => (
                      <option key={p} value={p}>第 {p} 节{p === BREAK_PERIOD ? '（午饭·午休）' : ''}</option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-muted-foreground">结束节次</span>
                  <select value={editor.end}
                    onChange={e => {
                      const v = Number(e.target.value)
                      setEditor({ ...editor, end: Math.max(v, editor.start) })
                    }}
                    className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                    {Array.from({ length: 13 }, (_, i) => i + 1).map(p => (
                      <option key={p} value={p}>第 {p} 节{p === BREAK_PERIOD ? '（午饭·午休）' : ''}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="text-xs text-muted-foreground">{periodRange(editor.start, editor.end)}</div>

              <div>
                <div className="text-sm text-muted-foreground mb-1">颜色</div>
                <div className="flex flex-wrap gap-2">
                  {PALETTE.map(c => (
                    <button key={c} onClick={() => setEditor({ ...editor, color: c })}
                      className={`w-7 h-7 rounded-full border-2 border-white shadow ${editor.color === c ? 'ring-2 ring-offset-1 ring-slate-400' : ''}`}
                      style={{ backgroundColor: c }} title={c} />
                  ))}
                </div>
              </div>

              <textarea value={editor.note} rows={2}
                onChange={e => setEditor({ ...editor, note: e.target.value })}
                placeholder="备注（可选）"
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-5">
              <button onClick={save} disabled={saving}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-60">
                {saving ? '保存中…' : '保存'}
              </button>
              <button onClick={() => setEditor(null)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">取消</button>
              <div className="flex-1" />
              {editor.id && editor.repeat === 'weekly' && (
                <button onClick={skipOccurrence}
                  className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm hover:bg-gray-50">
                  <SkipForward className="w-3.5 h-3.5" /> 跳过这一次
                </button>
              )}
              {editor.id && (
                <button onClick={deleteSeries}
                  className="flex items-center gap-1 px-3 py-2 border border-red-200 text-red-600 rounded-lg text-sm hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" /> 删除系列
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {importOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4"
          tabIndex={-1}
          onPaste={e => {
            if (importBusy || importCells) return
            const f = Array.from(e.clipboardData?.files || []).find(x => x.type.startsWith('image/'))
            if (f) { e.preventDefault(); handleTimetableFile(f) }
          }}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ImagePlus className="w-5 h-5 text-emerald-600" /> 从课表照片导入
              </h2>
              <button onClick={() => { setImportOpen(false); resetImport() }}
                className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            {!importCells ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 p-6 text-center">
                {importBusy ? (
                  <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="w-7 h-7 text-emerald-500 animate-spin" />
                    正在识别课表，通常需要 10–30 秒…
                  </div>
                ) : (
                  <>
                    <ImagePlus className="w-9 h-9 mx-auto text-gray-300 mb-2" />
                    <p className="text-sm text-muted-foreground mb-3">
                      选一张课表照片或截图。
                      <br />识别完会先列出每个名称，让你确认它对应哪个班级，再导入。
                    </p>
                    <label className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 cursor-pointer">
                      选择图片
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) handleTimetableFile(f)
                          e.target.value = ''
                        }} />
                    </label>
                  </>
                )}
                {importError && <p className="text-sm text-red-600 mt-3">{importError}</p>}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-3">
                  识别到 <span className="font-medium text-foreground">{importCells.length}</span> 个时段、
                  <span className="font-medium text-foreground">{importLabels.length}</span> 个不同的名称。
                  确认每个名称怎么处理：
                </p>

                <div className="divide-y rounded-xl border overflow-hidden">
                  {importLabels.map(({ text, count }) => (
                    <div key={text} className="p-3 flex flex-wrap items-center gap-2">
                      <div className="min-w-[7rem] flex-1">
                        <div className="text-sm font-medium break-all">{text}</div>
                        <div className="text-xs text-muted-foreground">{count} 个时段</div>
                      </div>
                      <input
                        value={importTitles[text] ?? text}
                        onChange={e => setImportTitles({ ...importTitles, [text]: e.target.value })}
                        placeholder="导入后的标题"
                        className="w-40 px-2 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                      <select
                        value={importTargets[text] ?? 'task'}
                        onChange={e => setImportTargets({ ...importTargets, [text]: e.target.value })}
                        className="w-48 px-2 py-1.5 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                        <option value="">不导入</option>
                        <option value="task">作为任务</option>
                        <option value="meeting">作为会议</option>
                        <option value="other">作为其他</option>
                        {classes.map(c => (
                          <option key={c.id} value={`class:${c.id}`}>绑定班级：{c.name}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>

                <div className="mt-3 text-xs text-muted-foreground space-y-0.5">
                  {WEEKDAY_NAMES.map((name, i) => {
                    const cells = importCells.filter(c => c.weekday === i + 1)
                    if (!cells.length) return null
                    return (
                      <div key={name}>
                        <span className="font-medium">{name}：</span>
                        {cells.map(c => `${c.startPeriod}${c.endPeriod !== c.startPeriod ? `-${c.endPeriod}` : ''} ${c.text}`).join(' · ')}
                      </div>
                    )
                  })}
                </div>

                <div className="flex flex-wrap gap-2 mt-4">
                  <button onClick={confirmImport} disabled={importSaving}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-60">
                    {importSaving
                      ? '导入中…'
                      : `导入 ${importCells.filter(c => (importTargets[c.text] ?? 'task') !== '').length} 个时段`}
                  </button>
                  <button onClick={resetImport}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">换一张图片</button>
                  <button onClick={() => { setImportOpen(false); resetImport() }}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">取消</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {goalsOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Target className="w-5 h-5 text-violet-600" /> 目标规划
              </h2>
              <button onClick={() => { setGoalsOpen(false); setGoalForm(null); setPlanGoal(null); setPlanSteps(null) }}
                className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            {planGoal && (
              <div className="mb-4 rounded-xl border-2 border-violet-200 bg-violet-50/50 p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold">「{planGoal.title}」的 AI 拆解</h3>
                  <button onClick={() => { setPlanGoal(null); setPlanSteps(null) }}
                    className="p-0.5 rounded hover:bg-white"><X className="w-3.5 h-3.5" /></button>
                </div>
                {planBusy && planSteps === null ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
                    <Loader2 className="w-4 h-4 text-violet-500 animate-spin" /> AI 正在查看空档并安排步骤…
                  </div>
                ) : (
                  <>
                    {planDropped > 0 && (
                      <p className="text-xs text-amber-700 mb-2">
                        有 {planDropped} 条建议与现有安排冲突，已自动跳过。
                      </p>
                    )}
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {(planSteps || []).map((s, i) => (
                        <label key={i}
                          className="flex items-start gap-2 bg-white rounded-lg border px-2 py-1.5 cursor-pointer">
                          <input type="checkbox"
                            checked={planChecked[i] !== false}
                            onChange={e => setPlanChecked({ ...planChecked, [i]: e.target.checked })}
                            className="mt-1" />
                          <span className="text-sm">
                            <span className="text-muted-foreground mr-1">
                              {s.date} {WEEKDAY_NAMES[isoWeekday(s.date) - 1]} · 第 {s.startPeriod}
                              {s.endPeriod !== s.startPeriod ? `-${s.endPeriod}` : ''} 节
                            </span>
                            {s.title}
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button onClick={acceptPlan} disabled={planBusy}
                        className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-60">
                        {planBusy ? '加入中…' : '加入计划表'}
                      </button>
                      <button onClick={() => { setPlanGoal(null); setPlanSteps(null) }}
                        className="px-3 py-1.5 border rounded-lg text-sm hover:bg-white">取消</button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <p className="text-sm text-muted-foreground">
                按周 / 月 / 学期定目标，AI 拆成步骤并给出建议排期，你勾选后才写进计划表。
              </p>
              {!goalForm && (
                <button
                  onClick={() => setGoalForm({ title: '', horizon: 'week', dueDate: defaultDue('week'), note: '' })}
                  className="flex items-center gap-1 px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700">
                  <Plus className="w-3.5 h-3.5" /> 新建目标
                </button>
              )}
            </div>

            {goalForm && (
              <div className="rounded-xl border bg-gray-50 p-3 mb-4 space-y-2">
                <input autoFocus value={goalForm.title}
                  onChange={e => setGoalForm({ ...goalForm, title: e.target.value })}
                  placeholder="目标，例如：十月月考后完成第 4 章复习"
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500" />
                <div className="grid grid-cols-2 gap-2">
                  <label className="block text-sm">
                    <span className="text-muted-foreground">周期</span>
                    <select value={goalForm.horizon}
                      onChange={e => {
                        const h = e.target.value as GoalHorizon
                        setGoalForm({ ...goalForm, horizon: h, dueDate: defaultDue(h) })
                      }}
                      className="mt-1 w-full px-2 py-1.5 border rounded-lg text-sm">
                      <option value="week">本周</option>
                      <option value="month">本月</option>
                      <option value="term">本学期</option>
                    </select>
                  </label>
                  <label className="block text-sm">
                    <span className="text-muted-foreground">截止日期</span>
                    <input type="date" value={goalForm.dueDate}
                      onChange={e => setGoalForm({ ...goalForm, dueDate: e.target.value })}
                      className="mt-1 w-full px-2 py-1.5 border rounded-lg text-sm" />
                  </label>
                </div>
                <textarea value={goalForm.note} rows={2}
                  onChange={e => setGoalForm({ ...goalForm, note: e.target.value })}
                  placeholder="补充说明（可选），例如：只安排工作日、每次不超过 2 节"
                  className="w-full px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-violet-500 resize-none" />
                <div className="flex gap-2">
                  <button onClick={createGoal} disabled={goalBusy}
                    className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 disabled:opacity-60">
                    {goalBusy ? '保存中…' : '保存目标'}
                  </button>
                  <button onClick={() => setGoalForm(null)}
                    className="px-3 py-1.5 border bg-white rounded-lg text-sm hover:bg-gray-100">取消</button>
                </div>
              </div>
            )}

            {goalsLoading ? (
              <div className="py-8 flex justify-center">
                <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
              </div>
            ) : goals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">
                还没有目标。先建一个，然后让 AI 帮你拆到计划表里。
              </p>
            ) : (
              <div className="space-y-2">
                {goals.map(g => (
                  <div key={g.id}
                    className={`rounded-xl border p-3 ${g.status === 'done' ? 'opacity-60 bg-gray-50' : 'bg-white'}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`font-medium ${g.status === 'done' ? 'line-through' : ''}`}>{g.title}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-violet-50 text-violet-700">
                        {HORIZON_LABEL[g.horizon]}
                      </span>
                      {g.dueDate && (
                        <span className="text-xs text-muted-foreground">截止 {g.dueDate}</span>
                      )}
                      {!!g.itemCount && (
                        <span className="text-xs text-muted-foreground">
                          步骤 {g.doneCount}/{g.itemCount} 完成
                        </span>
                      )}
                      <div className="flex-1" />
                      <button onClick={() => runPlan(g)} disabled={planBusy}
                        className="flex items-center gap-1 px-2.5 py-1.5 border border-violet-200 text-violet-700 rounded-lg text-xs font-medium hover:bg-violet-50 disabled:opacity-50">
                        <Sparkles className="w-3.5 h-3.5" /> AI 拆解
                      </button>
                      <button onClick={() => patchGoal(g, { status: g.status === 'done' ? 'open' : 'done' })}
                        className="px-2.5 py-1.5 border rounded-lg text-xs hover:bg-gray-50">
                        {g.status === 'done' ? '重新打开' : '标记完成'}
                      </button>
                      <button onClick={() => deleteGoal(g)}
                        className="p-1.5 border border-red-100 text-red-600 rounded-lg hover:bg-red-50" title="删除目标">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {g.note && (
                      <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{g.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {settingsOpen && draft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">节次时间与学期</h2>
              <button onClick={() => setSettingsOpen(false)} className="p-1 rounded hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <label className="block text-sm">
                <span className="text-muted-foreground">第一周周一</span>
                <input type="date" value={draft.termStart}
                  onChange={e => setDraft({ ...draft, termStart: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
              <label className="block text-sm">
                <span className="text-muted-foreground">学期周数</span>
                <input type="number" min={1} max={60} value={draft.termWeeks}
                  onChange={e => setDraft({ ...draft, termWeeks: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
              </label>
            </div>

            <div className="space-y-1.5">
              {draft.periods.map((p, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className={`w-14 text-sm ${i + 1 === BREAK_PERIOD ? 'text-amber-700 font-medium' : ''}`}>
                    第 {i + 1} 节
                  </span>
                  <input type="time" value={p.start}
                    onChange={e => {
                      const periods = draft.periods.map((x, k) => k === i ? { ...x, start: e.target.value } : x)
                      setDraft({ ...draft, periods })
                    }}
                    className="w-28 px-2 py-1.5 border rounded-lg text-sm" />
                  <span className="text-muted-foreground">–</span>
                  <input type="time" value={p.end}
                    onChange={e => {
                      const periods = draft.periods.map((x, k) => k === i ? { ...x, end: e.target.value } : x)
                      setDraft({ ...draft, periods })
                    }}
                    className="w-28 px-2 py-1.5 border rounded-lg text-sm" />
                  {i + 1 === BREAK_PERIOD && <span className="text-xs text-amber-700">午饭·午休</span>}
                </div>
              ))}
            </div>

            <div className="flex gap-2 mt-5">
              <button onClick={saveSettings} disabled={saving}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-60">
                {saving ? '保存中…' : '保存'}
              </button>
              <button onClick={() => setSettingsOpen(false)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">取消</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
