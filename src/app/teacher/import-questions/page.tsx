'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import type { Course, Chapter, Lesson } from '@/lib/types'
import { ArrowLeft, Loader2, CheckCircle, Save, X, Sparkles, FileText } from 'lucide-react'

interface ParsedQuestion {
  stem: string
  options: { content: string; isCorrect: boolean }[]
  explanation: string
  difficulty: number
}

function ImportForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading: authLoading } = useAuth()

  const [courses, setCourses] = useState<Course[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')
  const [selectedLesson, setSelectedLesson] = useState('')
  const [markdownText, setMarkdownText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [questions, setQuestions] = useState<ParsedQuestion[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [courseNames, setCourseNames] = useState({ courseName: '', chapterTitle: '', lessonTitle: '' })

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetch('/api/courses').then(r => r.json()).then(json => {
      setCourses((json.courses || []) as Course[])
    })
  }, [profile])

  useEffect(() => {
    if (!selectedCourse) { setChapters([]); setSelectedChapter(''); return }
    fetch(`/api/student/course-data?courseId=${selectedCourse}`).then(r => r.json()).then(json => {
      setChapters((json.chapters || []) as Chapter[])
    })
    const c = courses.find(c => c.id === selectedCourse)
    if (c) setCourseNames(prev => ({ ...prev, courseName: c.name }))
  }, [selectedCourse])

  useEffect(() => {
    if (!selectedChapter) { setLessons([]); setSelectedLesson(''); return }
    fetch(`/api/student/course-data?courseId=${selectedCourse}`).then(r => r.json()).then(json => {
      setLessons((json.lessons || []).filter((l: any) => l.chapter_id === selectedChapter) as Lesson[])
    })
    const ch = chapters.find(c => c.id === selectedChapter)
    if (ch) setCourseNames(prev => ({ ...prev, chapterTitle: ch.title }))
  }, [selectedChapter])

  useEffect(() => {
    const l = lessons.find(l => l.id === selectedLesson)
    if (l) setCourseNames(prev => ({ ...prev, lessonTitle: l.title }))
  }, [selectedLesson])

  const handleParse = async () => {
    if (!markdownText.trim() || !selectedLesson) return
    setParsing(true)
    setQuestions([])
    setSaved(false)

    const res = await fetch('/api/ai/parse-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: markdownText.trim(), ...courseNames }),
    })
    const json = await res.json()
    if (json.error) { alert('解析失败：' + json.error) }
    else { setQuestions(json.questions || []) }
    setParsing(false)
  }

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const handleSaveAll = async () => {
    if (!selectedLesson || questions.length === 0 || saving || saved) return
    setSaving(true)
    const res = await fetch('/api/questions/save-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        questions: questions.map(q => ({
          stem: q.stem,
          explanation: q.explanation || '',
          difficulty: q.difficulty || 3,
          question_type: 'gate_test',
          lesson_id: selectedLesson,
          is_approved: true,
          is_ai_generated: true,
          options: q.options.map(opt => ({ content: opt.content, isCorrect: opt.isCorrect })),
        })),
      }),
    })
    const json = await res.json()
    setSaved(true)
    alert(`已保存 ${json.saved || 0} 道题目！`)
    setSaving(false)
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

        <h1 className="text-2xl font-bold mb-2">📄 导入题目</h1>
        <p className="text-muted-foreground mb-6 text-sm">粘贴 Markdown 格式的题目文本，AI 自动解析为结构化题目</p>

        {/* Config */}
        <div className="bg-card rounded-2xl border p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}
              className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">选择课程</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)} disabled={!selectedCourse}
              className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
              <option value="">选择章节</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select value={selectedLesson} onChange={e => setSelectedLesson(e.target.value)} disabled={!selectedChapter}
              className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
              <option value="">选择目标课时</option>
              {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </div>

          <label className="block text-sm font-medium mb-1">题目内容（Markdown）</label>
          <textarea value={markdownText} onChange={e => setMarkdownText(e.target.value)}
            placeholder={`粘贴题目，格式参考：\n\n1. 下列物质中属于电解质的是？\nA. 蔗糖\nB. 氯化钠\nC. 乙醇\nD. 葡萄糖\n答案：B\n解析：氯化钠在水中完全电离，是强电解质。\n\n---\n\n2. 实验室制取Cl₂的化学方程式？\n...`}
            rows={12} className="w-full px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono text-sm" />
          <button onClick={handleParse} disabled={!selectedLesson || !markdownText.trim() || parsing}
            className="w-full mt-4 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-medium hover:from-purple-600 hover:to-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
            {parsing ? <><Loader2 className="w-5 h-5 animate-spin" /> AI 解析中...</> : <><Sparkles className="w-5 h-5" /> 开始解析</>}
          </button>
        </div>

        {/* Results */}
        {questions.length > 0 && (
          <div className="bg-card rounded-2xl border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">审核预览 ({questions.length} 题)</h2>
              <button onClick={handleSaveAll} disabled={saving || saved}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
                {saved ? <><CheckCircle className="w-4 h-4" /> 已保存</>
                 : saving ? <><Loader2 className="w-4 h-4 animate-spin" /> 保存中...</>
                 : <><Save className="w-4 h-4" /> 全部保存到题库</>}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">审核每道题，不满意的点 ✕ 删除，剩下的点"全部保存"一键入库。</p>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="border rounded-xl p-4 relative group">
                  <button onClick={() => handleDeleteQuestion(i)}
                    className="absolute top-2 right-2 w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
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

export default function ImportQuestionsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ImportForm />
    </Suspense>
  )
}
