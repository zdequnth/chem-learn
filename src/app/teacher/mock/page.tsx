'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption } from '@/components/KatexSpan'
import type { Course } from '@/lib/types'
import { kindTheme } from '@/lib/course-kind'
import { ArrowLeft, Loader2, Plus, Sparkles, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, X, Save, FileText, Shuffle } from 'lucide-react'
import { useLang } from '@/lib/i18n'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

interface OutChapter { id: string; title: string; lessons: { ref: string; id: string; title: string }[] }
interface DraftOption { content: string; isCorrect: boolean }
interface DraftQuestion {
  id?: string                       // set once saved
  stem: string
  explanation: string
  difficulty: number
  imageUrl: string
  lessonId: string
  lessonRef: string | null
  chapterTitle: string | null
  lessonTitle: string | null
  options: DraftOption[]
  aiGenerated: boolean
}
interface PaperRow { id: string; title: string; durationMinutes: number; questionCount: number; attemptCount: number; isPublished: boolean }

function MockAdminContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const { user, profile, loading: authLoading } = useAuth()
  const { lang } = useLang()
  const theme = kindTheme('mock')

  const [courses, setCourses] = useState<Course[]>([])
  const [courseId, setCourseId] = useState('')
  const [papers, setPapers] = useState<PaperRow[]>([])
  const [loading, setLoading] = useState(true)

  // editor state. `open` is what shows the editor — it used to be implied by
  // "title or questions are non-empty", but both are set INSIDE the editor, so
  // 「新建试卷」 produced no visible change at all.
  const [open, setOpen] = useState(false)
  const [paperId, setPaperId] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [duration, setDuration] = useState(60)
  const [questions, setQuestions] = useState<DraftQuestion[]>([])
  const [published, setPublished] = useState(false)

  const [outline, setOutline] = useState<OutChapter[]>([])
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [importText, setImportText] = useState('')
  const [busy, setBusy] = useState<'' | 'parse' | 'save' | 'load'>('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  // only mock courses belong here
  useEffect(() => {
    if (!profile) return
    fetch('/api/courses').then(r => r.json()).then((j) => {
      const list = ((j.courses || []) as Course[]).filter(c => c.kind === 'mock')
      setCourses(list)
      const want = sp.get('course')
      setCourseId(prev => prev || (want && list.some(c => c.id === want) ? want : list[0]?.id) || '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [profile])

  useEffect(() => { if (courseId) localStorage.setItem('mockmgmt.course', courseId) }, [courseId])

  const loadPapers = async (cid: string) => {
    const j = await fetch(`/api/mock/papers?courseId=${cid}`).then(r => r.json())
    setPapers(j.papers || [])
    return j
  }

  // course changed → reload papers + the bound course outline
  useEffect(() => {
    if (!courseId) return
    setOpen(false); setPaperId(null); setQuestions([]); setTitle(''); setImportText(''); setDirty(false)
    loadPapers(courseId)
    fetch(`/api/mock/outline?courseId=${courseId}`).then(r => r.json()).then((j) => {
      setOutline(j.chapters || [])
      setSourceName(j.courseName || null)
    })
  }, [courseId])

  const openPaper = async (id: string, titleHint: string, durationHint: number) => {
    setBusy('load'); setOpen(true); setPaperId(id); setTitle(titleHint); setDuration(durationHint)
    try {
      const j = await fetch(`/api/mock/papers/${id}`).then(r => r.json())
      if (j.error) { alert('读取失败：' + j.error); return }
      setTitle(j.paper.title); setDuration(j.paper.durationMinutes); setPublished(!!j.paper.isPublished)
      setQuestions((j.questions || []).map((q: any) => ({
        id: q.id, stem: q.stem, explanation: q.explanation || '', difficulty: q.difficulty,
        imageUrl: q.imageUrl || '', lessonId: q.lessonId, lessonRef: q.lessonRef,
        chapterTitle: q.chapterTitle, lessonTitle: q.lessonTitle,
        options: (q.options || []).map((o: any) => ({ content: o.content, isCorrect: o.isCorrect })),
        aiGenerated: true,
      })))
      setImportText(''); setDirty(false)
    } finally { setBusy('') }
  }

  const startNewPaper = () => {
    setOpen(true)
    setPaperId(null); setQuestions([]); setTitle(''); setDuration(60); setImportText(''); setDirty(false); setPublished(false)
  }

  const togglePublish = async (id: string, next: boolean) => {
    const r = await fetch(`/api/mock/papers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: next }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return alert('操作失败：' + (j.error || r.status))
    if (paperId === id) setPublished(next)
    loadPapers(courseId)
  }

  const handleParse = async () => {
    if (!importText.trim()) return alert('先粘贴试卷文本')
    if (!courseId) return
    setBusy('parse'); setProgress(null)
    let i = 0, total = 1, failed = 0
    try {
      // One batch per request, looping here. A whole paper is 10+ LLM calls;
      // sending them all in one request blew the serverless timeout, and the
      // platform's error page is what surfaced as "is not valid JSON".
      while (i < total) {
        const res = await fetch('/api/ai/parse-mock-paper', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: importText, courseId, batchIndex: i }),
        })
        const raw = await res.text()
        let j: any = {}
        try { j = raw ? JSON.parse(raw) : {} }
        catch { throw new Error(`第 ${i + 1} 批的响应不是 JSON（HTTP ${res.status}）`) }
        if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`)

        total = j.totalBatches || 1
        if (j.failed?.length) failed++
        const batch: DraftQuestion[] = (j.questions || []).map((q: any) => ({
          stem: q.stem, explanation: q.explanation || '', difficulty: q.difficulty,
          imageUrl: q.imageUrl || '', lessonId: q.lessonId || '', lessonRef: q.lessonRef,
          chapterTitle: q.chapterTitle, lessonTitle: q.lessonTitle,
          options: (q.options || []).map((o: any) => ({ content: o.content, isCorrect: o.isCorrect })),
          aiGenerated: true,
        }))
        if (batch.length) { setQuestions(prev => [...prev, ...batch]); setDirty(true) }
        i++
        setProgress({ done: i, total })
      }
      if (failed) alert(`解析完成，但有 ${failed} 批失败。再点一次「AI 解析」会从头再跑一遍（已解析的题不会重复添加，手动核对时去重即可）。`)
    } catch (e: any) {
      alert('解析出错：' + (e?.message || e) + (i > 0 ? `\n第 ${i} 批之前的题目已经放进列表，没丢。` : ''))
    } finally { setBusy(''); setProgress(null) }
  }

  const patchQ = (i: number, patch: Partial<DraftQuestion>) => {
    setQuestions(prev => prev.map((q, k) => (k === i ? { ...q, ...patch } : q))); setDirty(true)
  }
  const moveQ = (i: number, dir: -1 | 1) => {
    setQuestions(prev => {
      const n = [...prev]; const t = i + dir
      if (t < 0 || t >= n.length) return prev
      ;[n[i], n[t]] = [n[t], n[i]]; return n
    }); setDirty(true)
  }
  const removeQ = (i: number) => {
    const q = questions[i]
    if (q.id && !confirm('这道题已经存进试卷了，删除后学生学习记录也会一起删掉。确定？')) return
    setQuestions(prev => prev.filter((_, k) => k !== i)); setDirty(true)
  }
  // MinerU 有时会把两栏排版的选项读串（A/B/C 属性和题对不上），一键换顺序后手工改
  const shuffleOptions = (i: number) => {
    const q = questions[i]
    const rotated = [...q.options.slice(1), q.options[0]]
    patchQ(i, { options: rotated })
  }

  const setOptionText = (qi: number, oi: number, content: string) => {
    const q = questions[qi]
    patchQ(qi, { options: q.options.map((o, k) => (k === oi ? { ...o, content } : o)) })
  }
  const setCorrect = (qi: number, oi: number) => {
    const q = questions[qi]
    patchQ(qi, { options: q.options.map((o, k) => ({ ...o, isCorrect: k === oi })) })
  }
  const addOption = (qi: number) => patchQ(qi, { options: [...questions[qi].options, { content: '', isCorrect: false }] })
  const removeOption = (qi: number, oi: number) => {
    const q = questions[qi]
    if (q.options.length <= 2) return alert('至少要有两个选项')
    patchQ(qi, { options: q.options.filter((_, k) => k !== oi) })
  }

  const uploadImage = async (i: number, file: File) => {
    setUploadingIdx(i)
    try {
      const fd = new FormData(); fd.append('file', file)
      const r = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const j = await r.json()
      if (j.url) patchQ(i, { imageUrl: j.url })
      else alert('上传失败：' + (j.error || r.status))
    } finally { setUploadingIdx(null) }
  }

  const handlePaste = (i: number) => async (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    const file = item.getAsFile()
    if (file) await uploadImage(i, file)
  }

  const handleSave = async () => {
    if (!courseId) return
    if (!title.trim()) return alert('请填试卷标题')
    if (questions.length === 0) return alert('还没有题目')
    const noLesson = questions.findIndex(q => !q.lessonId)
    if (noLesson >= 0) return alert(`第 ${noLesson + 1} 题还没有选所属章节课时`)
    setBusy('save')
    try {
      const payload = questions.map(q => ({
        stem: q.stem, explanation: q.explanation, difficulty: q.difficulty,
        imageUrl: q.imageUrl || null, lessonId: q.lessonId,
        options: q.options.filter(o => o.content.trim()),
      }))
      const res = await fetch('/api/mock/papers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, title, durationMinutes: duration, questions: payload }),
      })
      const j = await res.json()
      if (!res.ok || j.error) { alert('保存失败：' + (j.error || res.status)); return }
      alert(`已保存：${j.saved} 道题` + (j.imageWarnings?.length ? `\n⚠️ ${j.imageWarnings.join('；')}` : ''))
      setDirty(false)
      await loadPapers(courseId)
      await openPaper(j.paperId, title, duration)
    } catch (e: any) {
      alert('保存出错：' + (e?.message || e))
    } finally { setBusy('') }
  }

  const deletePaper = async (id: string, t: string) => {
    if (!confirm(`删除试卷「${t}」？里面的题目和学生的作答记录都会一并删除。`)) return
    const r = await fetch(`/api/mock/papers/${id}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return alert('删除失败：' + (j.error || r.status))
    if (paperId === id) startNewPaper()
    loadPapers(courseId)
  }

  const lessonOptions = useMemo(() => outline.flatMap(c => c.lessons.map(l => ({ ...l, chapter: c.title }))), [outline])
  const qWarn = useMemo(() => ({
    lesson: questions.filter(q => !q.lessonId).length,
    options: questions.filter(q => q.options.length < 2).length,
    answer: questions.filter(q => q.options.length >= 2 && q.options.filter(o => o.isCorrect).length !== 1).length,
  }), [questions])
  const refLabel = (q: DraftQuestion) => {
    if (!q.lessonId) return { text: '未指定课时', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
    const hit = lessonOptions.find(l => l.id === q.lessonId)
    return { text: hit ? `${hit.chapter} › ${hit.ref} ${hit.title}` : '课时无效', cls: 'bg-violet-50 text-violet-700 border-violet-200' }
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 pt-24 pb-24">
        <div className="flex items-center justify-between mb-6">
          <div>
            <Link href="/teacher/courses" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-2 transition-colors">
              <ArrowLeft className="w-4 h-4" /> {lang === 'zh' ? '返回课程管理' : 'Back to courses'}
            </Link>
            <h1 className="text-2xl font-bold flex items-center gap-2">{theme.emoji} {lang === 'zh' ? '模拟考 · 试卷管理' : 'Mock exams'}</h1>
            {sourceName && (
              <p className="text-sm text-muted-foreground mt-1">
                {lang === 'zh' ? <>题目对应到绑定课程 <span className="font-medium text-violet-700">{sourceName}</span> 的章节和课时</> : <>Questions map to chapters/lessons of <span className="font-medium">{sourceName}</span></>}
              </p>
            )}
          </div>
        </div>

        {courses.length === 0 && !loading ? (
          <div className="bg-card border rounded-2xl p-10 text-center">
            <div className="text-5xl mb-3">📝</div>
            <p className="text-muted-foreground mb-4">{lang === 'zh' ? '还没有模拟考课程。先在课程管理里新建一门（类型选「模拟考课程」，并绑定一门过关课程）。' : 'No mock course yet.'}</p>
            <Link href="/teacher/courses" className={`inline-block px-4 py-2 rounded-lg text-white font-medium ${theme.solid}`}>{lang === 'zh' ? '去新建课程' : 'New course'}</Link>
          </div>
        ) : (
          <>
            <div className="bg-card border rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{lang === 'zh' ? '课程' : 'Course'}</span>
              <select value={courseId} onChange={e => setCourseId(e.target.value)} className="px-3 py-2 border rounded-lg bg-background text-sm">
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={startNewPaper} className={`ml-auto flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-white ${theme.solid}`}>
                <Plus className="w-4 h-4" /> {lang === 'zh' ? '新建试卷' : 'New paper'}
              </button>
            </div>

            {/* paper list */}
            <div className="bg-card border rounded-2xl divide-y mb-6">
              {papers.length === 0 && <div className="p-6 text-sm text-muted-foreground">{lang === 'zh' ? '这门课还没有试卷。点「新建试卷」，粘一份试卷文本让 AI 拆题。' : 'No papers yet.'}</div>}
              {papers.map(p => (
                <div key={p.id} className={`p-4 flex items-center gap-3 flex-wrap ${paperId === p.id ? 'bg-violet-50' : ''}`}>
                  <FileText className="w-5 h-5 text-violet-500 shrink-0" />
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {p.title}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.isPublished ? '已发布' : '未发布'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.durationMinutes} 分钟 · {p.questionCount} 题 · {p.attemptCount} 人次考过</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => togglePublish(p.id, !p.isPublished)}
                      className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        p.isPublished ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                      {p.isPublished ? '取消发布' : '发布'}
                    </button>
                    <button onClick={() => openPaper(p.id, p.title, p.durationMinutes)} className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium ${theme.button}`}>
                      {lang === 'zh' ? '编辑' : 'Edit'}
                    </button>
                    <button onClick={() => deletePaper(p.id, p.title)} className="shrink-0 p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>

            {/* editor */}
            {open && (
              <div className="space-y-4">
                <div className="bg-card border rounded-2xl p-5">
                  <div className="flex flex-wrap items-center gap-3">
                    <input value={title} onChange={e => { setTitle(e.target.value); setDirty(true) }}
                      placeholder={lang === 'zh' ? '试卷标题（如 AP Chem 2012 模拟一）' : 'Paper title'}
                      className="flex-1 min-w-[240px] px-3 py-2 border rounded-lg bg-background" />
                    <label className="text-sm flex items-center gap-2">
                      {lang === 'zh' ? '时长' : 'Minutes'}
                      <input type="number" min={1} max={600} value={duration}
                        onChange={e => { setDuration(Number(e.target.value)); setDirty(true) }}
                        className="w-20 px-3 py-2 border rounded-lg bg-background" />
                      {lang === 'zh' ? '分钟' : 'min'}
                    </label>
                    <button onClick={handleSave} disabled={busy !== ''}
                      className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${theme.solid}`}>
                      {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {paperId ? (lang === 'zh' ? '另存为新试卷' : 'Save as new') : (lang === 'zh' ? '保存试卷' : 'Save paper')}
                    </button>
                    <button onClick={() => { if (!dirty || confirm('有未保存的改动，确定关闭？')) setOpen(false) }}
                      className="px-3 py-2 border rounded-lg text-sm hover:bg-accent transition-colors">
                      {lang === 'zh' ? '关闭' : 'Close'}
                    </button>
                  </div>
                  <div className="text-xs mt-2 space-y-1">
                    {paperId ? (
                      <>
                        <p className={`flex items-center gap-2 ${published ? 'text-emerald-700' : 'text-gray-600'}`}>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                            {published ? '已发布' : '未发布'}
                          </span>
                          {published ? '学生现在看得到这套卷子。' : '学生看不到这套卷子——审完确认无误再发布。'}
                          <button onClick={() => togglePublish(paperId, !published)}
                            className={`px-2 py-0.5 rounded-md font-medium ${published ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                            {published ? '取消发布' : '立即发布'}
                          </button>
                        </p>
                        <p className="text-amber-700">
                          ⚠️ 已保存的试卷改完再点保存会**新建一份**，不会覆盖原卷——学生已经考过的记录不受影响。
                        </p>
                      </>
                    ) : (
                      <p className="text-gray-600">
                        新卷子保存后默认是**未发布**的，学生看不到；审核确认无误后在上面的列表里点「发布」。
                      </p>
                    )}
                  </div>
                </div>

                {/* import */}
                <div className="bg-card border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" /> {lang === 'zh' ? '粘贴试卷文本 → AI 拆题' : 'Paste paper text'}</h2>
                  </div>
                  <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={7}
                    placeholder={lang === 'zh' ? '把整套试卷的文本粘进来（MinerU 转出的 markdown 可以直接用）。AI 会拆成题目，并自动判断每题对应绑定课程的哪一章哪一课时。' : 'Paste the whole paper…'}
                    className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={handleParse} disabled={busy !== ''}
                      className="flex items-center gap-1 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50">
                      {busy === 'parse' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {busy === 'parse'
                        ? (progress ? `解析中… 第 ${progress.done}/${progress.total} 批` : 'AI 解析中…')
                        : (lang === 'zh' ? 'AI 解析' : 'Parse')}
                    </button>
                    <span className="text-xs text-muted-foreground">
                      {lang === 'zh' ? '解析结果会追加到下面；这套试卷没有答案，AI 会自己解题，答案和解析都是草稿，请逐题核对。' : ''}
                    </span>
                  </div>
                  {progress && (
                    <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                      <div className="h-full bg-violet-500 transition-all"
                        style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                    </div>
                  )}
                  {/* Warnings recomputed from the list itself, so they stay correct
                      across a multi-batch import instead of flashing per batch. */}
                  {(qWarn.lesson || qWarn.options || qWarn.answer) > 0 && (
                    <div className="mt-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-0.5">
                      {qWarn.lesson > 0 && <div>⚠️ {qWarn.lesson} 题没能自动对应章节课时，请手动选</div>}
                      {qWarn.options > 0 && <div>⚠️ {qWarn.options} 题的选项没拆出来，需要手工补（在列表里，别漏掉）</div>}
                      {qWarn.answer > 0 && <div>⚠️ {qWarn.answer} 题的正确答案不是恰好 1 个（AI 解错了或漏标），请检查</div>}
                    </div>
                  )}
                </div>

                {/* question review */}
                {questions.length > 0 && (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">{lang === 'zh' ? `共 ${questions.length} 题` : `${questions.length} questions`}</div>
                    {questions.map((q, i) => {
                      const ref = refLabel(q)
                      return (
                        <div key={i} className="bg-card border rounded-2xl p-4">
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <span className="w-7 h-7 rounded-lg bg-violet-100 text-violet-800 text-sm font-semibold flex items-center justify-center shrink-0">{i + 1}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${ref.cls}`}>{ref.text}</span>
                            <label className="text-xs text-muted-foreground flex items-center gap-1">
                              难度
                              <input type="number" min={1} max={5} value={q.difficulty}
                                onChange={e => patchQ(i, { difficulty: Math.min(5, Math.max(1, Number(e.target.value) || 3)) })}
                                className="w-14 px-2 py-0.5 border rounded bg-background text-xs" />
                            </label>
                            <div className="ml-auto flex items-center gap-1">
                              <button onClick={() => shuffleOptions(i)} title="把选项循环挪一位（对付两栏排版被读串的情况）" className="p-1.5 rounded hover:bg-accent text-muted-foreground"><Shuffle className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveQ(i, -1)} disabled={i === 0} className="p-1.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveQ(i, 1)} disabled={i === questions.length - 1} className="p-1.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                              <button onClick={() => removeQ(i)} className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>

                          {/* stem + kaTeX preview */}
                          <textarea value={q.stem} onChange={e => patchQ(i, { stem: e.target.value })} rows={3}
                            onPaste={handlePaste(i)}
                            placeholder="题干（支持 LaTeX；可直接 Ctrl+V 贴图）"
                            className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
                          <div className="mt-1 px-3 py-2 bg-gray-50 border rounded-lg text-sm">
                            <KatexHtml text={q.stem} />
                          </div>

                          {/* image */}
                          <div className="flex items-center gap-2 mt-2">
                            <label className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer ${theme.button}`}>
                              <ImageIcon className="w-3.5 h-3.5" />
                              {uploadingIdx === i ? '上传中…' : '配图'}
                              <input type="file" accept="image/*" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(i, f) }} />
                            </label>
                            {q.imageUrl && (
                              <>
                                <button onClick={() => setZoom(q.imageUrl)} className="border rounded p-0.5">
                                  <img src={q.imageUrl} alt="" className="h-14 w-20 object-contain bg-white" />
                                </button>
                                <button onClick={() => patchQ(i, { imageUrl: '' })} className="text-xs text-red-500 hover:underline">移除配图</button>
                              </>
                            )}
                            <span className="text-xs text-muted-foreground">{lang === 'zh' ? '带图/表格的题建议截图粘贴（学生会看到这张图）' : ''}</span>
                          </div>

                          {/* options */}
                          <div className="mt-3 space-y-1.5">
                            {q.options.map((o, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                <button onClick={() => setCorrect(i, oi)} title="设为正确答案"
                                  className={`w-6 h-6 rounded-full border text-xs font-semibold shrink-0 ${o.isCorrect ? 'bg-emerald-500 border-emerald-500 text-white' : 'hover:bg-accent text-muted-foreground'}`}>
                                  {LETTERS[oi]}
                                </button>
                                <input value={o.content} onChange={e => setOptionText(i, oi, e.target.value)}
                                  className="flex-1 px-3 py-1.5 border rounded-lg bg-background font-mono text-xs" />
                                <span className="text-xs text-muted-foreground w-40 truncate hidden sm:block"><KatexHtml text={cleanOption(o.content)} /></span>
                                <button onClick={() => removeOption(i, oi)} className="p-1 text-red-300 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                              </div>
                            ))}
                            <button onClick={() => addOption(i)} className="text-xs text-muted-foreground hover:text-foreground">+ 加一个选项</button>
                          </div>

                          {/* explanation */}
                          <textarea value={q.explanation} onChange={e => patchQ(i, { explanation: e.target.value })} rows={2}
                            placeholder="解析（AI 草稿，请核对）"
                            className="mt-3 w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />

                          {/* lesson picker */}
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-xs text-muted-foreground shrink-0">所属章节课时</span>
                            <select value={q.lessonId} onChange={e => {
                              const hit = lessonOptions.find(l => l.id === e.target.value)
                              patchQ(i, { lessonId: e.target.value, lessonRef: hit?.ref ?? null, chapterTitle: hit?.chapter ?? null, lessonTitle: hit?.title ?? null })
                            }} className="flex-1 px-2 py-1.5 border rounded-lg bg-background text-xs">
                              <option value="">— 请选择 —</option>
                              {outline.map(c => (
                                <optgroup key={c.id} label={c.title}>
                                  {c.lessons.map(l => <option key={l.id} value={l.id}>{l.ref} {l.title}</option>)}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>

      {zoom && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-3" onClick={() => setZoom(null)}>
          <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg bg-white object-contain" />
        </div>
      )}
    </div>
  )
}

export default function MockAdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-violet-500 animate-spin" /></div>}>
      <MockAdminContent />
    </Suspense>
  )
}
