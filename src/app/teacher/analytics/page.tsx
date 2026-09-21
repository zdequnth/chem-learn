'use client'

import { useEffect, useState, Suspense, Fragment } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import { Loader2, ArrowLeft, ChevronDown, ChevronRight, Printer } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

interface QStat {
  id: string; lessonId: string; lessonTitle: string; chapterTitle: string
  chapterOrder: number; questionType: string; stem: string; imageUrl: string | null; knowledgePointId: string | null
  options: { id: string; content: string; isCorrect: boolean }[]
  attempts: number; correct: number; wrong: number; rate: number | null; wrongStudents: number
}
interface KpStat {
  id: string; lessonId: string; lessonTitle: string; title: string
  attempts: number; correct: number; rate: number | null
}
interface LessonStat {
  id: string; title: string; chapterTitle: string
  attempted: number; passed: number; passRate: number | null; firstPassRate: number | null
  avgAttempts: number | null; medianSeconds: number | null; avgSeconds: number | null
}
interface Attempt {
  sessionId: string; seconds: number | null; correct: number; wrong: number
  focusLost: number; secPerQ: number | null
}
interface DetailRow {
  studentId: string; name: string; attempts: number; passed: boolean; passIndex: number
  attemptDetail: Attempt[]
}
interface SessionModal {
  studentName: string; lessonTitle: string
  questions: { stem: string; imageUrl: string | null; isCorrect: boolean; options: { content: string; isCorrect: boolean }[]; selected: string; correct: string }[]
}
interface WrongModal {
  studentName: string
  questions: { stem: string; imageUrl: string | null; lessonTitle: string; wrongCount: number; solved: boolean; options: { content: string; isCorrect: boolean }[] }[]
}

function rateClass(rate: number) {
  if (rate >= 80) return 'text-emerald-600'
  if (rate >= 60) return 'text-amber-600'
  return 'text-red-600'
}

function fmtSeconds(s: number | null) {
  if (s === null || s === undefined) return '—'
  if (s < 60) return `${s} 秒`
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`
}

function AnalyticsContent() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const { lang } = useLang()
  const sp = useSearchParams()

  const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
  const [classes, setClasses] = useState<{ id: string; name: string }[]>([])
  const [scope, setScope] = useState<'course' | 'class'>('course')
  const [courseId, setCourseId] = useState('')
  const [classId, setClassId] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [empty, setEmpty] = useState(false)
  const [emptyReason, setEmptyReason] = useState('')
  const [scopeName, setScopeName] = useState('')
  const [studentCount, setStudentCount] = useState(0)
  const [questions, setQuestions] = useState<QStat[]>([])
  const [kpStats, setKpStats] = useState<KpStat[]>([])
  const [lessons, setLessons] = useState<LessonStat[]>([])
  const [openLesson, setOpenLesson] = useState('')
  const [openWrong, setOpenWrong] = useState(false)
  const [rateFilter, setRateFilter] = useState<'80' | '50' | '30' | 'none'>('80')
  const [detail, setDetail] = useState<DetailRow[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [sessionModal, setSessionModal] = useState<SessionModal | null>(null)
  const [sessionLoading, setSessionLoading] = useState(false)

  const openSession = async (sessionId: string) => {
    setSessionModal({ studentName: '', lessonTitle: '', questions: [] })
    setSessionLoading(true)
    try {
      const j = await (await fetch(`/api/teacher/analytics?sessionId=${sessionId}`)).json()
      if (j.error) { alert(j.error); setSessionModal(null) }
      else setSessionModal({ studentName: j.studentName || '', lessonTitle: j.lessonTitle || '', questions: j.questions || [] })
    } catch { setSessionModal(null) } finally { setSessionLoading(false) }
  }

  const [wrongModal, setWrongModal] = useState<WrongModal | null>(null)
  const [wrongLoading, setWrongLoading] = useState(false)

  const openStudentWrong = async (studentId: string, studentName: string) => {
    setWrongModal({ studentName, questions: [] })
    setWrongLoading(true)
    const base = scope === 'course' ? `scope=course&courseId=${courseId}` : `scope=class&classId=${classId}`
    try {
      const j = await (await fetch(`/api/teacher/analytics?${base}&studentId=${studentId}`)).json()
      if (j.error) { alert(j.error); setWrongModal(null) }
      else setWrongModal({ studentName: j.studentName || studentName, questions: j.questions || [] })
    } catch { setWrongModal(null) } finally { setWrongLoading(false) }
  }

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetch('/api/courses').then((r) => r.json()).then((j) => {
      const list = (j.courses || []) as { id: string; name: string }[]
      setCourses(list)
      if (list.length > 0) setCourseId((prev) => (list.some((c) => c.id === prev) ? prev : list[0].id))
    })
    fetch('/api/classes').then((r) => r.json()).then((j) => {
      const list = (j.classes || []) as { id: string; name: string }[]
      setClasses(list)
      if (list.length > 0) setClassId((prev) => (list.some((c) => c.id === prev) ? prev : list[0].id))
    })
  }, [profile])

  // Restore from URL params (deep links) first, then last-saved selection
  useEffect(() => {
    const urlScope = sp.get('scope')
    const urlCourse = sp.get('courseId')
    const urlClass = sp.get('classId')
    const s = urlScope || localStorage.getItem('analytics.scope')
    const c = urlCourse || localStorage.getItem('analytics.courseId')
    const k = urlClass || localStorage.getItem('analytics.classId')
    const r = localStorage.getItem('analytics.rateFilter')
    if (s === 'class' || s === 'course') setScope(s)
    if (c) setCourseId(c)
    if (k) setClassId(k)
    if (r === '80' || r === '50' || r === '30' || r === 'none') setRateFilter(r)
  }, [])

  useEffect(() => { localStorage.setItem('analytics.scope', scope) }, [scope])
  useEffect(() => { if (courseId) localStorage.setItem('analytics.courseId', courseId) }, [courseId])
  useEffect(() => { if (classId) localStorage.setItem('analytics.classId', classId) }, [classId])
  useEffect(() => { localStorage.setItem('analytics.rateFilter', rateFilter) }, [rateFilter])

  const activeId = scope === 'course' ? courseId : classId

  useEffect(() => {
    if (!activeId) return
    const ctrl = new AbortController()
    setLoading(true); setError(''); setEmpty(false); setEmptyReason('')
    setQuestions([]); setKpStats([]); setLessons([]); setOpenLesson(''); setDetail(null)
    const qs = scope === 'course' ? `scope=course&courseId=${courseId}` : `scope=class&classId=${classId}`
    fetch(`/api/teacher/analytics?${qs}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((j) => {
        if (j.error) { setError(j.error); return }
        setScopeName(j.scopeName || '')
        setStudentCount(j.students || 0)
        setQuestions(j.questions || [])
        setKpStats(j.knowledgePoints || [])
        setLessons(j.lessons || [])
        setEmpty(!!j.empty)
        setEmptyReason(j.reason || '')
      })
      .catch((e) => { if (e.name !== 'AbortError') setError('加载失败') })
      .finally(() => setLoading(false))
    return () => ctrl.abort()
  }, [scope, courseId, classId, activeId])

  const toggleLesson = async (lessonId: string) => {
    if (openLesson === lessonId) { setOpenLesson(''); setDetail(null); return }
    setOpenLesson(lessonId); setDetail(null); setDetailLoading(true)
    const base = scope === 'course' ? `scope=course&courseId=${courseId}` : `scope=class&classId=${classId}`
    try {
      const j = await (await fetch(`/api/teacher/analytics?${base}&lessonId=${lessonId}`)).json()
      setDetail(j.detail || [])
    } catch { setDetail([]) } finally { setDetailLoading(false) }
  }

  // weak knowledge points first (only ones with a rate)
  const weakKps = kpStats.filter((k) => k.rate !== null).sort((a, b) => (a.rate as number) - (b.rate as number))
  // 错题本：按所选档位过滤正确率（≥ 阈值的不算错题），或只看无数据的题
  const rankedQuestions = questions
    .filter((q) => {
      if (q.attempts <= 0) return false
      if (rateFilter === 'none') return q.rate === null
      return q.rate !== null && q.rate < Number(rateFilter)
    })
    .sort((a, b) => {
      const ra = a.rate === null ? 999 : a.rate
      const rb = b.rate === null ? 999 : b.rate
      return ra - rb
    })

  // group ranked questions by chapter, in course chapter order
  const wrongByChapter = (() => {
    const map = new Map<string, { chapter: string; order: number; items: QStat[] }>()
    for (const q of rankedQuestions) {
      const key = q.chapterTitle || '（未分章）'
      let g = map.get(key)
      if (!g) { g = { chapter: key, order: q.chapterOrder ?? 0, items: [] }; map.set(key, g) }
      g.items.push(q)
    }
    return [...map.values()].sort((a, b) => a.order - b.order)
  })()

  const exportWrong = () => {
    setOpenWrong(true)
    // let React paint the expanded list, then print; .print-expand also forces it in print CSS
    setTimeout(() => window.print(), 120)
  }

  // Lessons that have attempts, grouped by chapter (in course order)
  const lessonGroups: { chapter: string; items: LessonStat[] }[] = (() => {
    const out: { chapter: string; items: LessonStat[] }[] = []
    for (const l of lessons.filter((x) => x.attempted > 0)) {
      const ch = l.chapterTitle || '—'
      let g = out.find((x) => x.chapter === ch)
      if (!g) { g = { chapter: ch, items: [] }; out.push(g) }
      g.items.push(l)
    }
    return out
  })()

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-24 pb-20">
        <Link href="/dashboard" className="no-print inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> {lang === 'zh' ? '返回工作台' : 'Back'}
        </Link>
        <h1 className="text-2xl font-bold mb-1">{t('analytics', lang)}</h1>
        <p className="text-muted-foreground mb-6 text-sm">
          {lang === 'zh' ? '看清薄弱题目与知识点、学生的尝试次数与通关用时' : 'Spot weak questions/KPs, attempts and time to pass'}
        </p>

        {/* Scope switch */}
        <div className="no-print bg-card rounded-2xl border p-4 mb-6 flex flex-wrap items-center gap-3">
          <div className="flex rounded-lg border overflow-hidden">
            {(['course', 'class'] as const).map((s) => (
              <button key={s} onClick={() => setScope(s)}
                className={`px-4 py-2 text-sm font-medium transition-colors ${scope === s ? 'bg-emerald-500 text-white' : 'bg-white text-muted-foreground hover:bg-accent'}`}>
                {s === 'course' ? (lang === 'zh' ? '按课程' : 'By Course') : (lang === 'zh' ? '按班级' : 'By Class')}
              </button>
            ))}
          </div>
          {scope === 'course' ? (
            <select value={courseId} onChange={(e) => setCourseId(e.target.value)}
              className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
              {courses.length === 0 && <option value="">{lang === 'zh' ? '暂无课程' : 'No courses'}</option>}
              {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          ) : (
            <select value={classId} onChange={(e) => setClassId(e.target.value)}
              className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
              {classes.length === 0 && <option value="">{lang === 'zh' ? '暂无班级' : 'No classes'}</option>}
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          {scopeName && !loading && !error && (
            <span className="text-sm text-muted-foreground">
              {scopeName} · {lang === 'zh' ? `${studentCount} 名学生` : `${studentCount} students`}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : error ? (
          <div className="text-center py-16 text-red-500">{error}</div>
        ) : empty ? (
          <div className="text-center py-16 text-muted-foreground">
            {emptyReason || (lang === 'zh' ? '暂无学习数据' : 'No data yet')}
          </div>
        ) : (
          <div className="space-y-8">

            {/* Panel 1: weak knowledge points */}
            <section className="no-print bg-card rounded-2xl border p-6">
              <h2 className="text-lg font-semibold mb-1">🎯 {lang === 'zh' ? '薄弱知识点' : 'Weak Knowledge Points'}</h2>
              <p className="text-xs text-muted-foreground mb-4">{lang === 'zh' ? '按正确率从低到高，优先复习排在前面的' : 'Lowest correct-rate first'}</p>
              {weakKps.length === 0 ? (
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无足够数据（每题需至少 5 次作答才统计）' : 'Not enough data yet'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '知识点' : 'KP'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '课时' : 'Lesson'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '正确率' : 'Rate'}</th>
                        <th className="py-2 font-medium">{lang === 'zh' ? '作答数' : 'Answers'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weakKps.map((k) => (
                        <tr key={k.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{k.title}</td>
                          <td className="py-2 pr-4 text-muted-foreground">{k.lessonTitle}</td>
                          <td className={`py-2 pr-4 font-semibold ${rateClass(k.rate as number)}`}>{k.rate}%</td>
                          <td className="py-2 text-muted-foreground">{k.attempts}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Panel 2: high-wrong questions (collapsible, chapter-grouped, printable) */}
            <section className="bg-card rounded-2xl border p-6">
              <div className="flex items-start justify-between gap-3">
                <button onClick={() => setOpenWrong(v => !v)} className="keep-print flex items-center gap-2 text-left">
                  {openWrong ? <ChevronDown className="w-5 h-5 shrink-0 no-print" /> : <ChevronRight className="w-5 h-5 shrink-0 no-print" />}
                  <span className="text-lg font-semibold">🌶️ {lang === 'zh' ? '高错题（教师版错题本）' : 'Most-missed Questions'}</span>
                  <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">{rankedQuestions.length}</span>
                </button>
                {rankedQuestions.length > 0 && (
                  <button onClick={exportWrong}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-purple-500 text-white rounded-lg text-sm font-medium hover:bg-purple-600 no-print">
                    <Printer className="w-4 h-4" /> {lang === 'zh' ? '导出 PDF' : 'Export PDF'}
                  </button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{scopeName}{scopeName ? ' · ' : ''}{lang === 'zh' ? '按章节汇总，正确率从低到高排列；点右上角"导出 PDF"可打印' : 'Grouped by chapter, lowest correct-rate first'}</p>

              {/* 正确率档位过滤 */}
              <div className="no-print flex flex-wrap items-center gap-2 mb-4">
                <span className="text-xs text-muted-foreground">{lang === 'zh' ? '正确率：' : 'Rate:'}</span>
                {([['80', '<80%'], ['50', '<50%'], ['30', '<30%']] as const).map(([v, label]) => (
                  <button key={v} onClick={() => setRateFilter(v)}
                    className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${rateFilter === v ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-muted-foreground hover:bg-accent'}`}>
                    {label}
                  </button>
                ))}
                <button onClick={() => setRateFilter('none')}
                  className={`px-3 py-1 rounded-lg text-xs font-medium border transition-colors ${rateFilter === 'none' ? 'bg-purple-500 text-white border-purple-500' : 'bg-white text-muted-foreground hover:bg-accent'}`}>
                  {lang === 'zh' ? '— 无数据' : '— no data'}
                </button>
                <span className="text-xs text-muted-foreground">({rankedQuestions.length})</span>
              </div>

              <div className={`${openWrong ? '' : 'hidden'} print-expand space-y-6`}>
                {rankedQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无需要关注的错题（正确率低于 80% 的题会显示在这里）' : 'No questions below 80% correct'}</p>
                ) : (
                  wrongByChapter.map((g) => (
                    <div key={g.chapter} className="print-chapter-break">
                      <h3 className="text-md font-semibold mb-2 flex items-center gap-1">
                        <ChevronRight className="w-4 h-4" /> {g.chapter}
                        <span className="text-sm text-muted-foreground font-normal">({g.items.length} 题)</span>
                      </h3>
                      <div className="space-y-2">
                        {g.items.map((q) => (
                          <div key={q.id} className="border rounded-xl p-3">
                            <div className="flex items-start gap-3">
                              <div className="flex-1 min-w-0">
                                {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-2 rounded-lg max-h-40 border" />}
                                <div className="text-sm"><KatexHtml text={q.stem} /></div>
                                <div className="text-xs text-muted-foreground mt-1">{q.lessonTitle}</div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className={`text-sm font-semibold ${q.rate === null ? 'text-muted-foreground' : rateClass(q.rate)}`}>
                                  {q.rate === null ? '—' : `${q.rate}%`}
                                </div>
                                <div className="text-xs text-muted-foreground">{q.attempts} {lang === 'zh' ? '次作答' : 'ans'}</div>
                                {q.wrong > 0 && <div className="text-xs text-orange-500">{q.wrong} {lang === 'zh' ? '次答错' : 'wrong'}</div>}
                                {q.wrongStudents > 0 && <div className="text-xs text-red-500">{q.wrongStudents} {lang === 'zh' ? '人答错' : 'ppl'}</div>}
                              </div>
                            </div>
                            {q.options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 mt-2">
                                {q.options.map((opt, j) => (
                                  <span key={opt.id} className={`text-xs px-2 py-1 rounded ${opt.isCorrect ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-50 text-gray-600'}`}>
                                    {opt.isCorrect ? '✓ ' : ''}{String.fromCharCode(65 + j)}. <KatexHtml text={cleanOption(opt.content)} />
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            {/* Panel 3: attempts & time */}
            <section className="no-print bg-card rounded-2xl border p-6">
              <h2 className="text-lg font-semibold mb-1">⏱️ {lang === 'zh' ? '通关尝试与用时' : 'Attempts & Time'}</h2>
              <p className="text-xs text-muted-foreground mb-4">{lang === 'zh' ? '通过率 = 该课时通过人数 ÷ 总人数（含尚未开始的）；点课时查看每个学生的尝试次数与每次用时，点学生名字看他的错题本' : 'Pass rate = passed / all students; click a lesson for detail, click a student for their wrong book'}</p>
              {lessons.filter((l) => l.attempted > 0).length === 0 ? (
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无通关记录' : 'No attempts yet'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '课时' : 'Lesson'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '参与' : 'Tried'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '通过率' : 'Pass'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '首次通过率' : '1st-try'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '平均尝试' : 'Avg tries'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '中位用时' : 'Median'}</th>
                        <th className="py-2 font-medium">{lang === 'zh' ? '平均用时' : 'Avg'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lessonGroups.map((g) => (
                        <Fragment key={g.chapter}>
                          <tr className="bg-gray-50">
                            <td colSpan={7} className="py-1.5 px-2 text-xs font-semibold text-muted-foreground">{g.chapter}</td>
                          </tr>
                          {g.items.map((l) => (
                            <tr key={l.id} className="border-b last:border-0 align-top">
                              <td className="py-2 pr-4 pl-4">
                                <button onClick={() => toggleLesson(l.id)} className="flex items-center gap-1 hover:text-emerald-600 text-left">
                                  {openLesson === l.id ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                                  <span>{l.title}</span>
                                </button>
                              </td>
                              <td className="py-2 pr-4 text-muted-foreground">{l.attempted}</td>
                              <td className="py-2 pr-4">{l.passRate === null ? '—' : `${l.passRate}%`}</td>
                              <td className="py-2 pr-4">{l.firstPassRate === null ? '—' : `${l.firstPassRate}%`}</td>
                              <td className="py-2 pr-4">{l.avgAttempts ?? '—'}</td>
                              <td className="py-2 pr-4">{fmtSeconds(l.medianSeconds)}</td>
                              <td className="py-2">{fmtSeconds(l.avgSeconds)}</td>
                            </tr>
                          ))}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {openLesson && (
                <div className="mt-4 border-t pt-4">
                  {detailLoading ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /></div>
                  ) : !detail || detail.length === 0 ? (
                    <p className="text-sm text-muted-foreground">{lang === 'zh' ? '该课时暂无学生记录' : 'No records'}</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-muted-foreground border-b">
                          <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '学生' : 'Student'}</th>
                          <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '尝试次数' : 'Tries'}</th>
                          <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '结果' : 'Result'}</th>
                          <th className="py-2 font-medium">{lang === 'zh' ? '每次用时' : 'Time per try'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.map((d) => (
                          <tr key={d.studentId} className="border-b last:border-0">
                            <td className="py-2 pr-4">
                              <button onClick={() => openStudentWrong(d.studentId, d.name)}
                                className="text-blue-600 hover:underline" title={lang === 'zh' ? '查看该学生的错题本' : 'View wrong book'}>
                                {d.name}
                              </button>
                            </td>
                            <td className="py-2 pr-4">{d.attempts}</td>
                            <td className="py-2 pr-4">
                              {d.passed
                                ? <span className="text-emerald-600">{lang === 'zh' ? '已通过' : 'Passed'}</span>
                                : <span className="text-red-500">{lang === 'zh' ? '未通过' : 'Not passed'}</span>}
                            </td>
                            <td className="py-2">
                              {d.attemptDetail.length > 0 ? (
                                <div className="flex flex-wrap gap-x-4 gap-y-1">
                                  {d.attemptDetail.map((a, idx) => {
                                    const highlight = d.passed && idx === d.passIndex
                                    const reasons: string[] = []
                                    if (a.focusLost >= 2) reasons.push(lang === 'zh' ? `切屏${a.focusLost}次` : `${a.focusLost} switches`)
                                    if (highlight && a.secPerQ !== null && a.secPerQ < 8) reasons.push(lang === 'zh' ? `过快·平均${a.secPerQ}秒/题` : `fast ${a.secPerQ}s/q`)
                                    return (
                                      <button key={a.sessionId} onClick={() => openSession(a.sessionId)}
                                        className={`text-left hover:underline ${highlight ? 'text-red-500 font-medium' : 'text-muted-foreground'}`}
                                        title={lang === 'zh' ? '查看这次测试的题目' : 'View questions'}>
                                        {fmtSeconds(a.seconds)} · {lang === 'zh' ? `${a.correct}对${a.wrong}错` : `${a.correct}✓ ${a.wrong}✗`}
                                        {reasons.length > 0 && <span className="text-amber-600 ml-1 font-medium">⚠️{reasons.join(' · ')}</span>}
                                      </button>
                                    )
                                  })}
                                </div>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </section>

          </div>
        )}
      </main>

      {/* Session drill-down modal */}
      {sessionModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 overflow-y-auto no-print" onClick={() => setSessionModal(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl mx-4 mb-12" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                {sessionModal.studentName} · {sessionModal.lessonTitle}
                {sessionLoading && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />}
              </h3>
              <button onClick={() => setSessionModal(null)} className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm">关闭</button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
              {sessionModal.questions.length === 0 && !sessionLoading && (
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '这次测试暂无题目记录' : 'No records'}</p>
              )}
              {sessionModal.questions.map((q, i) => (
                <div key={i} className="border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${q.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                      {q.isCorrect ? (lang === 'zh' ? '对' : 'ok') : (lang === 'zh' ? '错' : 'x')}
                    </span>
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                  </div>
                  {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-2 rounded-lg max-h-40 border" />}
                  <div className="text-sm mb-2"><KatexHtml text={q.stem} /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {q.options.map((opt, j) => (
                      <span key={j} className={`text-xs px-2 py-1 rounded ${opt.isCorrect ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-50 text-gray-600'}`}>
                        {String.fromCharCode(65 + j)}. <KatexHtml text={cleanOption(opt.content)} />
                      </span>
                    ))}
                  </div>
                  {!q.isCorrect && q.selected && (
                    <div className="text-xs text-red-500 mt-1">{lang === 'zh' ? '学生选了：' : 'Chose: '}<KatexHtml text={cleanOption(q.selected)} /></div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Student wrong-book modal */}
      {wrongModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 overflow-y-auto no-print" onClick={() => setWrongModal(null)}>
          <div className="bg-card rounded-2xl shadow-2xl w-full max-w-3xl mx-4 mb-12" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b">
              <h3 className="font-semibold flex items-center gap-2">
                {lang === 'zh' ? `${wrongModal.studentName} 的错题本` : `${wrongModal.studentName} · wrong book`}
                {wrongLoading && <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />}
              </h3>
              <button onClick={() => setWrongModal(null)} className="px-3 py-1.5 bg-gray-200 rounded-lg text-sm">关闭</button>
            </div>
            <div className="p-6 max-h-[70vh] overflow-y-auto space-y-3">
              {wrongModal.questions.length === 0 && !wrongLoading && (
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '该学生在这门课里暂无错题记录' : 'No wrong questions'}</p>
              )}
              {wrongModal.questions.map((q, i) => (
                <div key={i} className="border rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs text-muted-foreground">#{i + 1}</span>
                    <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full">{lang === 'zh' ? `错 ${q.wrongCount} 次` : `${q.wrongCount}×`}</span>
                    {q.solved
                      ? <span className="text-xs px-2 py-0.5 bg-emerald-50 text-emerald-600 rounded-full">{lang === 'zh' ? '后来做对过' : 'later correct'}</span>
                      : <span className="text-xs px-2 py-0.5 bg-red-50 text-red-600 rounded-full">{lang === 'zh' ? '一直未做对' : 'never correct'}</span>}
                    <span className="text-xs text-muted-foreground truncate">{q.lessonTitle}</span>
                  </div>
                  {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-2 rounded-lg max-h-40 border" />}
                  <div className="text-sm mb-2"><KatexHtml text={q.stem} /></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {q.options.map((opt, j) => (
                      <span key={j} className={`text-xs px-2 py-1 rounded ${opt.isCorrect ? 'bg-green-100 text-green-800 font-medium' : 'bg-gray-50 text-gray-600'}`}>
                        {String.fromCharCode(65 + j)}. <KatexHtml text={cleanOption(opt.content)} />
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TeacherAnalyticsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AnalyticsContent />
    </Suspense>
  )
}
