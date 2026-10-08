'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import ChemToolbar from '@/components/ChemToolbar'
import { KatexHtml, cleanOption, wrapBareLatex } from '@/components/KatexSpan'
import type { MockReview } from '@/lib/types'
import { kindTheme } from '@/lib/course-kind'
import { groupByStem, groupIndexOf, partLabel } from '@/lib/mock-groups'
import { ArrowLeft, Loader2, Clock, Check, X, BookOpen, Sparkles, WifiOff, Flag } from 'lucide-react'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const theme = kindTheme('mock')

interface ExamQuestion {
  questionId: string
  sortOrder: number
  stem: string
  groupStem?: string | null   // shared stem of a multi-part question
  imageUrl: string | null
  answerType?: 'choice' | 'short'
  selectedOptionId: string | null
  answerText?: string        // the student's own draft, never the reference
  flagged?: boolean
  options: { id: string; content: string }[]
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

// A retry shows the options in a different order, so a student cannot answer from
// memory of "it was the third one". Seeded by the session+question so the order
// stays put across re-renders and a page reload.
function hashSeed(str: string) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function shuffleSeeded<T>(arr: T[], seed: number): T[] {
  const a = [...arr]
  let s = seed || 1
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000 }
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function MockExamContent() {
  const { paperId } = useParams<{ paperId: string }>()
  const router = useRouter()
  const sp = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [phase, setPhase] = useState<'loading' | 'intro' | 'exam' | 'review'>('loading')
  const [title, setTitle] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [sessionMode, setSessionMode] = useState<'full' | 'retry'>('full')
  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [grading, setGrading] = useState<{ done: number; total: number } | null>(null)
  const [gradingError, setGradingError] = useState('')
  const [flags, setFlags] = useState<Record<string, boolean>>({})
  const [onlyFlagged, setOnlyFlagged] = useState(false)
  const [idx, setIdx] = useState(0)
  const [expiresAt, setExpiresAt] = useState('')
  const [durationSeconds, setDurationSeconds] = useState(0)
  const [serverOffset, setServerOffset] = useState(0)
  const [remaining, setRemaining] = useState(0)
  const [review, setReview] = useState<MockReview | null>(null)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'thisWrong' | 'everWrong' | 'repeatWrong' | 'never'>('all')
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)

  // AI panels
  const [kpFor, setKpFor] = useState<string | null>(null)
  const [kpText, setKpText] = useState('')
  const [practice, setPractice] = useState<any>(null)
  const [practiceChoice, setPracticeChoice] = useState<string | null>(null)
  const [practiceLoading, setPracticeLoading] = useState(false)

  const answerRef = useRef<HTMLTextAreaElement | null>(null)
  const submittedRef = useRef(false)
  const pendingSubmitRef = useRef(false)
  // Mirrors of the three above, so doSubmit can flush the on-screen draft
  // without being rebuilt (and re-triggering the countdown) on every keystroke.
  const questionsRef = useRef<ExamQuestion[]>([])
  const idxRef = useRef(0)
  const draftsRef = useRef<Record<string, string>>({})
  useEffect(() => { questionsRef.current = questions }, [questions])
  useEffect(() => { idxRef.current = idx }, [idx])
  useEffect(() => { draftsRef.current = drafts }, [drafts])

  const applyServerNow = (serverNow: string) => setServerOffset(new Date(serverNow).getTime() - Date.now())

  const gradeAndShow = useCallback((rev: MockReview) => {
    submittedRef.current = true
    pendingSubmitRef.current = false
    setReview(rev)
    setPhase('review')
    setBusy(false)
  }, [])

  /** Load a paper's questions into the three per-question maps. */
  const applyPaper = (qs: any[]) => {
    const list = qs || []
    setQuestions(list)
    setAnswers(Object.fromEntries(list.filter((q: any) => q.selectedOptionId).map((q: any) => [q.questionId, q.selectedOptionId])))
    setDrafts(Object.fromEntries(list.filter((q: any) => q.answerText).map((q: any) => [q.questionId, q.answerText])))
    setFlags(Object.fromEntries(list.filter((q: any) => q.flagged).map((q: any) => [q.questionId, true])))
  }

  /**
   * A free-response paper cannot be marked when it is handed in — the AI grades
   * it in batches afterwards, so the student waits a little before the score.
   * One request per batch, looping here, same shape as the paper importer.
   */
  const runGrading = useCallback(async (sid: string) => {
    setGradingError('')
    setGrading({ done: 0, total: 0 })
    let fails = 0
    for (let guard = 0; guard < 400; guard++) {
      let j: any
      try {
        const res = await fetch('/api/test/mock/grade', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sid }),
        })
        j = await res.json()
        if (!res.ok || j.error) { setGrading(null); setGradingError(j.error || String(res.status)); return }
      } catch { setGrading(null); setGradingError('网络中断，判分没完成'); return }

      if (j.review) { setGrading(null); gradeAndShow(j.review); return }
      if (j.failed) {
        // A stalled model call leaves the batch ungraded so it can be retried.
        if (++fails <= 4) continue
        setGrading(null); setGradingError('判分多次失败，请点「重试判分」'); return
      }
      fails = 0
      setGrading(g => {
        const done = (g?.done || 0) + (j.graded || 0)
        return { done, total: Math.max(g?.total || 0, done + (j.remaining || 0)) }
      })
    }
    setGrading(null); setGradingError('判分没有结束，请点「重试判分」')
  }, [gradeAndShow])

  const doSubmit = useCallback(async (reason: 'manual' | 'timeout') => {
    if (!sessionId || submittedRef.current) return
    setBusy(true)
    try {
      // Flush the answer currently on screen before handing in — a draft is only
      // written on blur, and 交卷 is usually clicked straight after typing.
      const cur = questionsRef.current[idxRef.current]
      if (cur?.answerType === 'short') {
        await fetch('/api/test/mock/answer', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, questionId: cur.questionId, answerText: draftsRef.current[cur.questionId] ?? '' }),
        }).catch(() => {})
      }
      const res = await fetch('/api/test/mock/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, reason }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { alert('交卷失败：' + (j.error || res.status)); setBusy(false); return }
      // A short paper comes back ungraded; grade it before showing anything.
      if (j.review?.grading) { setBusy(false); await runGrading(sessionId); return }
      gradeAndShow(j.review)
    } catch {
      // Offline — remember it and retry when the connection or tab comes back.
      pendingSubmitRef.current = true
      setOffline(true)
      setBusy(false)
    }
  }, [sessionId, gradeAndShow, runGrading])

  // ?mode=retry means "start a retest of my wrong questions" — it must NOT ask
  // for the current state, because the latest session is a submitted one and the
  // page would jump straight to the review instead of starting anything.
  const wantRetry = sp.get('mode') === 'retry'

  // ── load: decide between intro / resume / review
  useEffect(() => {
    if (!user || !paperId) return
    if (wantRetry) { setSessionMode('retry'); setPhase('intro'); return }
    ;(async () => {
      try {
        const j = await (await fetch(`/api/test/mock/start?paperId=${paperId}`)).json()
        if (j.serverNow) applyServerNow(j.serverNow)
        if (j.state === 'submitted') {
          setReview(j.review); setPhase('review')
          // Handed in but not fully graded (they closed the tab mid-grading) —
          // pick the grading back up rather than showing a half score.
          if (j.review?.grading) await runGrading(j.review.sessionId)
          return
        }
        if (j.state === 'in_progress') {
          setSessionId(j.sessionId)
          applyPaper(j.questions)
          setSessionMode(j.mode === 'retry' ? 'retry' : 'full')
          setExpiresAt(j.expiresAt); setDurationSeconds(j.durationSeconds ?? 0)
          setPhase('exam'); return
        }
        setPhase('intro')
      } catch { setPhase('intro') }
    })()
  }, [user, paperId, runGrading])

  const startExam = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/test/mock/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId, mode: wantRetry ? 'retry' : 'full' }),
      })
      const j = await res.json()
      if (!res.ok || j.error) {
        alert(j.empty ? '这份卷子已经全部答对了，没有错题需要重测 🎉' : '开考失败：' + (j.error || res.status))
        if (j.empty) router.replace(`/mock/${paperId}`)
        return
      }
      applyServerNow(j.serverNow)
      setSessionId(j.sessionId); setTitle(j.title)
      applyPaper(j.questions)
      setSessionMode(j.mode === 'retry' ? 'retry' : 'full')
      setExpiresAt(j.expiresAt); setDurationSeconds(j.durationSeconds ?? 0)
      setIdx(0); setPhase('exam')
    } catch (e: any) {
      alert('开考出错：' + (e?.message || e))
    } finally { setBusy(false) }
  }

  // In a retest the options are re-ordered per question. Deterministic on
  // session+question, so the order does not change on re-render or reload.
  const shownOptions = useMemo(() => {
    const map = new Map<string, { id: string; content: string }[]>()
    for (const q of questions) {
      map.set(q.questionId, sessionMode === 'retry'
        ? shuffleSeeded(q.options, hashSeed(sessionId + q.questionId))
        : q.options)
    }
    return map
  }, [questions, sessionMode, sessionId])

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

  // The answer endpoint grades the paper when it notices the deadline has
  // passed. A short paper comes back ungraded, so it still needs the loop.
  const showReturnedReview = useCallback((rev: MockReview) => {
    if (rev?.grading) { setReview(rev); setPhase('review'); runGrading(rev.sessionId) }
    else gradeAndShow(rev)
  }, [gradeAndShow, runGrading])

  const choose = async (q: ExamQuestion, optionId: string) => {
    // Optimistic: the selection shows immediately, the write happens behind it.
    setAnswers(prev => ({ ...prev, [q.questionId]: optionId }))
    try {
      const res = await fetch('/api/test/mock/answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questionId: q.questionId, selectedOptionId: optionId }),
      })
      const j = await res.json()
      if (j.expired || j.submitted) { showReturnedReview(j.review); return }
      if (j.serverNow) applyServerNow(j.serverNow)
      setOffline(false)
    } catch {
      setOffline(true)   // kept locally; the next successful write catches up
    }
  }

  // A free-response draft: typing only touches local state, the write happens on
  // blur, so a long answer is not one request per keystroke.
  const saveDraft = async (q: ExamQuestion, text: string) => {
    setDrafts(prev => ({ ...prev, [q.questionId]: text }))
    try {
      const res = await fetch('/api/test/mock/answer', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, questionId: q.questionId, answerText: text }),
      })
      const j = await res.json()
      if (j.expired || j.submitted) { showReturnedReview(j.review); return }
      if (j.serverNow) applyServerNow(j.serverNow)
      setOffline(false)
    } catch {
      setOffline(true)
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
      if (j.expired || j.submitted) showReturnedReview(j.review)
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

  // A choice question is answered by picking an option, a short one by writing
  // something non-blank.
  const isDone = (q: ExamQuestion) => q.answerType === 'short'
    ? !!String(drafts[q.questionId] ?? '').trim()
    : !!answers[q.questionId]
  const answeredCount = useMemo(
    () => questions.filter(isDone).length,
    [questions, answers, drafts],
  )
  const cur = questions[idx]
  // A multi-part question is a run of consecutive questions sharing a stem —
  // shown as one row "第 2 题 [2a][2b][2c]" so it is clear which parts belong
  // together.
  const groups = useMemo(() => groupByStem(questions), [questions])
  const groupOf = useMemo(() => groupIndexOf(groups), [groups])
  const curGroupIdx = cur ? (groupOf.get(cur.questionId) ?? -1) : -1
  // The review shows the whole paper, so its labels come from the paper's own
  // grouping — not from the position in the (filtered) list on screen.
  const reviewGroups = useMemo(() => groupByStem(review?.questions ?? []), [review])
  const reviewLabel = useMemo(() => {
    const m = new Map<string, string>()
    reviewGroups.forEach((g, gi) => g.items.forEach((q, si) => m.set(q.questionId, partLabel(gi, si, g.items.length))))
    return m
  }, [reviewGroups])
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
          <h1 className="text-2xl font-bold mb-2">{sessionMode === 'retry' ? '错题重测' : '开始模拟考'}</h1>
          <p className="text-muted-foreground mb-6">
            {sessionMode === 'retry'
              ? '只考你之前没答对的题（含空着没答的），已经答对的不再出现。题目顺序和选项顺序都重新打乱，别凭印象选。可以反复重测，直到全部答对。'
              : '倒计时开始后，答题过程中不会显示对错。可以点题号回到任意一题检查或改答案，交卷（或倒计时结束）之后才看得到分数和错题。'}
          </p>
          <button onClick={startExam} disabled={busy}
            className={`px-8 py-3 rounded-xl text-white font-semibold disabled:opacity-50 ${theme.solid}`}>
            {busy ? '准备中…' : '开始考试'}
          </button>
        </main>
      </div>
    )
  }

  // ── grading (free-response papers only)
  if (grading || gradingError) {
    const pct = grading && grading.total ? Math.round((grading.done / grading.total) * 100) : 5
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-xl mx-auto px-4 pt-32 pb-24 text-center">
          <div className="text-5xl mb-4">📝</div>
          <h1 className="text-xl font-bold mb-2">交卷了，正在判分</h1>
          {gradingError ? (
            <>
              <p className="text-muted-foreground mb-5">{gradingError}</p>
              <button onClick={() => runGrading(review?.sessionId || sessionId)}
                className={`px-6 py-2.5 rounded-xl text-white font-medium ${theme.solid}`}>重试判分</button>
            </>
          ) : (
            <>
              <p className="text-muted-foreground mb-5">
                简答题由 AI 对照参考答案逐题判定，几十道题要分批跑，请稍候。
              </p>
              <div className="h-2 rounded-full bg-gray-200 overflow-hidden mb-2">
                <div className="h-full bg-violet-500 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <p className="text-sm tabular-nums text-muted-foreground">
                {grading!.done} / {grading!.total || '…'} 题
              </p>
            </>
          )}
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

          <div className="bg-card border rounded-2xl p-6 mb-6">
            <div className="text-center">
              <div className="text-sm text-muted-foreground mb-1">{review.paperTitle}</div>
              {/* Cumulative mastery — how much of the whole paper is now correct. */}
              <div className={`text-5xl font-bold ${theme.text}`}>{review.score.percentage}%</div>
              <div className="text-sm text-muted-foreground mt-2">
                全卷 {review.score.total} 题，已答对 {review.score.correct} 题
                {review.score.unanswered > 0 && ` · 还没答对 ${review.score.unanswered} 题`}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                本次用时 {fmt(review.usedSeconds)} / {fmt(review.durationSeconds)}
                {review.submitReason === 'timeout' && ' · 倒计时结束自动交卷'}
              </div>
            </div>

            {/* 历次成绩：每次的对/总，以及到目前为止全卷累计答对了多少 */}
            {review.attempts.length > 0 && (
              <div className="mt-5 pt-4 border-t">
                <div className="text-xs text-muted-foreground mb-2">历次成绩</div>
                <div className="space-y-1">
                  {review.attempts.map(a => (
                    <div key={a.sessionId}
                      className={`flex items-center gap-3 text-sm rounded-lg px-2 py-1 ${a.sessionId === review.sessionId ? 'bg-violet-50' : ''}`}>
                      <span className="w-14 shrink-0 text-muted-foreground">
                        第 {a.n} 次{a.mode === 'retry' ? '（重测）' : ''}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {a.correctInAttempt}/{a.totalInAttempt}
                      </span>
                      <span className="ml-auto tabular-nums font-medium">
                        {a.cumulativeCorrect}/{review.score.total}
                        <span className={a.cumulativePercentage >= 60 ? ' text-emerald-700' : ' text-rose-600'}>
                          {' '}{a.cumulativePercentage}%
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-2">
                  百分比是**全卷累计**：一道题只要答对过一次就算对（比如第 2 次是 70 题里答对 3 道，但加上第 1 次已对的 5 道，累计是 8/75）。
                </p>
              </div>
            )}
          </div>

          {/* Filter the review down to what needs attention — with a few retests
              behind them, "which ones am I still getting wrong" is the question. */}
          <div className="flex flex-wrap items-center gap-1.5 mb-3">
            {([
              ['all', '全部', review.questions.length],
              ['thisWrong', '本次做错', review.questions.filter(q => !q.isCorrect && !q.notInThisSession).length],
              ['everWrong', '错过', review.questions.filter(q => (q.wrongTimes ?? 0) > 0).length],
              ['repeatWrong', '反复错', review.questions.filter(q => (q.wrongTimes ?? 0) >= 2).length],
              ['never', '至今没答对', review.questions.filter(q => q.firstCorrectAttempt == null).length],
            ] as const).map(([k, label, n]) => (
              <button key={k} onClick={() => setReviewFilter(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  reviewFilter === k ? 'bg-violet-500 border-violet-500 text-white' : 'hover:bg-accent text-muted-foreground'}`}>
                {label} ({n})
              </button>
            ))}
          </div>

          <div className="space-y-3">
            {review.questions.filter(q => {
              if (reviewFilter === 'thisWrong') return !q.isCorrect && !q.notInThisSession
              if (reviewFilter === 'everWrong') return (q.wrongTimes ?? 0) > 0
              if (reviewFilter === 'repeatWrong') return (q.wrongTimes ?? 0) >= 2
              if (reviewFilter === 'never') return q.firstCorrectAttempt == null
              return true
            }).map((q, i) => (
              <div key={q.questionId} className="bg-card border rounded-2xl p-4">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className={`min-w-7 h-7 px-1 rounded-lg text-sm font-semibold flex items-center justify-center shrink-0 ${q.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {reviewLabel.get(q.questionId) ?? i + 1}
                  </span>
                  {q.isCorrect ? <Check className="w-4 h-4 text-emerald-600" /> : <X className="w-4 h-4 text-rose-600" />}
                  {q.flagged && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 flex items-center gap-1">
                      <Flag className="w-3 h-3" /> 考试时标记过
                    </span>
                  )}
                  {/* Across all attempts, not just this one. */}
                  {q.notInThisSession && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                      本次未考（之前已答对）
                    </span>
                  )}
                  {q.firstCorrectAttempt == null ? (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                      至今没答对（错 {q.wrongTimes} 次）
                    </span>
                  ) : (
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      q.firstCorrectAttempt === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                      {q.firstCorrectAttempt === 1 ? '第一次就答对' : `第 ${q.firstCorrectAttempt} 次才答对`}
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

                {q.groupStem && (
                  <div className="mb-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-sm">
                    <div className="text-xs text-muted-foreground mb-1">这道大题共同的题干</div>
                    <KatexHtml text={q.groupStem} />
                  </div>
                )}
                <div className="text-sm mb-2"><KatexHtml text={q.stem} /></div>
                {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-2 max-h-56 rounded-lg border bg-white" />}

                <div className="space-y-1">
                  {q.answerType === 'short' ? (
                    <div className="space-y-2 text-sm">
                      <div className={`px-3 py-2 rounded-lg border ${q.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
                        <div className="text-xs text-muted-foreground mb-1">我的作答</div>
                        <div className="whitespace-pre-wrap">
                          {q.myAnswer ? q.myAnswer : <span className="text-muted-foreground">（未作答）</span>}
                        </div>
                      </div>
                      {q.referenceAnswer && (
                        <div className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/60">
                          <div className="text-xs text-muted-foreground mb-1">参考答案</div>
                          <div className="whitespace-pre-wrap"><KatexHtml text={wrapBareLatex(q.referenceAnswer)} /></div>
                        </div>
                      )}
                      {q.feedback && (
                        <div className="px-3 py-2 rounded-lg bg-gray-50 text-muted-foreground">
                          <span className="text-xs">AI 批语：</span>{q.feedback}
                        </div>
                      )}
                    </div>
                  ) : (
                  q.options.map((o, oi) => {
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
                  })
                  )}
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
          <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center overflow-y-auto p-4">
            <div className="bg-card rounded-2xl w-full max-w-2xl my-8 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" /> 知识点总结</h3>
                <button onClick={() => setKpFor(null)} title="关闭"
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
              </div>
              {kpText ? <div className="text-sm leading-relaxed"><KatexHtml text={kpText} /></div>
                      : <div className="py-8 text-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin inline" /> 生成中…</div>}
            </div>
          </div>
        )}

        {/* similar practice */}
        {(practice || practiceLoading) && (
          <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center overflow-y-auto p-4">
            <div className="bg-card rounded-2xl w-full max-w-2xl my-8 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2"><BookOpen className="w-4 h-4 text-violet-500" /> 同类型题目</h3>
                <button onClick={() => { setPractice(null); setPracticeChoice(null) }} title="关闭"
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
              </div>
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
          <span className="font-semibold truncate">
            {sessionMode === 'retry' && <span className="text-violet-600">错题重测 · </span>}
            {title}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">已答 {answeredCount}/{questions.length}</span>
          {/* Submit sits next to the clock: the two things a student looks for
              when deciding whether to stop. */}
          <button onClick={() => { if (confirm(`还有 ${questions.length - answeredCount} 题没作答。确定交卷？`)) doSubmit('manual') }}
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
            {/* A multi-part question's shared material, shown once above its parts */}
            {cur.groupStem && (
              <div className="mb-3 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm">
                <div className="text-xs text-muted-foreground mb-1.5">
                  第 {curGroupIdx + 1} 题的共同题干（下面各小问共用）
                </div>
                <KatexHtml text={cur.groupStem} />
              </div>
            )}
            <div className="text-base mb-3"><KatexHtml text={cur.stem} /></div>
            {cur.imageUrl && <img src={cur.imageUrl} alt="" className="mb-3 max-h-72 rounded-lg border bg-white" />}
            <div className="space-y-2">
              {cur.answerType === 'short' ? (
                <>
                  <ChemToolbar
                    value={drafts[cur.questionId] ?? ''}
                    onChange={next => setDrafts(prev => ({ ...prev, [cur.questionId]: next }))}
                    textareaRef={answerRef} />
                  <textarea
                    ref={answerRef}
                    value={drafts[cur.questionId] ?? ''}
                    onChange={e => setDrafts(prev => ({ ...prev, [cur.questionId]: e.target.value }))}
                    onBlur={e => saveDraft(cur, e.target.value)}
                    rows={7}
                    placeholder="把你的解答写在这里（文字、计算过程或结论都可以）"
                    className="w-full px-3 py-2.5 border rounded-xl bg-background text-sm outline-none focus:ring-2 focus:ring-violet-400" />
                  <p className="text-xs text-muted-foreground">
                    判分的是 AI，它看的是化学含义，所以直接写 <code>CH3NH2</code>、<code>10^-4</code> 这种普通写法也认。
                    下标/上标可以点上面的按钮。离开这一题时自动保存。
                  </p>
                </>
              ) : (
              (shownOptions.get(cur.questionId) || cur.options).map((o, oi) => {
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
              })
              )}
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
        <div className="space-y-1">
          {groups.map((g, gi) => {
            const multi = g.items.length > 1
            const shown = g.items.map((q, si) => ({ q, i: g.start + si })).filter(({ q }) => !onlyFlagged || flags[q.questionId])
            if (shown.length === 0) return null
            return (
              <div key={gi} className="flex flex-wrap items-center gap-1.5">
                <span className={`w-14 shrink-0 text-xs ${multi ? 'text-muted-foreground' : ''}`}>
                  {multi ? `第 ${gi + 1} 题` : ''}
                </span>
                {shown.map(({ q, i }) => {
                  const done = isDone(q)
                  const on = !!flags[q.questionId]
                  return (
                    <button key={q.questionId} onClick={() => setIdx(i)}
                      className={`h-8 min-w-8 px-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        i === idx ? 'ring-2 ring-violet-400 ' : ''
                      }${on ? 'bg-amber-400 border-amber-400 text-white' : done ? 'bg-violet-500 border-violet-500 text-white' : 'bg-card hover:bg-accent text-muted-foreground'}`}>
                      {partLabel(gi, i - g.start, g.items.length)}
                    </button>
                  )
                })}
              </div>
            )
          })}
          <button onClick={() => setOnlyFlagged(v => !v)}
            className={`px-2.5 h-8 rounded-lg text-xs border font-medium transition-colors ${onlyFlagged ? 'bg-amber-400 border-amber-400 text-white' : 'hover:bg-accent text-muted-foreground'}`}>
            {onlyFlagged ? '显示全部' : `只看标记 (${Object.values(flags).filter(Boolean).length})`}
          </button>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          紫色 = 已作答，黄色 = 你标记过的。同一行的小问属于同一道大题。答案随时在保存，中途刷新或换设备都能接着答；交卷后才显示对错。
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
