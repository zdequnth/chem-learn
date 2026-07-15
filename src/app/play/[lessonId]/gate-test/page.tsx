'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import { ArrowLeft, CheckCircle, XCircle, Clock, Loader2, Star, AlertTriangle } from 'lucide-react'

interface GateTestQuestion {
  id: string
  stem: string
  explanation: string
  imageUrl: string | null
  options: { id: string; content: string }[]
}

interface GateTestStats {
  questionsAsked: number
  consecutiveCorrect: number
  totalCorrect: number
  totalWrong: number
  accuracy: number
}

export default function GateTestPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [sessionId, setSessionId] = useState<string | null>(null)
  const [question, setQuestion] = useState<GateTestQuestion | null>(null)
  const [stats, setStats] = useState<GateTestStats>({
    questionsAsked: 0, consecutiveCorrect: 0, totalCorrect: 0, totalWrong: 0, accuracy: 0,
  })
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<{ passed: boolean; stars: number; lockedUntil?: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lockedMinutes, setLockedMinutes] = useState(0)
  const [initialLocked, setInitialLocked] = useState(false)
  const [questionNumber, setQuestionNumber] = useState(0)
  const [prefetchedQuestion, setPrefetchedQuestion] = useState<any>(null)

  useEffect(() => {
    if (!authLoading && !user) { router.push('/login') }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    startGateTest()
  }, [user])

  const startGateTest = async () => {
    const res = await fetch('/api/test/gate-test/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonId }),
    })
    const data = await res.json()

    if (data.error) {
      if (data.lockedUntil) {
        setError(`测试已锁定，${data.minutesRemaining} 分钟后可重试`)
        setInitialLocked(true)
        setLockedMinutes(data.minutesRemaining)
      } else {
        setError(data.error)
      }
      setLoading(false)
      return
    }

    setSessionId(data.sessionId)
    fetchNextQuestion(data.sessionId)
  }

  const fetchNextQuestion = async (sid?: string) => {
    // Use prefetched question if available
    if (prefetchedQuestion && !sid) {
      setQuestion(prefetchedQuestion)
      setQuestionNumber(prev => prev + 1)
      setSelectedOption(null)
      setIsAnswered(false)
      setIsCorrect(null)
      setCorrectOptionId(null)
      setExplanation(null)
      setLoading(false)
      setPrefetchedQuestion(null)
      return
    }

    const res = await fetch('/api/test/gate-test/next', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sid || sessionId }),
    })
    const data = await res.json()

    if (data.done) {
      setDone(true)
      setResult({ passed: data.passed, stars: data.stars })
      setStats(data.stats)
      setLoading(false)
      return
    }

    setQuestion(data.question)
    setStats(data.stats)
    setQuestionNumber(prev => prev + 1)
    setSelectedOption(null)
    setIsAnswered(false)
    setIsCorrect(null)
    setCorrectOptionId(null)
    setExplanation(null)
    setLoading(false)

    // Background prefetch: immediately start loading next question while student reads this one
    fetch('/api/test/gate-test/next', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: sessionId }),
    }).then(r => r.json()).then(d => {
      if (!d.done) setPrefetchedQuestion(d.question)
    }).catch(() => {})
  }

  const handleSelectOption = (optionId: string) => {
    if (isAnswered) return
    setSelectedOption(optionId)
  }

  useEffect(() => {
    if (!isAnswered) return
    // Auto-advance on correct answer after 1s
    if (isCorrect && !done) {
      const timer = setTimeout(() => handleNext(), 1000)
      return () => clearTimeout(timer)
    }
  }, [isAnswered, isCorrect, done])

  const handleSubmit = async () => {
    if (!selectedOption || isAnswered || !sessionId || !question) return

    const res = await fetch('/api/test/gate-test/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, questionId: question.id, selectedOptionId: selectedOption }),
    })
    const data = await res.json()

    setIsAnswered(true)
    setIsCorrect(data.isCorrect)
    setCorrectOptionId(data.correctOptionId)
    setExplanation(data.explanation)
    setStats(data.stats)
    setPrefetchedQuestion(data.nextQuestion || null)

    if (data.done) {
      setDone(true)
      setResult({ passed: data.passed, stars: data.stars, lockedUntil: data.lockedUntil })
    }
  }

  const handleNext = () => {
    if (done) return
    fetchNextQuestion()
  }

  const handleBackToLesson = () => {
    router.push(`/play/${lessonId}`)
  }

  const handleQuit = () => {
    if (!confirm('确定退出测试吗？本次测试将作废，不记录成绩。')) return
    router.push(`/play/${lessonId}`)
  }

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  // Locked state
  if (initialLocked) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 pt-24 pb-20">
          <div className="bg-card rounded-2xl border p-8 text-center">
            <Clock className="w-16 h-16 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">测试已锁定</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <p className="text-sm text-muted-foreground mb-6">
              锁定期内可以去知识树学习或请教老师同学
            </p>
            <Link href={`/play/${lessonId}`} className="px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 transition-colors inline-block">
              返回课时学习
            </Link>
          </div>
        </main>
      </div>
    )
  }

  // Error state
  if (error && !initialLocked) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 pt-24 pb-20 text-center">
          <AlertTriangle className="w-16 h-16 text-amber-400 mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">{error}</p>
          <Link href={`/play/${lessonId}`} className="text-emerald-600 hover:underline">返回课时</Link>
        </main>
      </div>
    )
  }

  // Result screen
  if (done && result) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-lg mx-auto px-4 pt-24 pb-20">
          <div className={`bg-card rounded-2xl border p-8 text-center ${result.passed ? 'border-emerald-200' : 'border-red-200'}`}>
            {result.passed ? (
              <>
                <CheckCircle className="w-20 h-20 text-emerald-500 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">恭喜通关！</h2>
                <div className="flex justify-center gap-1 mb-4">
                  {[1, 2, 3].map(s => (
                    <Star key={s} className={`w-8 h-8 ${s <= result.stars ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                  ))}
                </div>
                <p className="text-muted-foreground mb-2">
                  共答 {stats.questionsAsked} 题，正确 {stats.totalCorrect} 题（{stats.accuracy}%）
                </p>
                <p className="text-sm text-muted-foreground mb-6">下一课时已解锁，继续加油！</p>
              </>
            ) : (
              <>
                <XCircle className="w-20 h-20 text-red-400 mx-auto mb-4" />
                <h2 className="text-2xl font-bold mb-2">测试失败</h2>
                <p className="text-muted-foreground mb-2">
                  答错 {stats.totalWrong} 题，累计答错3题
                </p>
                {result.lockedUntil ? (
                  <>
                    <div className="flex items-center justify-center gap-2 text-amber-600 mb-4">
                      <Clock className="w-5 h-5" />
                      <span className="font-medium">冷却 10 分钟</span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-6">
                      建议去知识树查看视频链接学习，或请教老师同学
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground mb-6">
                    这是复习测试，不影响已通过状态
                  </p>
                )}
              </>
            )}
            <button onClick={handleBackToLesson}
              className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 transition-colors">
              返回课时
            </button>
          </div>
        </main>
      </div>
    )
  }

  // Loading
  if (loading || !question) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="flex items-center justify-center pt-24"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></main>
      </div>
    )
  }

  // Question screen
  const letters = ['A', 'B', 'C', 'D']
  const progressWidth = done ? 100 : Math.min(((stats.questionsAsked) / 15) * 100, 95)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 pt-24 pb-20">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-4">
          <button onClick={handleQuit}
            className="text-sm text-muted-foreground hover:text-red-500 transition-colors">
            ✕ 退出测试
          </button>
        </div>

        {/* Live Stats */}
        <div className="bg-card rounded-2xl border p-4 mb-4">
          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-blue-600">{stats.consecutiveCorrect}</div>
              <div className="text-xs text-muted-foreground">连续正确</div>
              <div className="text-xs text-muted-foreground">/ 7 通关</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-600">{stats.totalCorrect}</div>
              <div className="text-xs text-muted-foreground">累计正确</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-red-500">{stats.totalWrong}</div>
              <div className="text-xs text-muted-foreground">累计错误</div>
              <div className="text-xs text-muted-foreground">/ 3 锁定</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-600">{stats.accuracy}%</div>
              <div className="text-xs text-muted-foreground">正确率</div>
              <div className="text-xs text-muted-foreground">/ 90% 通关</div>
            </div>
          </div>
        </div>

        {/* Question */}
        <div className="bg-card rounded-2xl border p-6 mb-6">
          <div className="text-xs text-muted-foreground mb-2">第 {questionNumber} 题</div>
          <h2 className="text-lg font-medium mb-4"><KatexHtml text={question.stem} /></h2>
          {question.imageUrl && (
            <img src={question.imageUrl} alt="" className="mb-4 rounded-lg max-h-64" />
          )}
          <div className="space-y-2">
            {question.options.map((opt, i) => {
              const isSelected = selectedOption === opt.id
              const isCorrectOption = isAnswered && opt.id === correctOptionId
              const isWrongSelection = isAnswered && isSelected && !isCorrect

              let bgClass = 'border-gray-200 hover:border-gray-300'
              if (isCorrectOption) bgClass = 'border-green-500 bg-green-50'
              else if (isWrongSelection) bgClass = 'border-red-500 bg-red-50'
              else if (isSelected) bgClass = 'border-blue-500 bg-blue-50'

              return (
                <button key={opt.id} onClick={() => handleSelectOption(opt.id)} disabled={isAnswered}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${bgClass} ${isAnswered ? 'cursor-default' : 'cursor-pointer'}`}>
                  <span className="font-medium text-muted-foreground mr-2">{letters[i]}.</span> <KatexHtml text={cleanOption(opt.content)} />
                  {isCorrectOption && <CheckCircle className="inline w-4 h-4 text-green-500 ml-2" />}
                  {isWrongSelection && <XCircle className="inline w-4 h-4 text-red-500 ml-2" />}
                </button>
              )
            })}
          </div>
        </div>

        {/* Explanation (shown after answering wrong) */}
        {isAnswered && !isCorrect && explanation && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
            <div className="font-medium text-amber-800 mb-1">
              正确答案：{question.options.findIndex(o => o.id === correctOptionId) >= 0
                ? String.fromCharCode(65 + question.options.findIndex(o => o.id === correctOptionId)!)
                : '?'}
            </div>
            <p className="text-sm text-amber-700"><KatexHtml text={explanation} /></p>
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-center">
          {!isAnswered ? (
            <button onClick={handleSubmit} disabled={!selectedOption}
              className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors">
              提交答案
            </button>
          ) : isCorrect ? (
            <span className="px-8 py-3 text-emerald-600 font-medium">✓ 正确！</span>
          ) : (
            <button onClick={handleNext}
              className="px-8 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors">
              下一题
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
