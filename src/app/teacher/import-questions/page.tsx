'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import type { Course, Chapter, Lesson } from '@/lib/types'
import { ArrowLeft, Loader2, CheckCircle, Save, X, Sparkles, Edit3 } from 'lucide-react'

interface ParsedQuestion {
  stem: string
  options: { content: string; isCorrect: boolean }[]
  explanation: string
  difficulty: number
  imageUrl?: string
  explanationImage?: string
}

// Coerce an AI-parsed item into a renderable shape, or null if it's unusable.
// Prevents a single malformed item (missing options, non-string fields) from
// crashing the preview render.
function normalizeParsed(item: any): ParsedQuestion | null {
  if (!item || typeof item !== 'object') return null
  const stem = typeof item.stem === 'string' ? item.stem.trim() : item.stem != null ? String(item.stem).trim() : ''
  if (!stem) return null
  const rawOptions: any[] = Array.isArray(item.options) ? item.options : []
  const options = rawOptions
    .map((o: any) => ({
      content: o && typeof o.content === 'string' ? o.content : o && o.content != null ? String(o.content) : '',
      isCorrect: !!(o && (o.isCorrect === true || o.is_correct === true)),
    }))
    .filter((o) => o.content.trim().length > 0)
  if (options.length < 2 || !options.some((o) => o.isCorrect)) return null
  const difficulty = Number(item.difficulty)
  return {
    stem,
    options,
    explanation: item.explanation == null ? '' : String(item.explanation),
    difficulty: Number.isFinite(difficulty) ? Math.min(5, Math.max(1, Math.round(difficulty))) : 3,
  }
}

function ImportForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, profile, loading: authLoading } = useAuth()

  const [courses, setCourses] = useState<Course[]>([])
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [lessons, setLessons] = useState<Lesson[]>([])
  const [selectedCourse, setSelectedCourse] = useState(searchParams.get('course') || '')
  const [selectedChapter, setSelectedChapter] = useState(searchParams.get('chapter') || '')
  const [selectedLesson, setSelectedLesson] = useState(searchParams.get('lesson') || '')
  const [markdownText, setMarkdownText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [questions, setQuestions] = useState<ParsedQuestion[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [courseNames, setCourseNames] = useState({ courseName: '', chapterTitle: '', lessonTitle: '' })
  const [editIndex, setEditIndex] = useState<number | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)
  const [editForm, setEditForm] = useState({
    stem: '', options: ['', '', '', ''], correctIndex: 0,
    explanation: '', difficulty: 3, imageUrl: '', explanationImage: '',
  })

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

    try {
      const res = await fetch('/api/ai/parse-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: markdownText.trim(), ...courseNames }),
      })
      const json = await res.json()
      if (json.error) { alert('解析失败：' + json.error); return }

      const raw = Array.isArray(json.questions) ? json.questions : []
      const kept: ParsedQuestion[] = []
      let skipped = 0
      for (const item of raw) {
        const n = normalizeParsed(item)
        if (n) kept.push(n)
        else skipped++
      }
      setQuestions(kept)

      const msgs: string[] = []
      if (Array.isArray(json.failed) && json.failed.length > 0) {
        const snippet = typeof json.failed[0] === 'string' ? `「${json.failed[0].slice(0, 50)}…」` : ''
        msgs.push(`有 ${json.failed.length} 段题目未能解析，已跳过${snippet ? `（从${snippet}开始）` : ''}。可把该段附近删掉或改一下再试。`)
      }
      if (skipped > 0) {
        msgs.push(`解析到 ${raw.length} 道，其中 ${skipped} 道格式异常，已自动跳过。`)
      }
      if (msgs.length > 0) alert(msgs.join('\n'))
    } catch {
      alert('解析失败，请稍后重试。若反复失败，可能是题目数量过多，建议分两次导入。')
    } finally {
      setParsing(false)
    }
  }

  const handleDeleteQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
    if (editIndex === index) setEditIndex(null)
  }

  const openEdit = (index: number) => {
    const q = questions[index]
    const opts = q.options.map(o => o.content)
    while (opts.length < 4) opts.push('')
    const ci = q.options.findIndex(o => o.isCorrect)
    setEditForm({
      stem: q.stem,
      options: opts.slice(0, 4),
      correctIndex: ci >= 0 ? ci : 0,
      explanation: q.explanation || '',
      difficulty: q.difficulty || 3,
      imageUrl: q.imageUrl || '',
      explanationImage: q.explanationImage || '',
    })
    setEditIndex(index)
  }

  const handlePasteImage = async (e: React.ClipboardEvent, field: 'stem' | 'explanation') => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) { alert('无法读取图片'); continue }
        if (file.size > 300 * 1024) {
          alert('图片需小于300KB，当前: ' + Math.round(file.size / 1024) + 'KB。请先用截图工具缩小图片。')
          continue
        }
        setUploadingImage(true)
        try {
          const fd = new FormData()
          fd.append('file', file, 'img.png')
          const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
          const json = await res.json()
          if (json.url) {
            if (field === 'stem') setEditForm(prev => ({ ...prev, imageUrl: json.url }))
            else setEditForm(prev => ({ ...prev, explanationImage: json.url }))
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

  const saveEdit = () => {
    if (editIndex === null) return
    if (!editForm.stem.trim() && !editForm.imageUrl) return alert('请输入题目内容或粘贴题目图片')
    const rows = editForm.options.map(o => o.trim())
    if (!rows[editForm.correctIndex]) return alert('正确答案对应的选项不能为空')
    const options = rows.map((content, idx) => ({ content, isCorrect: idx === editForm.correctIndex })).filter(o => o.content)
    if (options.length < 2) return alert('至少需要 2 个选项')
    setQuestions(prev => prev.map((q, idx) => idx === editIndex ? {
      ...q,
      stem: editForm.stem.trim(),
      options,
      explanation: editForm.explanation.trim(),
      difficulty: editForm.difficulty,
      imageUrl: editForm.imageUrl,
      explanationImage: editForm.explanationImage,
    } : q))
    setEditIndex(null)
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
          explanation: (q.explanation || '') + (q.explanationImage ? `\n![解析图](${q.explanationImage})` : ''),
          difficulty: q.difficulty || 3,
          question_type: 'gate_test',
          lesson_id: selectedLesson,
          is_approved: true,
          is_ai_generated: true,
          image_url: q.imageUrl || null,
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
            <p className="text-xs text-muted-foreground mb-4">审核每道题：点 ✏️ 修改题干/选项/答案或粘贴图片，点 ✕ 删除，剩下的点"全部保存"一键入库。</p>
            <div className="space-y-3">
              {questions.map((q, i) => (
                <div key={i} className="border rounded-xl p-4 relative">
                  <div className="absolute top-3 right-3 flex items-center gap-1">
                    <button onClick={() => openEdit(i)} title="编辑"
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-blue-50 hover:text-blue-500 transition-colors">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteQuestion(i)} title="删除"
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-white border border-gray-200 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2 mb-2 pr-20">
                    <span className="text-xs font-medium text-muted-foreground">#{i + 1}</span>
                    <span className="text-xs px-2 py-0.5 bg-gray-100 rounded-full">难度 {q.difficulty}</span>
                  </div>
                  {q.imageUrl && <img src={q.imageUrl} alt="" className="mb-2 rounded-lg max-h-40 border" />}
                  <p className="text-sm mb-2"><KatexHtml text={q.stem} /></p>
                  <div className="grid grid-cols-2 gap-1">
                    {q.options.map((opt, j) => (
                      <span key={j} className={`text-xs px-2 py-1 rounded ${opt.isCorrect ? 'bg-green-50 text-green-700 font-medium' : 'bg-gray-50 text-gray-600'}`}>
                        {String.fromCharCode(65 + j)}. <KatexHtml text={cleanOption(opt.content)} />
                      </span>
                    ))}
                  </div>
                  {q.explanation && <p className="text-xs text-blue-600 mt-2 bg-blue-50 p-2 rounded-lg"><KatexHtml text={q.explanation} /></p>}
                  {q.explanationImage && <img src={q.explanationImage} alt="" className="mt-2 rounded-lg max-h-40 border" />}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Edit question modal */}
      {editIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setEditIndex(null)}>
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-semibold mb-4">编辑第 {editIndex + 1} 题</h2>
            <div className="space-y-4">
              <select value={editForm.difficulty} onChange={e => setEditForm({ ...editForm, difficulty: Number(e.target.value) })}
                className="px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500">
                {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>难度 {d}</option>)}
              </select>
              <textarea value={editForm.stem} onChange={e => setEditForm({ ...editForm, stem: e.target.value })}
                onPaste={(e) => handlePasteImage(e, 'stem')}
                placeholder={`题目内容（支持 LaTeX，可直接粘贴图片）${uploadingImage ? ' ⏳上传中...' : ''}`} rows={3}
                className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              {editForm.imageUrl && (
                <div className="relative inline-block">
                  <img src={editForm.imageUrl} alt="题目图片" className="max-h-40 rounded-lg border" />
                  <button onClick={() => setEditForm({ ...editForm, imageUrl: '' })}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-2">选项（点击圆圈标记正确答案）</label>
                {editForm.options.map((opt, i) => (
                  <div key={i} className="flex items-center gap-3 mb-2">
                    <button onClick={() => setEditForm({ ...editForm, correctIndex: i })}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 ${editForm.correctIndex === i ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-gray-300'}`}>
                      {editForm.correctIndex === i ? '✓' : ''}
                    </button>
                    <span className="text-sm text-muted-foreground w-4">{String.fromCharCode(65 + i)}.</span>
                    <input value={opt} onChange={e => { const n = [...editForm.options]; n[i] = e.target.value; setEditForm({ ...editForm, options: n }) }}
                      placeholder={`选项 ${String.fromCharCode(65 + i)}`}
                      className="flex-1 px-3 py-2 border rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                  </div>
                ))}
              </div>
              <textarea value={editForm.explanation} onChange={e => setEditForm({ ...editForm, explanation: e.target.value })}
                onPaste={(e) => handlePasteImage(e, 'explanation')}
                placeholder="解析（支持粘贴图片）" rows={3}
                className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
              {editForm.explanationImage && (
                <div className="relative inline-block">
                  <img src={editForm.explanationImage} alt="解析图片" className="max-h-40 rounded-lg border" />
                  <button onClick={() => setEditForm({ ...editForm, explanationImage: '' })}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center">✕</button>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={saveEdit} disabled={uploadingImage}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">保存修改</button>
                <button onClick={() => setEditIndex(null)} className="flex-1 py-2.5 bg-accent rounded-lg font-medium">取消</button>
              </div>
            </div>
          </div>
        </div>
      )}
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
