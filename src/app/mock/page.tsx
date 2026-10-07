'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { kindTheme } from '@/lib/course-kind'
import { ArrowLeft, Loader2, Clock, FileText, Play, RotateCcw, BarChart3 } from 'lucide-react'
import { useLang } from '@/lib/i18n'

interface PaperRow {
  id: string
  title: string
  durationMinutes: number
  questionCount: number
  lastResult: { status: string; percentage: number | null; submittedAt: string | null; sessionId: string } | null
}

function MockListContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { lang } = useLang()
  const theme = kindTheme('mock')

  const [groups, setGroups] = useState<{ id: string; name: string; papers: PaperRow[] }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (!authLoading && !user) router.push('/login') }, [user, authLoading, router])

  // Every mock course the student can see, each with its published papers.
  //
  // Not /api/courses — that lists courses a teacher OWNS and is empty for a
  // student. And grouped by course rather than shown as one flat list: with
  // several mock courses a flat list becomes unreadable.
  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const j = await fetch('/api/test/mock/courses').then(r => r.json())
        const list = (j.courses || []) as { id: string; name: string }[]
        const want = sp.get('course')
        // Keep the requested course first, so a link into one course lands on it.
        const ordered = want && list.some(c => c.id === want)
          ? [list.find(c => c.id === want)!, ...list.filter(c => c.id !== want)]
          : list
        const withPapers = await Promise.all(ordered.map(async (c) => {
          const p = await fetch(`/api/test/mock/papers?courseId=${c.id}`).then(r => r.json()).catch(() => ({}))
          return { ...c, papers: (p.papers || []) as PaperRow[] }
        }))
        setGroups(withPapers.filter(g => g.papers.length > 0))
      } catch { /* nothing to show */ }
      finally { setLoading(false) }
    })()
  }, [user])

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-24">
        <div className="mb-6">
          <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4" /> {lang === 'zh' ? '返回仪表盘' : 'Back'}
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">{theme.emoji} {lang === 'zh' ? '模拟考' : 'Mock Exams'}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === 'zh' ? '限时做完整套题：倒计时内自由作答、可以回头改答案，交卷后才看分数和错题。' : 'Timed full papers. No feedback until you hand in.'}
          </p>
        </div>

        {!loading && groups.length === 0 ? (
          <div className="bg-card border rounded-2xl p-10 text-center">
            <div className="text-5xl mb-3">📝</div>
            <p className="text-muted-foreground">{lang === 'zh' ? '还没有可用的模拟考课程。等老师建好并发布后再来。' : 'No mock exam available yet.'}</p>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
        ) : (
          <div className="space-y-8">
            {groups.map(g => (
              <div key={g.id}>
                <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
                  <span>{theme.emoji}</span> {g.name}
                  <span className="text-xs font-normal text-muted-foreground">{g.papers.length} 套卷子</span>
                </h2>
                <div className="space-y-3">
                {g.papers.map(p => {
                  const r = p.lastResult
                  const live = r?.status === 'in_progress'
                  const done = r?.status === 'submitted'
                  return (
                    <div key={p.id} className="bg-card border rounded-2xl p-5 flex flex-wrap items-center gap-4">
                      <FileText className="w-6 h-6 text-violet-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-semibold truncate">{p.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {p.durationMinutes} 分钟</span>
                          <span>{p.questionCount} 题</span>
                          {done && (
                            <span className="flex items-center gap-1 text-emerald-700">
                              <BarChart3 className="w-3 h-3" /> 上次 {Number(r!.percentage ?? 0)}%
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="ml-auto flex items-center gap-2">
                        {done && (
                          <Link href={`/mock/${p.id}?review=1`}
                            className="px-3 py-2 text-xs rounded-lg border font-medium hover:bg-accent transition-colors">
                            {lang === 'zh' ? '看解析' : 'Review'}
                          </Link>
                        )}
                        <Link href={`/mock/${p.id}`}
                          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-white ${theme.solid}`}>
                          {live ? <><RotateCcw className="w-4 h-4" /> {lang === 'zh' ? '继续考试' : 'Resume'}</>
                                : <><Play className="w-4 h-4" /> {done ? (lang === 'zh' ? '再考一次' : 'Retake') : (lang === 'zh' ? '开始考试' : 'Start')}</>}
                        </Link>
                      </div>
                    </div>
                  )
                })}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}

export default function MockListPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>}>
      <MockListContent />
    </Suspense>
  )
}
