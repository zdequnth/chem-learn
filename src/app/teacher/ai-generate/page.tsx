'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import type { Course, Chapter, Lesson } from '@/lib/types'
import { ArrowLeft, Sparkles, Loader2, CheckCircle, Save, X } from 'lucide-react'

interface GeneratedQuestion {
  stem: string
  options: { content: string; isCorrect: boolean }[]
  explanation: string
  difficulty: number
}

function AIGenerateForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading: authLoading } = useAuth()

  const [courses, setCourses] = useState<Course[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')
  const [selectedLesson, setSelectedLesson] = useState('')
  const [topic, setTopic] = useState('')
  const [questionType, setQuestionType] = useState('gate_test')
  const [count, setCount] = useState(30)
  const [difficultyMin, setDifficultyMin] = useState(2)
  const [difficultyMax, setDifficultyMax] = useState(4)
  const [language, setLanguage] = useState('english')
  const [generating, setGenerating] = useState(false)
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([])
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetch('/api/courses').then(r => r.json()).then(json => {
      setCourses((json.courses || []) as Course[])
      // Pre-fill from URL params
      const c = searchParams.get('course')
      const ch = searchParams.get('chapter')
      const l = searchParams.get('lesson')
      if (c) setSelectedCourse(c)
      if (ch) setTimeout(() => setSelectedChapter(ch), 200)
      if (l) setTimeout(() => setSelectedLesson(l), 400)
    })
  }, [profile])

  useEffect(() => {
    if (!selectedCourse) { setChapters([]); setSelectedChapter(''); return }
    fetch(`/api/student/course-data?courseId=${selectedCourse}`).then(r => r.json()).then(json => {
      setChapters((json.chapters || []) as Chapter[])
    })
  }, [selectedCourse])

  useEffect(() => {
    if (!selectedChapter) { setLessons([]); setSelectedLesson(''); return }
    fetch(`/api/student/course-data?courseId=${selectedCourse}`).then(r => r.json()).then(json => {
      setLessons((json.lessons || []).filter((l: any) => l.chapter_id === selectedChapter) as Lesson[])
    })
  }, [selectedChapter])

  const handleGenerate = async () => {
    if (!selectedLesson) return
    setGenerating(true)
    setQuestions([])
    setSaved(false)

    const res = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lessonId: selectedLesson, questionType, count, difficultyMin, difficultyMax,
        topic, language,
      }),
    })
    const data = await res.json()

    if (data.error) {
      alert('生成失败：' + data.error)
    } else {
      setQuestions(data.questions || [])
    }
    setGenerating(false)
  }

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleSaveAll = async () => {
    if (!selectedLesson || questions.length === 0 || saving || saved) return
    setSaving(true)
    try {
      const res = await fetch('/api/questions/save-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questions: questions.map(q => ({
            stem: q.stem,
            explanation: q.explanation || '',
            difficulty: q.difficulty || 3,
            question_type: questionType,
            lesson_id: selectedLesson,
            is_approved: true,
            is_ai_generated: true,
            options: q.options.map(opt => ({ content: opt.content, isCorrect: opt.isCorrect })),
          })),
        }),
      })
      const json = await res.json()
      setSaved(true)
      alert(`已保存 ${json.saved || 0} 道题目到题库！`)
    } catch (e: any) {
      alert('保存失败: ' + (e?.message || '未知错误'))
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 pt-24 pb-20">
        <Link href="/teacher/questions" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> 返回题库
        </Link>

        <h1 className="text-2xl font-bold mb-6">🤖 AI 智能出题</h1>

        {/* Config */}
        <div className="bg-card rounded-2xl border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium mb-1">课程</label>
              <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">选择课程</option>
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">章节</label>
              <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)} disabled={!selectedCourse}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
                <option value="">选择章节</option>
                {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">目标课时</label>
              <select value={selectedLesson} onChange={e => setSelectedLesson(e.target.value)} disabled={!selectedChapter}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
                <option value="">选择课时</option>
                {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">题型</label>
              <select value={questionType} onChange={e => setQuestionType(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="gate_test">关卡测试</option>
                <option value="boss_test">章节BOSS测试</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">语言</label>
              <select value={language} onChange={e => setLanguage(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="english">English</option>
                <option value="chinese">中文</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">题目数量</label>
              <input type="number" min={1} max={30} value={count} onChange={e => setCount(Number(e.target.value))}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">难度下限 (1-5)</label>
              <input type="number" min={1} max={5} value={difficultyMin} onChange={e => setDifficultyMin(Number(e.target.value))}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">难度上限 (1-5)</label>
              <input type="number" min={1} max={5} value={difficultyMax} onChange={e => setDifficultyMax(Number(e.target.value))}
                className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">知识点主题</label>
            <textarea value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="描述知识点，例如：Chemical bonding, redox reactions, organic nomenclature..."
              rows={2} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
          </div>
          <button onClick={handleGenerate} disabled={!selectedLesson || generating}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
            {generating ? <><Loader2 className="w-5 h-5 animate-spin" /> AI 生成中...</> : <><Sparkles className="w-5 h-5" /> 开始生成</>}
          </button>
        </div>

        {/* Results */}
        {questions.length > 0 && (
          <div className="bg-card rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">审核预览 ({questions.length} 题)</h2>
              <button onClick={handleSaveAll} disabled={saving || saved}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors">
                {saved ? <><CheckCircle className="w-4 h-4" /> 已保存</>
                 : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 保存中...</>
                 : <><Save className="w-4 h-4" /> 全部保存到题库</>}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">审核每道题，不满意的点 ✕ 删除，剩下的点"全部保存"一键入库。</p>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="border rounded-xl p-4 relative group">
                  {/* Delete button */}
                  <button onClick={() => handleDeleteQuestion(i)}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 hover:border-red-200 transition-colors opacity-0 group-hover:opacity-100">
                    <X className="w-3.5 h-3.5" />
                  </button>
                  <div className="flex items-center gap-2 mb-2 pr-8">
                    <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">难度 {q.difficulty}</span>
                  </div>
                  <p className="text-sm mb-2"><KatexHtml text={q.stem} /></p>
                  <div className="grid grid-cols-2 gap-1">
                    {q.options.map((opt, j) => (
                      <span key={j} className={`text-xs px-2 py-1 rounded ${opt.isCorrect ? 'bg-green-50 text-green-700 font-medium' : 'bg-gray-50 text-gray-600'}`}>
                        {String.fromCharCode(65 + j)}. <KatexHtml text={cleanOption(opt.content)} />
                      </span>
                    ))}
                  </div>
                  {q.explanation && <p className="text-xs text-blue-600 mt-2 bg-blue-50 p-2 rounded-lg"><KatexHtml text={q.explanation} /></p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default function AIGeneratePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AIGenerateForm />
    </Suspense>
  )
}
