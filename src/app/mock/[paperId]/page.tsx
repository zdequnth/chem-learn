'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import type { MockReview } from '@/lib/types'
import { kindTheme } from '@/lib/course-kind'
import { ArrowLeft, Loader2, Clock, Check, X, BookOpen, Sparkles, WifiOff, Flag } from 'lucide-react'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const theme = kindTheme('mock')

interface ExamQuestion {
  questionId: string
  sortOrder: number
  stem: string
  imageUrl: string | null
  selectedOptionId: string | null
  flagged?: boolean
  options: { id: string; content: string }[]
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

function MockExamContent() {
  const { paperId } = useParams<{ paperId: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [phase, setPhase] = useState<'loading' | 'intro' | 'exam' | 'review'>('loading')
  const [title, setTitle] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [idx, setIdx] = useState(0)
  const [expiresAt, setExpiresAt] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [serverOffset, setServerOffset] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [review, setReview] = useState<MockReview | null>(null)
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)

  // AI panels
  const [kpFor, setKpFor] = useState<string | null>(null)
  const [kpText, setKpText] = useState('')
  const [practice, setPractice] = useState<any>(null)
  const [practiceChoice, setPracticeChoice] = useState<string | null>(null)
  const [practiceLoading, setPracticeLoading] = useState(false)

  const submittedRef = useRef(false)
  const pendingSubmitRef = useRef(false)

  const applyServerNow = (serverNow: string) => setServerOffset(new Date(serverNow).getTime() - Date.now())

  const gradeAndShow = useCallback((rev: MockReview) => {
    submittedRef.current = true
    pendingSubmitRef.current = false
    setReview(rev)
    setPhase('review')
    setBusy(false)
  }, [])

  const doSubmit = useCallback(async (reason: 'manual' | 'timeout') => {
    if (!sessionId || submittedRef.current) return
    setBusy(true)
    try {
      const res = await fetch('/api/test/mock/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, reason }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { alert('交卷失败：' + (j.error || res.status)); setBusy(false); return }
      gradeAndShow(j.review)
    } catch {
      // Offline — remember it and retry when the connection or tab comes back.
      pendingSubmitRef.current = true
      setOffline(true)
      setBusy(false)
    }
  }, [sessionId, gradeAndShow])

  // ── load: decide between intro / resume / review
  useEffect(() => {
    if (!user || !paperId) return
    (async () => {
      try {
        const j = await (await fetch(`/api/test/mock/start?paperId=${paperId}`)).json()
        if (j.serverNow) applyServerNow(j.serverNow)
        if (j.state === 'submitted') { setReview(j.review); setPhase('review'); return }
        if (j.state === 'in_progress') {
          setSessionId(j.sessionId); setQuestions(j.questions || [])
          setAnswers(Object.fromEntries((j.questions || []).filter((q: any) => q.selectedOptionId).map((q: any) => [q.questionId, q.selectedOptionId])))
          setFlags(Object.fromEntries((j.questions || []).filter((q: any) => q.flagged).map((q: any) => [q.questionId, true])))
          setExpiresAt(j.expiresAt); setDurationSeconds(j.durationSeconds ?? 0)
          setPhase('exam'); return
        }
        setPhase('intro')
      } catch { setPhase('intro') }
    })()
  }, [user, paperId])

  const startExam = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/test/mock/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { alert('开考失败：' + (j.error || res.status)); return }
      applyServerNow(j.serverNow)
      setSessionId(j.sessionId); setTitle(j.title); setQuestions(j.questions || [])
      setAnswers(Object.fromEntries((j.questions || []).filter((q: any) => q.selectedOptionId).map((q: any) => [q.questionId, q.selectedOptionId])))
      setFlags(Object.fromEntries((j.questions || []).filter((q: any) => q.flagged).map((q: any) => [q.questionId, true])))
      setExpiresAt(j.expiresAt); setDurationSeconds(j.durationSeconds ?? 0)
      setIdx(0); setPhase('exam')
    } catch (e: any) {
      alert('开考出错：' + (e?.message || e))
    } finally { setBusy(false) }
  }

  // ── countdown, driven by the server's clock rather than the device's
  useEffect(() => {
    if (phase !== 'exam' || !expiresAt) return
    const tick = () => {
      const left = (new Date(expiresAt).getTime() - (Date.now() + serverOffset)) / 1000
      setRemaining(left)
      if (left <= 0) doSubmit('timeout')
    }
    tick()
    const t = setInterval(tick, 1000)
    return () => clearInterval(t)
  }, [phase, expiresAt, serverOffset, doSubmit])

  // retry a submit that failed while offline
  useEffect(() => {
    if (phase !== 'exam') return
    const retry = () => { if (pendingSubmitRef.current) doSubmit('timeout') }
    window.addEventListener('online', retry)
    const onVisible = () => { if (document.visibilityState === 'visible') retry() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('online', retry); document.removeEventListener('visibilitychange', onVisible) }
  }, [phase, doSubmit])

  const choose = async (q: ExamQuestion, optionId: string) => {
    // Optimistic: the selection shows immediately, the write happens behind it.
    setAnswers(prev => ({ ...prev, [q.questionId]: optionId }))
    try {
      const res = await fetch('/api/test/mock/answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questionId: q.questionId, selectedOptionId: optionId }),
      })
      const j = await res.json()
      if (j.expired || j.submitted) { gradeAndShow(j.review); return }
      if (j.serverNow) applyServerNow(j.serverNow)
      setOffline(false)
    } catch {
      setOffline(true)   // kept locally; the next successful write catches up
    }
  }

  // Flagging is its own action: it must not disturb the answer, so the request
  // carries only `flagged`.
  const toggleFlag = async (q: ExamQuestion) => {
    const next = !flags[q.questionId]
    setFlags(prev => ({ ...prev, [q.questionId]: next }))
    try {
      const res = await fetch('/api/test/mock/answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questionId: q.questionId, flagged: next }),
      })
      const j = await res.json()
      if (j.expired || j.submitted) gradeAndShow(j.review)
    } catch { /* kept locally; the exam does not depend on this landing */ }
  }

  const openKp = async (questionId: string, stem: string, explanation: string) => {
    if (kpFor) return
    setKpFor(questionId); setKpText('')
    try {
      const j = await (await fetch('/api/ai/generate-kp-from-question', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stem, explanation }),
      })).json()
      setKpText(j.error ? '生成失败：' + j.error : (j.result || ''))
    } catch { setKpText('生成失败') }
  }

  const openPractice = async (questionId: string) => {
    setPracticeLoading(true); setPracticeChoice(null); setPractice(null)
    try {
      const j = await (await fetch(`/api/student/similar-question?questionId=${questionId}`)).json()
      if (j.error) { alert(j.error); return }
      if (!j.question) { alert('题库里暂时没有同类型的题目可以练。'); return }
      setPractice(j.question)
    } finally { setPracticeLoading(false) }
  }

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers])
  const cur = questions[idx]
  const lowTime = remaining <= 300

  if (authLoading || phase === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
  }

  // ── intro
  if (phase === 'intro') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 pt-28 pb-24 text-center">
          <div className="text-6xl mb-4">{theme.emoji}</div>
          <h1 className="text-2xl font-bold mb-2">开始模拟考</h1>
          <p className="text-muted-foreground mb-6">
            倒计时开始后，答题过程中不会显示对错。可以点题号回到任意一题检查或改答案，
            交卷（或倒计时结束）之后才看得到分数和错题。
          </p>
          <button onClick={startExam} disabled={busy}
            className={`px-8 py-3 rounded-xl text-white font-semibold disabled:opacity-50 ${theme.solid}`}>
            {busy ? '准备中…' : '开始考试'}
          </button>
        </main>
      </div>
    )
  }

  // ── review
  if (phase === 'review' && review) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-3xl mx-auto px-4 pt-24 pb-24">
          <Link href="/mock" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4" /> 返回模拟考列表
          </Link>

          <div className="bg-card border rounded-2xl p-6 mb-6 text-center">
            <div className="text-sm text-muted-foreground mb-1">{review.paperTitle}</div>
            <div className={`text-5xl font-bold ${theme.text}`}>{review.score.percentage}%</div>
            <div className="text-sm text-muted-foreground mt-2">
              答对 {review.score.correct} / {review.score.total} 题
              {review.score.unanswered > 0 && ` · 未作答 ${review.score.unanswered} 题`}
              {review.submitReason === 'timeout' && ' · 倒计时结束自动交卷'}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              用时 {fmt(review.usedSeconds)} / {fmt(review.durationSeconds)}
            </div>
          </div>

          <div className="space-y-3">
            {review.questions.map((q, i) => (
              <div key={q.questionId} className="bg-card border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`w-7 h-7 rounded-lg text-sm font-semibold flex items-center justify-center shrink-0 ${q.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{i + 1}</span>
                  {q.isCorrect ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-rose-600" />}
                  {q.flagged && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                      <Flag className="w-3 h-3" /> 考试时标记过
                    </span>
                  )}
                  {/* Links to the lesson's page, where its knowledge points and
                      video links live — the whole point of tagging each question
                      with the lesson it belongs to. */}
                  {q.lessonId && (q.chapterTitle || q.lessonTitle) && (
                    <Link href={`/play/${q.lessonId}`} title="去这一课复习知识点"
                      className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-800 underline decoration-dotted underline-offset-2 transition-colors">
                      {q.chapterTitle}{q.lessonRef ? ` › ${q.lessonRef}` : ''} {q.lessonTitle} ↗
                    </Link>
                  )}
                </div>

                <div className="text-sm mb-2"><KatexHtml text={q.stem} /></div>
                {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-2 max-h-56 rounded-lg border bg-white" />}

                <div className="space-y-1">
                  {q.options.map((o, oi) => {
                    const isCorrect = o.id === q.correctOptionId
                    const picked = o.id === q.selectedOptionId
                    return (
                      <div key={o.id}
                        className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-sm border ${
                          isCorrect ? 'bg-emerald-50 border-emerald-200'
                          : picked ? 'bg-rose-50 border-rose-200' : 'border-transparent'}`}>
                        <span className="font-medium text-muted-foreground shrink-0">{LETTERS[oi]}.</span>
                        <span className="flex-1"><KatexHtml text={cleanOption(o.content)} /></span>
                        {isCorrect && <span className="text-xs text-emerald-700 shrink-0">正确答案</span>}
                        {picked && !isCorrect && <span className="text-xs text-rose-700 shrink-0">你选的</span>}
                      </div>
                    )
                  })}
                </div>

                {q.explanation && (
                  <div className="mt-2 px-3 py-2 bg-gray-50 rounded-lg text-sm text-muted-foreground">
                    <KatexHtml text={q.explanation} />
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3">
                  <button onClick={() => openKp(q.questionId, q.stem, q.explanation)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border hover:bg-accent transition-colors">
                    <Sparkles className="w-3.5 h-3.5 text-violet-500" /> AI 生成知识点
                  </button>
                  <button onClick={() => openPractice(q.questionId)}
                    className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border hover:bg-accent transition-colors">
                    <BookOpen className="w-3.5 h-3.5 text-violet-500" /> 同类型题目重复训练
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>

        {/* knowledge point */}
        {kpFor && (
          <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setKpFor(null)}>
            <div className="bg-card rounded-2xl w-full max-w-2xl my-8 p-5" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" /> 知识点总结</h3>
              {kpText ? <div className="text-sm leading-relaxed"><KatexHtml text={kpText} /></div>
                      : <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> 生成中…</div>}
            </div>
          </div>
        )}

        {/* similar practice */}
        {(practice || practiceLoading) && (
          <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center overflow-y-auto p-4" onClick={() => { setPractice(null); setPracticeChoice(null) }}>
            <div className="bg-card rounded-2xl w-full max-w-2xl my-8 p-5" onClick={e => e.stopPropagation()}>
              <h3 className="font-semibold mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-500" /> 同类型题目</h3>
              {practiceLoading || !practice ? (
                <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> 找题中…</div>
              ) : (
                <>
                  <div className="text-sm mb-2"><KatexHtml text={practice.stem} /></div>
                  {practice.imageUrl && <img src={practice.imageUrl} alt="" className="mb-2 max-h-56 rounded-lg border bg-white" />}
                  <div className="space-y-1">
                    {(practice.options || []).map((o: any, oi: number) => {
                      const chosen = practiceChoice === o.id
                      const revealed = practiceChoice !== null
                      const right = revealed && o.isCorrect
                      const wrong = revealed && chosen && !o.isCorrect
                      return (
                        <button key={o.id} disabled={revealed}
                          onClick={() => setPracticeChoice(o.id)}
                          className={`w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-sm border transition-colors ${
                            right ? 'bg-emerald-50 border-emerald-200' : wrong ? 'bg-rose-50 border-rose-200' : 'hover:bg-accent'}`}>
                          <span className="font-medium text-muted-foreground shrink-0">{LETTERS[oi]}.</span>
                          <span className="flex-1"><KatexHtml text={cleanOption(o.content)} /></span>
                        </button>
                      )
                    })}
                  </div>
                  {practiceChoice && practice.explanation && (
                    <div className="mt-3 px-3 py-2 bg-gray-50 rounded-lg text-sm"><KatexHtml text={practice.explanation} /></div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── exam
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 pt-24 pb-32">
        <div className="sticky top-16 z-30 bg-card border rounded-2xl px-4 py-3 mb-4 flex items-center gap-3">
          <span className="font-semibold truncate">{title}</span>
          <span className="text-xs text-muted-foreground shrink-0">已答 {answeredCount}/{questions.length}</span>
          {/* Submit sits next to the clock: the two things a student looks for
              when deciding whether to stop. */}
          <button onClick={() => { const n = Object.keys(answers).length; if (confirm(`还有 ${questions.length - n} 题没作答。确定交卷？`)) doSubmit('manual') }}
            disabled={busy}
            className={`ml-auto shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${theme.solid}`}>
            {busy ? '交卷中…' : '交卷'}
          </button>
          <span className={`flex items-center gap-1.5 tabular-nums font-semibold shrink-0 ${lowTime ? 'text-rose-600' : theme.text}`}>
            <Clock className="w-4 h-4" /> {fmt(remaining)}
          </span>
        </div>

        {offline && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
            <WifiOff className="w-4 h-4" /> 网络不稳定：答案先存在本机，联网后会自动补传。
          </div>
        )}

        {/* The question comes first — the palette below is for jumping around,
            not for reading. */}
        {cur && (
          <div className="bg-card border rounded-2xl p-5 mb-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-muted-foreground">第 {idx + 1} 题 / 共 {questions.length} 题</span>
              <button onClick={() => toggleFlag(cur)}
                className={`ml-auto flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium border transition-colors ${
                  flags[cur.questionId] ? 'bg-amber-400 border-amber-400 text-white' : 'hover:bg-accent text-muted-foreground'}`}>
                <Flag className="w-4 h-4" />
                {flags[cur.questionId] ? '已标记（回头再看）' : '标记这题'}
              </button>
            </div>
            <div className="text-base mb-3"><KatexHtml text={cur.stem} /></div>
            {cur.imageUrl && <img src={cur.imageUrl} alt="" className="mb-3 max-h-72 rounded-lg border bg-white" />}
            <div className="space-y-2">
              {cur.options.map((o, oi) => {
                const picked = answers[cur.questionId] === o.id
                return (
                  <button key={o.id} onClick={() => choose(cur, o.id)}
                    className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl border transition-colors ${
                      picked ? 'bg-violet-50 border-violet-400' : 'hover:bg-accent'}`}>
                    <span className={`w-6 h-6 rounded-full border text-xs font-semibold flex items-center justify-center shrink-0 ${picked ? 'bg-violet-500 border-violet-500 text-white' : 'text-muted-foreground'}`}>
                      {LETTERS[oi]}
                    </span>
                    <span className="flex-1 text-sm"><KatexHtml text={cleanOption(o.content)} /></span>
                  </button>
                )
              })}
            </div>

            <div className="flex items-center justify-center gap-3 mt-6">
              <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                className="px-6 py-2 border rounded-lg text-sm hover:bg-accent disabled:opacity-40">上一题</button>
              <button onClick={() => setIdx(i => Math.min(questions.length - 1, i + 1))} disabled={idx === questions.length - 1}
                className="px-6 py-2 border rounded-lg text-sm hover:bg-accent disabled:opacity-40">下一题</button>
            </div>
          </div>
        )}

        {/* question number palette. Flagged questions are filled yellow, so the
            ones to come back to stand out among the answered (violet) ones. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {questions.map((q, i) => {
            const done = !!answers[q.questionId]
            const on = !!flags[q.questionId]
            if (onlyFlagged && !on) return null
            return (
              <button key={q.questionId} onClick={() => setIdx(i)}
                className={`w-9 h-9 rounded-lg text-xs font-medium border transition-colors ${
                  i === idx ? 'ring-2 ring-violet-400 ' : ''
                }${on ? 'bg-amber-400 border-amber-400 text-white' : done ? 'bg-violet-500 border-violet-500 text-white' : 'bg-card hover:bg-accent text-muted-foreground'}`}>
                {i + 1}
              </button>
            )
          })}
          <button onClick={() => setOnlyFlagged(v => !v)}
            className={`ml-1 px-2.5 h-9 rounded-lg text-xs border font-medium transition-colors ${onlyFlagged ? 'bg-amber-400 border-amber-400 text-white' : 'hover:bg-accent text-muted-foreground'}`}>
            {onlyFlagged ? '显示全部' : `只看标记 (${Object.values(flags).filter(Boolean).length})`}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          紫色 = 已作答，黄色 = 你标记过的。答案随时在保存，中途刷新或换设备都能接着答；交卷后才显示对错。
        </p>
      </main>
    </div>
  )
}

export default function MockExamPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>}>
      <MockExamContent />
    </Suspense>
  )
}
