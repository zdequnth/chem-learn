'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml } from '@/components/KatexSpan'
import { Loader2, ArrowLeft, ChevronDown, ChevronRight, Printer } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

interface QStat {
  id: string; lessonId: string; lessonTitle: string; chapterTitle: string
  chapterOrder: number; questionType: string; stem: string; knowledgePointId: string | null
  attempts: number; correct: number; wrong: number; rate: number | null; wrongStudents: number
}
interface KpStat {
  id: string; lessonId: string; lessonTitle: string; title: string
  attempts: number; correct: number; rate: number | null
}
interface LessonStat {
  id: string; title: string; chapterTitle: string
  attempted: number; passed: number; passRate: number | null
  avgAttempts: number | null; medianSeconds: number | null; avgSeconds: number | null
}
interface DetailRow {
  studentId: string; name: string; attempts: number; passed: boolean; durations: number[]
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
  const [detail, setDetail] = useState<DetailRow[] | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

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
      if (list.length > 0) setCourseId((prev) => prev || list[0].id)
    })
    fetch('/api/classes').then((r) => r.json()).then((j) => {
      const list = (j.classes || []) as { id: string; name: string }[]
      setClasses(list)
      if (list.length > 0) setClassId((prev) => prev || list[0].id)
    })
  }, [profile])

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
  const rankedQuestions = questions
    .filter((q) => q.attempts > 0)
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
              <p className="text-xs text-muted-foreground mt-1 mb-4">{scopeName}{scopeName ? ' · ' : ''}{lang === 'zh' ? '按章节汇总；正确率最低的题排在前面，"答错人数"为曾答错过该题的学生数' : 'Grouped by chapter, lowest correct-rate first'}</p>

              <div className={`${openWrong ? '' : 'hidden'} print-expand space-y-6`}>
                {rankedQuestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{lang === 'zh' ? '暂无作答数据' : 'No answers yet'}</p>
                ) : (
                  wrongByChapter.map((g) => (
                    <div key={g.chapter} className="print-chapter-break">
                      <h3 className="text-md font-semibold mb-2 flex items-center gap-1">
                        <ChevronRight className="w-4 h-4" /> {g.chapter}
                        <span className="text-sm text-muted-foreground font-normal">({g.items.length} 题)</span>
                      </h3>
                      <div className="space-y-2">
                        {g.items.map((q) => (
                          <div key={q.id} className="flex items-start gap-3 border rounded-xl p-3">
                            <div className="flex-1 min-w-0">
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
              <p className="text-xs text-muted-foreground mb-4">{lang === 'zh' ? '点击课时查看每个学生的尝试次数与每次用时' : 'Click a lesson for per-student detail'}</p>
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
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '平均尝试' : 'Avg tries'}</th>
                        <th className="py-2 pr-4 font-medium">{lang === 'zh' ? '中位用时' : 'Median'}</th>
                        <th className="py-2 font-medium">{lang === 'zh' ? '平均用时' : 'Avg'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {lessons.filter((l) => l.attempted > 0).map((l) => (
                        <tr key={l.id} className="border-b last:border-0 align-top">
                          <td className="py-2 pr-4">
                            <button onClick={() => toggleLesson(l.id)} className="flex items-center gap-1 hover:text-emerald-600 text-left">
                              {openLesson === l.id ? <ChevronDown className="w-4 h-4 shrink-0" /> : <ChevronRight className="w-4 h-4 shrink-0" />}
                              <span>{l.title}</span>
                            </button>
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">{l.attempted}</td>
                          <td className="py-2 pr-4">{l.passRate === null ? '—' : `${l.passRate}%`}</td>
                          <td className="py-2 pr-4">{l.avgAttempts ?? '—'}</td>
                          <td className="py-2 pr-4">{fmtSeconds(l.medianSeconds)}</td>
                          <td className="py-2">{fmtSeconds(l.avgSeconds)}</td>
                        </tr>
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
                            <td className="py-2 pr-4">{d.name}</td>
                            <td className="py-2 pr-4">{d.attempts}</td>
                            <td className="py-2 pr-4">
                              {d.passed
                                ? <span className="text-emerald-600">{lang === 'zh' ? '已通过' : 'Passed'}</span>
                                : <span className="text-red-500">{lang === 'zh' ? '未通过' : 'Not passed'}</span>}
                            </td>
                            <td className="py-2 text-muted-foreground">
                              {d.durations.length > 0 ? d.durations.map((s) => fmtSeconds(s)).join('、') : '—'}
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
