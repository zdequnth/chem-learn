'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import { Loader2, BookOpen, ChevronRight, Printer } from 'lucide-react'

interface WrongRecord {
  id: string
  question_id: string
  chapter_id: string
  course_id: string
  wrong_count: number
  last_wrong_at: string
  is_resolved: boolean
  is_repeated_wrong: boolean
  question_stem: string
  question_explanation: string
  correct_answer: string
  all_options: { id: string; content: string; isCorrect: boolean }[]
  lesson_title: string
  chapter_title: string
  course_name: string
}

export default function WrongBookPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()

  const [records, setRecords] = useState<WrongRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')
  const [showResolved, setShowResolved] = useState(false)
  const [courses, setCourses] = useState<{ id: string; name: string }[]>([])
  const [chapters, setChapters] = useState<{ id: string; title: string; courseId: string }[]>([])

  useEffect(() => {
    if (!authLoading && !user) { router.push('/login') }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return
    fetchRecords()
    fetch('/api/student/course-data').then(r => r.json()).then(json => {
      setCourses((json.courses || []).map((c: any) => ({ id: c.id, name: c.name })))
    })
  }, [user])

  const fetchRecords = async () => {
    const res = await fetch('/api/wrong-book')
    const json = await res.json()
    setRecords(json.records || [])
    // Extract unique chapters from records
    const chMap = new Map<string, { id: string; title: string; courseId: string }>()
    ;(json.records || []).forEach((r: any) => {
      if (r.chapter_id && !chMap.has(r.chapter_id)) {
        chMap.set(r.chapter_id, { id: r.chapter_id, title: r.chapter_title, courseId: r.course_id })
      }
    })
    setChapters(Array.from(chMap.values()))
    setLoading(false)
  }

  const toggleResolved = async (id: string, current: boolean) => {
    await fetch('/api/wrong-book', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_resolved: !current }),
    })
    fetchRecords()
  }

  // Filter records
  const filtered = records.filter(r => {
    if (selectedCourse && r.course_id !== selectedCourse) return false
    if (selectedChapter && r.chapter_id !== selectedChapter) return false
    if (!showResolved && r.is_resolved) return false
    return true
  })
  const filteredChapterIds = new Set(filtered.map(r => r.chapter_id))
  const filteredChapters = chapters.filter(c => {
    if (selectedCourse && c.courseId !== selectedCourse) return false
    return filteredChapterIds.has(c.id) || (selectedCourse === c.courseId)
  })

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  // Group by course → chapter
  const grouped: Record<string, Record<string, WrongRecord[]>> = {}
  filtered.forEach(r => {
    if (!grouped[r.course_name]) grouped[r.course_name] = {}
    if (!grouped[r.course_name][r.chapter_title]) grouped[r.course_name][r.chapter_title] = []
    grouped[r.course_name][r.chapter_title].push(r)
  })

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold">错题本</h1>
          <div className="flex gap-2">
            {records.filter(r => !r.is_resolved).length > 0 && (
              <Link href={`/play/wrong-test?chapterId=${selectedChapter}`}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 text-sm no-print">
                🎯 错题重测
              </Link>
            )}
            {records.length > 0 && (
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 transition-colors text-sm no-print">
                <Printer className="w-4 h-4" /> 导出
              </button>
            )}
          </div>
        </div>
        <p className="text-muted-foreground mb-4">个性化错题汇总，按课程-章节分类，方便复习</p>

        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <select value={selectedCourse} onChange={e => { setSelectedCourse(e.target.value); setSelectedChapter('') }}
            className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">全部课程</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)}
            className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
            <option value="">全部章节</option>
            {filteredChapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
            <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-emerald-500 focus:ring-emerald-500" />
            显示已掌握
          </label>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : records.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">错题本为空</h2>
            <p className="text-muted-foreground">还没有错题记录</p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(grouped).map(([course, chapters]) => (
              <div key={course}>
                <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-purple-500" /> {course}
                </h2>
                {Object.entries(chapters).map(([chapter, chapterRecords]) => (
                  <div key={chapter} className="ml-4 mb-4 print-chapter-break">
                    <h3 className="text-md font-semibold mb-2 text-muted-foreground flex items-center gap-1">
                      <ChevronRight className="w-4 h-4" /> {chapter}
                      <span className="text-sm">({chapterRecords.length} 题)</span>
                    </h3>
                    <div className="space-y-3">
                      {chapterRecords.map(r => (
                        <div key={r.id} className={`bg-card rounded-xl border p-4 ${r.is_resolved ? 'opacity-60' : ''}`}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="flex-1">
                              <p className="text-sm font-medium"><KatexHtml text={r.question_stem} /></p>
                              <div className="mt-2 grid grid-cols-2 gap-1">
                                {r.all_options.map((opt, j) => (
                                  <span key={opt.id} className={`text-xs px-2 py-1 rounded ${opt.isCorrect ? 'bg-green-100 text-green-700 font-medium' : 'bg-gray-50 text-gray-500'}`}>
                                    {String.fromCharCode(65 + j)}. <KatexHtml text={cleanOption(opt.content)} />
                                  </span>
                                ))}
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {r.is_repeated_wrong && <span className="text-sm" title="反复错误">🌶️</span>}
                              <button onClick={() => toggleResolved(r.id, r.is_resolved)}
                                className={`no-print px-3 py-1 text-xs rounded-full font-medium ${
                                  r.is_resolved ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
                                }`}>
                                {r.is_resolved ? '✓ 已掌握' : '标记掌握'}
                              </button>
                            </div>
                          </div>
                          {r.question_explanation && (
                            <div className="bg-blue-50 rounded-lg p-3 mt-2">
                              <p className="text-sm text-blue-800">解析：{r.question_explanation}</p>
                            </div>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>答错 {r.wrong_count} 次</span>
                            <span>最近：{new Date(r.last_wrong_at).toLocaleDateString('zh-CN')}</span>
                            <span>课时：{r.lesson_title}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
