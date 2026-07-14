'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import { ArrowLeft, CheckCircle, XCircle, Loader2, Star, Sprout } from 'lucide-react'

interface WqQuestion {
  id: string; wbId: string; stem: string; explanation: string
  options: { id: string; content: string; isCorrect: boolean }[]
}

function WrongTestForm() {
  const router = useRouter()
  const sp = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [questions, setQuestions] = useState<WqQuestion[]>([])
  const [currentIdx, setCurrentIdx] = useState(0)
  const [selectedOption, setSelectedOption] = useState<string | null>(null)
  const [isAnswered, setIsAnswered] = useState(false)
  const [isCorrect, setIsCorrect] = useState(false)
  const [correctOptionId, setCorrectOptionId] = useState<string | null>(null)
  const [explanation, setExplanation] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ correct: 0, wrong: 0, total: 0 })
  const [aiGenerating, setAiGenerating] = useState<string | null>(null)
  const [aiResult, setAiResult] = useState('')

  useEffect(() => { if (!authLoading && !user) router.push('/login') }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    const courseId = sp.get('courseId') || ''
    const chapterId = sp.get('chapterId') || ''
    fetch(`/api/wrong-book?chapterId=${chapterId}&unresolvedOnly=1`).then(r => r.json()).then(json => {
      const qs: WqQuestion[] = (json.records || []).map((q: any) => ({
        id: q.question_id, wbId: q.id, stem: q.question_stem,
        explanation: q.question_explanation,
        options: (q.all_options || []).map((o: any) => ({ id: o.id, content: o.content, isCorrect: o.isCorrect })),
      })).sort(() => Math.random() - 0.5)
      setQuestions(qs)
      setStats(prev => ({ ...prev, total: qs.length }))
      setLoading(false)
    })
  }, [user])

  const question = questions[currentIdx]
  const letters = ['A', 'B', 'C', 'D']

  const handleSubmit = async () => {
    if (!selectedOption || !question) return
    const isOk = question.options.find(o => o.id === selectedOption)?.isCorrect
    setIsAnswered(true); setIsCorrect(!!isOk); setCorrectOptionId(question.options.find(o => o.isCorrect)?.id || null)
    setExplanation(question.explanation)

    // Update wrong-book record
    if (isOk) {
      await fetch('/api/wrong-book', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.wbId, is_resolved: true }),
      })
    } else {
      await fetch('/api/wrong-book', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: question.wbId, is_repeated_wrong: true }),
      })
    }

    setStats(prev => ({ ...prev, correct: prev.correct + (isOk ? 1 : 0), wrong: prev.wrong + (isOk ? 0 : 1) }))
  }

  const handleNext = () => {
    if (currentIdx + 1 >= questions.length) { setDone(true); return }
    setCurrentIdx(prev => prev + 1)
    setSelectedOption(null); setIsAnswered(false); setIsCorrect(false)
    setCorrectOptionId(null); setExplanation(null)
  }

  const handleGenerateKP = async () => {
    if (!question || aiGenerating) return
    setAiGenerating(question.id); setAiResult('')
    const res = await fetch('/api/ai/generate-kp-from-question', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stem: question.stem, explanation: question.explanation }),
    })
    const json = await res.json()
    setAiResult(json.result || json.error || '生成失败')
    setAiGenerating(null)
  }

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  if (done) {
    const acc = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-20 text-center">
          {acc >= 90 ? <CheckCircle className="w-20 h-20 text-emerald-400 mx-auto mb-4" /> :
           acc >= 60 ? <Star className="w-20 h-20 text-amber-400 mx-auto mb-4" /> :
           <Sprout className="w-20 h-20 text-red-400 mx-auto mb-4" />}
          <h2 className="text-2xl font-bold mb-2">错题重测完成</h2>
          <p className="text-muted-foreground mb-4">共 {stats.total} 题，答对 {stats.correct} 题，正确率 {acc}%</p>
          <div className="grid grid-cols-2 gap-4 max-w-xs mx-auto mb-6">
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <div className="text-2xl font-bold text-green-600">{stats.correct}</div>
              <div className="text-xs text-green-600">✓ 已掌握</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-3">
              <div className="text-2xl font-bold text-red-600">{stats.wrong}</div>
              <div className="text-xs text-red-600">🌶️ 反复错误</div>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <Link href="/wrong-book" className="px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600">返回错题本</Link>
            <button onClick={() => { setDone(false); setCurrentIdx(0); setSelectedOption(null); setIsAnswered(false); setIsCorrect(false); setCorrectOptionId(null); setExplanation(null); setStats({ correct: 0, wrong: 0, total: stats.total }) }}
              className="px-6 py-2.5 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600">再来一轮</button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-20">
        <Link href="/wrong-book" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> 返回错题本
        </Link>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : questions.length === 0 ? (
          <div className="text-center py-20">
            <h2 className="text-xl font-semibold mb-2">没有待重测的错题</h2>
            <p className="text-muted-foreground">所有错题已掌握</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <span className="text-sm text-muted-foreground">错题重测 · 第 {currentIdx + 1}/{questions.length} 题</span>
              <span className="text-xs text-muted-foreground">✓{stats.correct} 🌶️{stats.wrong}</span>
            </div>

            <div className="bg-card rounded-2xl border p-6 mb-4">
              <h2 className="text-lg font-medium mb-4"><KatexHtml text={question.stem} /></h2>
              <div className="space-y-2">
                {question.options.map((opt, i) => {
                  const isSelected = selectedOption === opt.id
                  const isCorrectOpt = isAnswered && opt.id === correctOptionId
                  const isWrong = isAnswered && isSelected && !opt.isCorrect
                  let bg = 'border-gray-200 hover:border-gray-300'
                  if (isCorrectOpt) bg = 'border-green-500 bg-green-50'
                  else if (isWrong) bg = 'border-red-500 bg-red-50'
                  else if (isSelected) bg = 'border-blue-500 bg-blue-50'
                  return (
                    <button key={opt.id} onClick={() => { if (!isAnswered) setSelectedOption(opt.id) }} disabled={isAnswered}
                      className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${bg} ${isAnswered ? 'cursor-default' : 'cursor-pointer'}`}>
                      <span className="font-medium text-muted-foreground mr-2">{letters[i]}.</span> <KatexHtml text={cleanOption(opt.content)} />
                      {isCorrectOpt && <CheckCircle className="inline w-4 h-4 text-green-500 ml-2" />}
                      {isWrong && <XCircle className="inline w-4 h-4 text-red-500 ml-2" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {isAnswered && !isCorrect && explanation && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
                <div className="font-medium text-amber-800 mb-1">正确答案：{question.options.findIndex(o => o.id === correctOptionId) >= 0 ? String.fromCharCode(65 + question.options.findIndex(o => o.id === correctOptionId)!) : '?'}</div>
                <p className="text-sm text-amber-700"><KatexHtml text={explanation} /></p>
                <button onClick={handleGenerateKP} disabled={aiGenerating === question.id}
                  className="mt-3 flex items-center gap-1 px-3 py-1.5 bg-purple-100 border border-purple-200 text-purple-700 rounded-lg text-sm font-medium hover:bg-purple-200 disabled:opacity-50">
                  🧠 {aiGenerating === question.id ? 'AI 生成中...' : 'AI 生成知识点'}
                </button>
                {aiResult && (
                  <div className="mt-3 bg-white border rounded-lg p-3">
                    <div className="text-xs font-medium text-purple-700 mb-1">AI 知识点总结</div>
                    <div className="text-sm"><KatexHtml text={aiResult} /></div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-center">
              {!isAnswered ? (
                <button onClick={handleSubmit} disabled={!selectedOption}
                  className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600 disabled:opacity-50">
                  提交答案
                </button>
              ) : isCorrect ? (
                <button onClick={handleNext}
                  className="px-8 py-3 bg-emerald-500 text-white rounded-xl font-medium hover:bg-emerald-600">
                  下一题
                </button>
              ) : (
                <button onClick={handleNext}
                  className="px-8 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600">
                  下一题
                </button>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default function WrongTestPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <WrongTestForm />
    </Suspense>
  )
}
