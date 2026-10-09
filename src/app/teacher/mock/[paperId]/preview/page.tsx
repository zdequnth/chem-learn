'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption, wrapBareLatex } from '@/components/KatexSpan'
import { kindTheme } from '@/lib/course-kind'
import { groupsForPaper, groupIndexOf, partLabel } from '@/lib/mock-groups'
import { ArrowLeft, Loader2, Eye, EyeOff, AlertTriangle } from 'lucide-react'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const theme = kindTheme('mock')

interface PQ {
  questionId: string
  sortOrder: number
  stem: string
  groupRef?: string | null
  images: string[]
  explanation: string
  difficulty: number
  chapterTitle: string | null
  lessonRef: string | null
  lessonTitle: string | null
  answerType: 'choice' | 'short'
  answerText: string
  options: { id: string; content: string; isCorrect: boolean }[]
  correctOptionId: string | null
  noAnswer: boolean
}

function PreviewContent() {
  const { paperId } = useParams<{ paperId: string }>()
  const { user, profile, loading: authLoading } = useAuth()
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState('')
  const [showAnswers, setShowAnswers] = useState(true)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    if (!profile || !paperId) return
    fetch(`/api/teacher/mock-preview?paperId=${paperId}`).then(r => r.json()).then((j) => {
      if (j.error) setError(j.error)
      else setData(j)
    }).catch((e) => setError(String(e)))
  }, [profile, paperId])

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
  }

  const questions: PQ[] = data?.questions || []
  const cur = questions[idx]
  const flagged = questions.filter(q => q.noAnswer).length
  const isShortPaper = questions.length > 0 && questions.every(q => q.answerType === 'short')
  const groups = groupsForPaper(questions, isShortPaper)
  const curGroupIdx = cur ? (groupIndexOf(groups).get(cur.questionId) ?? -1) : -1

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 pt-24 pb-24">
        <Link href="/teacher/mock" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回试卷管理
        </Link>

        {error ? (
          <div className="bg-card border rounded-2xl p-10 text-center text-rose-600">{error}</div>
        ) : !data ? (
          <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin inline" /></div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div>
                <h1 className="text-xl font-bold">{data.paper.title}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  预览 · {questions.length} 题 · {data.paper.durationMinutes} 分钟
                  {data.sourceCourseName && ` · 题目对应「${data.sourceCourseName}」的章节课时`}
                </p>
              </div>
              <button onClick={() => setShowAnswers(v => !v)}
                className={`ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${showAnswers ? theme.solid : 'hover:bg-accent'}`}>
                {showAnswers ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                {showAnswers ? '正在显示答案' : '学生视角（无答案）'}
              </button>
            </div>

            {flagged > 0 && (
              <div className="mb-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {isShortPaper
                  ? <>{flagged} 题还没有参考答案 —— 没有它 AI 判不了分。它们会标红。</>
                  : <>{flagged} 题的正确答案不是恰好 1 个（可能是 AI 没标对，或多选了）。显示答案时它们会标红。</>}
              </div>
            )}

            {/* Number palette — the same jumping-off point students get.
                A choice paper numbers straight through in one flowing row; only
                a free-response paper groups its parts onto one row per big
                question. */}
            {isShortPaper ? (
              <div className="space-y-1 mb-4">
                {groups.map((g, gi) => (
                  <div key={gi} className="flex flex-wrap items-center gap-1.5">
                    <span className="w-14 shrink-0 text-xs text-muted-foreground">第 {gi + 1} 题</span>
                    {g.items.map((q, si) => {
                      const i = g.start + si
                      return (
                        <button key={q.questionId} onClick={() => setIdx(i)}
                          className={`h-8 min-w-8 px-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            i === idx ? 'ring-2 ring-violet-400 ' : ''
                          }${showAnswers && q.noAnswer ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-card hover:bg-accent text-muted-foreground'}`}>
                          {partLabel(gi, si, g.items.length)}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-wrap gap-1.5 mb-4">
                {questions.map((q, i) => (
                  <button key={q.questionId} onClick={() => setIdx(i)}
                    className={`w-9 h-9 rounded-lg text-xs font-medium border transition-colors ${
                      i === idx ? 'ring-2 ring-violet-400 ' : ''
                    }${showAnswers && q.noAnswer ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-card hover:bg-accent text-muted-foreground'}`}>
                    {i + 1}
                  </button>
                ))}
              </div>
            )}

            {cur && (
              <div className="bg-card border rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-3 flex-wrap text-xs text-muted-foreground">
                  <span>第 {idx + 1} / {questions.length} 题</span>
                  <span>· 难度 {cur.difficulty}</span>
                  {showAnswers && (cur.chapterTitle || cur.lessonTitle) && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {cur.chapterTitle}{cur.lessonRef ? ` › ${cur.lessonRef}` : ''} {cur.lessonTitle}
                    </span>
                  )}
                </div>

                <div className="text-base mb-3"><KatexHtml text={cur.stem} /></div>
                {(cur.images ?? []).map((src, k) => <img key={k} src={src} alt="" className="mb-3 max-h-72 rounded-lg border bg-white" />)}

                {cur.answerType === 'short' ? (
                  showAnswers ? (
                    <div className="px-3 py-2.5 rounded-xl border border-emerald-300 bg-emerald-50">
                      <div className="text-xs text-emerald-800 mb-1">参考答案（学生看到的判分依据）</div>
                      <div className="text-sm whitespace-pre-wrap">
                        {cur.answerText
                          ? <KatexHtml text={wrapBareLatex(cur.answerText)} />
                          : <span className="text-rose-600">（还没填参考答案 —— AI 判不了这道题）</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-muted-foreground">
                      学生在这里写一段文字作答（这里不显示参考答案）
                    </div>
                  )
                ) : (
                <div className="space-y-2">
                  {cur.options.map((o, oi) => {
                    const reveal = showAnswers && o.isCorrect
                    return (
                      <div key={o.id}
                        className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${
                          reveal ? 'bg-emerald-50 border-emerald-300' : cur.noAnswer && showAnswers ? 'border-amber-200' : 'border-gray-200'}`}>
                        <span className={`w-6 h-6 rounded-full border text-xs font-semibold flex items-center justify-center shrink-0 ${reveal ? 'bg-emerald-500 border-emerald-500 text-white' : 'text-muted-foreground'}`}>
                          {LETTERS[oi]}
                        </span>
                        <span className="flex-1 text-sm"><KatexHtml text={cleanOption(o.content)} /></span>
                        {reveal && <span className="text-xs text-emerald-700 shrink-0">正确答案</span>}
                      </div>
                    )
                  })}
                </div>
                )}

                {showAnswers && cur.explanation && (
                  <div className="mt-3 px-3 py-2 bg-gray-50 rounded-lg text-sm text-muted-foreground">
                    <KatexHtml text={cur.explanation} />
                  </div>
                )}

                <div className="flex items-center gap-3 mt-5">
                  <button onClick={() => setIdx(i => Math.max(0, i - 1))} disabled={idx === 0}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-accent disabled:opacity-40">上一题</button>
                  <button onClick={() => setIdx(i => Math.min(questions.length - 1, i + 1))} disabled={idx === questions.length - 1}
                    className="px-4 py-2 border rounded-lg text-sm hover:bg-accent disabled:opacity-40">下一题</button>
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-4">
              这是老师预览，不会产生任何考试记录。学生看到的是同一个排版，但**没有答案、没有解析**，
              而且倒计时结束会自动交卷。
            </p>
          </>
        )}
      </main>
    </div>
  )
}

export default function MockPreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>}>
      <PreviewContent />
    </Suspense>
  )
}
