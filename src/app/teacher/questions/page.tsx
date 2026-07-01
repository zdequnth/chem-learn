'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course, Chapter, Lesson } from '@/lib/types'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import { Loader2, Search, Edit3, CheckCircle, XCircle } from 'lucide-react'

export default function TeacherQuestionsPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [courses, setCourses] = useState<Course[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedChapter, setSelectedChapter] = useState('')
  const [selectedLesson, setSelectedLesson] = useState('')
  const [questions, setQuestions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showManualAdd, setShowManualAdd] = useState(false)
  const [editQuestion, setEditQuestion] = useState<any>(null)
  const [manualForm, setManualForm] = useState({
    stem: '', explanation: '', difficulty: 3, question_type: 'gate_test',
    options: ['', '', '', ''],
    correctIndex: 0,
    imageUrl: '',
    explanationImage: '',
  })
  const [manualSaving, setManualSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)

  const handlePasteImage = async (e: React.ClipboardEvent, field: 'stem' | 'explanation') => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) { alert('无法读取图片'); continue }
        // Compress large images before upload
        if (file.size > 300 * 1024) {
          alert('图片需小于300KB，当前: ' + Math.round(file.size / 1024) + 'KB。请先用截图工具缩小图片。')
          continue
        }
        setUploadingImage(true)
        try {
          const formData = new FormData()
          formData.append('file', file, 'img.png')
          const res = await fetch('/api/upload-image', { method: 'POST', body: formData })
          const json = await res.json()
          if (json.url) {
            if (field === 'stem') setManualForm(prev => ({ ...prev, imageUrl: json.url }))
            else setManualForm(prev => ({ ...prev, explanationImage: json.url }))
          } else {
            alert('上传失败: ' + (json.error || '服务器无响应'))
          }
        } catch (err: any) {
          alert('上传异常: ' + err.message)
        }
        setUploadingImage(false)
      }
    }
  }

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetchCourses()
  }, [profile])

  const fetchCourses = async () => {
    const res = await fetch('/api/courses')
    const json = await res.json()
    setCourses((json.courses || []) as Course[])
    setLoading(false)
  }

  useEffect(() => {
    if (!selectedCourse) { setChapters([]); setSelectedChapter(''); setSelectedLesson(''); return }
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

  useEffect(() => {
    if (!selectedLesson) { setQuestions([]); return }
    fetch(`/api/questions?lessonId=${selectedLesson}`).then(r => r.json()).then(json => {
      setQuestions(json.questions || [])
    })
  }, [selectedLesson])

  const handleApprove = async (id: string, current: boolean) => {
    await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, is_approved: !current }),
    })
    fetch(`/api/questions?lessonId=${selectedLesson}`).then(r => r.json()).then(json => {
      setQuestions(json.questions || [])
    })
  }

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此题？')) return
    await fetch(`/api/questions?id=${id}`, { method: 'DELETE' })
    fetch(`/api/questions?lessonId=${selectedLesson}`).then(r => r.json()).then(json => {
      setQuestions(json.questions || [])
    })
  }

  const handleManualAdd = async () => {
    if (!manualForm.stem.trim() && !manualForm.imageUrl) return alert('请输入题目内容或粘贴图片')
    if (manualForm.options.some(o => !o.trim())) return alert('请填写所有4个选项')
    setManualSaving(true)
    try {
      const imageUrl = manualForm.imageUrl || null
      const body = {
        questions: [{
          stem: manualForm.stem.trim(),
          explanation: manualForm.explanation.trim() + (manualForm.explanationImage ? `\n![解析图](${manualForm.explanationImage})` : ''),
          difficulty: manualForm.difficulty,
          image_url: imageUrl,
          question_type: manualForm.question_type,
          lesson_id: selectedLesson,
          is_approved: true,
          is_ai_generated: false,
          options: manualForm.options.filter(o => o.trim()).map((content: string, i: number) => ({
            content: content.trim(),
            isCorrect: i === manualForm.correctIndex,
          })),
        }],
      }
      const res = await fetch('/api/questions/save-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (json.error) alert('保存失败: ' + json.error)
      else alert('保存成功！')
    } catch (e: any) {
      alert('异常: ' + (e?.message || '未知'))
    }
    setManualSaving(false)
    setShowManualAdd(false)
    setManualForm({ stem: '', explanation: '', difficulty: 3, question_type: 'gate_test', options: ['', '', '', ''], correctIndex: 0, imageUrl: '', explanationImage: '' })
    fetch(`/api/questions?lessonId=${selectedLesson}`).then(r => r.json()).then(json => {
      setQuestions(json.questions || [])
    })
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-24 pb-20">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">题库管理</h1>
          <div className="flex items-center gap-2">
            {selectedLesson && (
              <button onClick={() => setShowManualAdd(true)}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors">
                ✏️ 手动添加
              </button>
            )}
            {questions.length > 0 && (
              <button onClick={async () => {
                if (!confirm(`确定删除此课时的全部 ${questions.length} 道题目？不可恢复！`)) return
                await fetch(`/api/questions?lessonId=${selectedLesson}`, { method: 'DELETE' })
                setQuestions([])
              }}
                className="px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors">
                🗑 清空 ({questions.length})
              </button>
            )}
            <Link href={`/teacher/ai-generate?course=${selectedCourse}&chapter=${selectedChapter}&lesson=${selectedLesson}`} className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-purple-700 transition-colors">
              🤖 AI 生成题目
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-card rounded-2xl border p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}
              className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
              <option value="">选择课程</option>
              {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={selectedChapter} onChange={e => setSelectedChapter(e.target.value)} disabled={!selectedCourse}
              className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
              <option value="">选择章节</option>
              {chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <select value={selectedLesson} onChange={e => setSelectedLesson(e.target.value)} disabled={!selectedChapter}
              className="px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 disabled:opacity-50">
              <option value="">选择课时</option>
              {lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}
            </select>
          </div>
        </div>

        {/* Questions list */}
        {selectedLesson ? (
          questions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>此课时还没有题目</p>
              <Link href="/teacher/ai-generate" className="text-purple-600 hover:underline mt-2 inline-block">去 AI 生成</Link>
            </div>
          ) : (
            <div className="space-y-3">
              {questions.map((q: any, i: number) => (
                <div key={q.id} className={`bg-card rounded-xl border p-4 ${!q.is_approved ? 'border-amber-200 bg-amber-50/30' : ''}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        q.question_type === 'gate_test' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                      }`}>{q.question_type === 'gate_test' ? '关卡' : 'BOSS'}</span>
                      <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">难度 {q.difficulty}</span>
                      {q.is_ai_generated && <span className="text-xs px-2 py-0.5 bg-purple-50 text-purple-600 rounded-full">AI</span>}
                      {!q.is_approved && <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">待批准</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleApprove(q.id, q.is_approved)}
                        className={`p-1.5 rounded-lg transition-colors ${q.is_approved ? 'hover:bg-amber-100 text-green-500' : 'hover:bg-green-100 text-amber-500'}`}
                        title={q.is_approved ? '取消批准' : '批准'}>
                        {q.is_approved ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      </button>
                      <button onClick={() => handleDelete(q.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 transition-colors" title="删除">
                        <XCircle className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm mb-2"><KatexHtml text={q.stem} /></p>
                  <div className="grid grid-cols-2 gap-1">
                    {(q.options || []).map((opt: any, j: number) => (
                      <span key={opt.id} className={`text-xs px-2 py-1 rounded ${opt.is_correct ? 'bg-green-100 text-green-800 font-semibold border border-green-300' : 'bg-gray-50 text-gray-500'}`}>
                        {opt.is_correct ? '✓ ' : ''}{String.fromCharCode(65 + j)}. <KatexHtml text={cleanOption(opt.content)} />
                      </span>
                    ))}
                  </div>
                  {q.explanation && <p className="text-xs text-blue-600 mt-2 bg-blue-50 p-2 rounded-lg"><KatexHtml text={q.explanation} /></p>}
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>请选择课程 → 章节 → 课时来查看题目</p>
          </div>
        )}
      </main>

      {/* Manual Add Modal */}
      {showManualAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowManualAdd(false)}>
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">手动添加题目</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <select value={manualForm.question_type} onChange={e => setManualForm({ ...manualForm, question_type: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="gate_test">关卡测试</option>
                  <option value="boss_test">章节BOSS</option>
                </select>
                <select value={manualForm.difficulty} onChange={e => setManualForm({ ...manualForm, difficulty: Number(e.target.value) })}
                  className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                  {[1,2,3,4,5].map(d => <option key={d} value={d}>难度 {d}</option>)}
                </select>
              </div>
              <textarea value={manualForm.stem} onChange={e => setManualForm({ ...manualForm, stem: e.target.value })}
                onPaste={(e) => handlePasteImage(e, 'stem')}
                placeholder={`题目内容（支持 LaTeX 化学式如 $H_2O$，可直接粘贴图片）${uploadingImage ? ' ⏳上传中...' : ''}`} rows={3}
                className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              {manualForm.imageUrl && (
                <div className="mt-2 relative inline-block">
                  <img src={manualForm.imageUrl} alt="题目图片" className="max-h-40 rounded-lg border" />
                  <button onClick={() => setManualForm({ ...manualForm, imageUrl: '' })}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">选项（点击圆圈标记正确答案）</label>
                {manualForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3 mb-2">
                    <button onClick={() => setManualForm({ ...manualForm, correctIndex: i })}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${
                        manualForm.correctIndex === i ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300'
                      }`}>
                      {manualForm.correctIndex === i ? '✓' : ''}
                    </button>
                    <span className="text-sm text-muted-foreground w-4">{String.fromCharCode(65 + i)}.</span>
                    <input value={opt} onChange={e => {
                      const newOpts = [...manualForm.options]; newOpts[i] = e.target.value
                      setManualForm({ ...manualForm, options: newOpts })
                    }} placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                ))}
              </div>
              <textarea value={manualForm.explanation} onChange={e => setManualForm({ ...manualForm, explanation: e.target.value })}
                onPaste={(e) => handlePasteImage(e, 'explanation')}
                placeholder="解析（支持粘贴图片）" rows={3}
                className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              {manualForm.explanationImage && (
                <div className="mt-2 relative inline-block">
                  <img src={manualForm.explanationImage} alt="解析图片" className="max-h-40 rounded-lg border" />
                  <button onClick={() => setManualForm({ ...manualForm, explanationImage: '' })}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={handleManualAdd} disabled={manualSaving}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
                  {manualSaving ? '保存中...' : '保存题目'}
                </button>
                <button onClick={() => setShowManualAdd(false)}
                  className="flex-1 py-2.5 bg-accent rounded-lg font-medium">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
