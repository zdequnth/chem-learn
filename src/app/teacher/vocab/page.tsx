'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import VocabAnalyticsPanel from '@/components/VocabAnalyticsPanel'
import CourseCollaborators from '@/components/CourseCollaborators'
import type { Course, Chapter, Lesson } from '@/lib/types'
import { Loader2, Plus, ClipboardPaste, Trash2, Edit3, X, ImagePlus } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

type WordForm = {
  id?: string
  term: string; ipa: string; pos: string; zh: string
  en_def: string; example_en: string; example_zh: string
  note: string; difficulty: number; image_url: string
}

const EMPTY_WORD: WordForm = {
  term: '', ipa: '', pos: '', zh: '',
  en_def: '', example_en: '', example_zh: '', note: '', difficulty: 1, image_url: '',
}

// AI output usually arrives wrapped in ```json fences; strip them before parsing.
function parseWordJson(text: string): any[] {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')
  const parsed = JSON.parse(cleaned)
  const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.words) ? parsed.words : null
  if (!arr) throw new Error('顶层要是数组，或 { "words": [...] }')
  return arr.map((w: any) => ({
    term: String(w?.term ?? '').trim(),
    ipa: String(w?.ipa ?? '').trim(),
    pos: String(w?.pos ?? '').trim(),
    zh: String(w?.zh ?? '').trim(),
    en_def: String(w?.en_def ?? '').trim(),
    example_en: String(w?.example_en ?? '').trim(),
    example_zh: String(w?.example_zh ?? '').trim(),
    note: String(w?.note ?? '').trim(),
    difficulty: [1, 2, 3].includes(Number(w?.difficulty)) ? Number(w.difficulty) : 1,
  })).filter((w: any) => w.term && w.zh)
}

function VocabAdminContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const { user, profile, loading: authLoading } = useAuth()
  const { lang } = useLang()

  const [courses, setCourses] = useState<Course[]>([])
  const [allChapters, setAllChapters] = useState<Chapter[]>([])
  const [allLessons, setAllLessons] = useState<Lesson[]>([])
  const [selectedCourse, setSelectedCourse] = useState(sp.get('course') || '')
  const [selectedChapter, setSelectedChapter] = useState(sp.get('chapter') || '')
  const [selectedLesson, setSelectedLesson] = useState(sp.get('lesson') || '')
  const [words, setWords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editWord, setEditWord] = useState<WordForm | null>(null)
  const [saving, setSaving] = useState(false)

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importPreview, setImportPreview] = useState<any[]>([])
  const [uploading, setUploading] = useState(false)

  // 词库管理 (authoring) / 掌握情况 (student mastery stats) / 协作者
  const [tab, setTab] = useState<'bank' | 'stats' | 'collab'>('bank')
  const [statScope, setStatScope] = useState<'course' | 'class'>('course')
  const [statCourseId, setStatCourseId] = useState('')
  const [statClassId, setStatClassId] = useState('')
  const [classes, setClasses] = useState<any[]>([])

  // Illustrations are pasted straight into the form; the upload route puts the
  // file in Supabase Storage and hands back a public URL for image_url.
  const uploadFile = async (file: File) => {
    if (file.size > 1024 * 1024) {
      alert(`图片需小于 1MB，当前 ${Math.round(file.size / 1024)}KB。请先用截图工具缩小。`)
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file, 'img.png')
      const res = await fetch('/api/upload-image', { method: 'POST', body: fd })
      const json = await res.json()
      if (json.url) setEditWord(w => (w ? { ...w, image_url: json.url } : w))
      else alert('上传失败：' + (json.error || '服务器无响应'))
    } catch (e: any) {
      alert('上传异常：' + e.message)
    }
    setUploading(false)
  }

  const handlePasteImage = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const f = item.getAsFile()
        if (f) uploadFile(f)
        return
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
    fetch('/api/classes').then(r => r.json()).then(j => setClasses(j.classes || [])).catch(() => {})
    ;(async () => {
      const res = await fetch('/api/courses')
      const json = await res.json()
      // Only vocabulary courses belong on this page — a gate-test course has no
      // word bank, and preloading chapters/lessons for every course would pull
      // a lot of pointless data.
      const clist = ((json.courses || []) as Course[]).filter(c => (c as any).kind === 'vocab')
      setCourses(clist)
      const allCh: Chapter[] = []
      const allLn: Lesson[] = []
      await Promise.all(clist.map(async (c) => {
        const r = await fetch(`/api/student/course-data?courseId=${c.id}`)
        const j = await r.json()
        ;(j.chapters || []).forEach((ch: any) => allCh.push(ch))
        ;(j.lessons || []).forEach((l: any) => allLn.push(l))
      }))
      setAllChapters(allCh)
      setAllLessons(allLn)
      setLoading(false)
    })()
  }, [profile])

  useEffect(() => {
    setSelectedCourse((prev) => prev || localStorage.getItem('vocabmgmt.course') || '')
    setSelectedChapter((prev) => prev || localStorage.getItem('vocabmgmt.chapter') || '')
    setSelectedLesson((prev) => prev || localStorage.getItem('vocabmgmt.lesson') || '')
  }, [])
  useEffect(() => { if (selectedCourse) localStorage.setItem('vocabmgmt.course', selectedCourse) }, [selectedCourse])
  useEffect(() => { if (selectedChapter) localStorage.setItem('vocabmgmt.chapter', selectedChapter) }, [selectedChapter])
  useEffect(() => { if (selectedLesson) localStorage.setItem('vocabmgmt.lesson', selectedLesson) }, [selectedLesson])

  // Always keep a valid course selected, so the 掌握情况 / 协作者 tabs work even
  // when the teacher lands here without a ?course= (or with a stale one).
  useEffect(() => {
    if (courses.length === 0) return
    setSelectedCourse(prev => (prev && courses.some(c => c.id === prev)) ? prev : courses[0].id)
  }, [courses])

  const filteredChapters = allChapters.filter((ch: any) => ch.course_id === selectedCourse)
  const filteredLessons = allLessons.filter((l: any) => l.chapter_id === selectedChapter)

  const refetch = () => {
    if (!selectedLesson) { setWords([]); return }
    fetch(`/api/vocab/words?lessonId=${selectedLesson}`)
      .then(r => r.json())
      .then(json => setWords(json.words || []))
  }
  useEffect(refetch, [selectedLesson])

  const saveWord = async () => {
    if (!editWord) return
    if (!editWord.term.trim() || !editWord.zh.trim()) { alert('术语和中文释义不能为空'); return }
    setSaving(true)
    if (editWord.id) {
      const res = await fetch('/api/vocab/words', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editWord),
      })
      const json = await res.json().catch(() => ({} as any))
      if (!res.ok || json.error) { alert('保存失败：' + (json.error || res.status)); setSaving(false); return }
    } else {
      const res = await fetch('/api/vocab/words', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lesson_id: selectedLesson, words: [editWord] }),
      })
      const json = await res.json().catch(() => ({} as any))
      if (!res.ok || json.error) { alert('保存失败：' + (json.error || res.status)); setSaving(false); return }
      if (json.saved === 0) { alert('该词已存在，未重复添加'); setSaving(false); return }
    }
    setSaving(false)
    setEditWord(null)
    refetch()
  }

  const deleteWord = async (w: any) => {
    if (!confirm(`确定删除「${w.term}」？学生的学习进度也会一并删除。`)) return
    const res = await fetch(`/api/vocab/words?id=${w.id}`, { method: 'DELETE' })
    const json = await res.json().catch(() => ({} as any))
    if (!res.ok || json.error) { alert('删除失败：' + (json.error || res.status)); return }
    refetch()
  }

  const previewImport = () => {
    try {
      const list = parseWordJson(importText)
      if (list.length === 0) { alert('没解析出有效词条（term 和 zh 不能为空）'); return }
      setImportPreview(list)
    } catch (e: any) {
      alert('JSON 解析失败：' + e.message)
    }
  }

  const confirmImport = async () => {
    if (importPreview.length === 0) return
    setSaving(true)
    const res = await fetch('/api/vocab/words', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: selectedLesson, words: importPreview }),
    })
    const json = await res.json().catch(() => ({} as any))
    setSaving(false)
    if (!res.ok || json.error) { alert('导入失败：' + (json.error || res.status)); return }
    alert(`导入完成：新增 ${json.saved} 条${json.skipped ? `，跳过 ${json.skipped} 条（重复或字段不全）` : ''}`)
    setShowImport(false)
    setImportText('')
    setImportPreview([])
    refetch()
  }

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 pt-24 pb-20">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">{lang === 'zh' ? '词汇管理' : 'Vocabulary'}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {lang === 'zh' ? '按课时维护词库；可用 AI 生成 JSON 后粘贴导入。' : 'Maintain the word bank per lesson; paste AI-generated JSON to import.'}
            </p>
          </div>
        </div>

        {/* 词库管理 / 掌握情况 — vocabulary lives here, not inside 学情分析 */}
        <div className="flex gap-1 border rounded-xl p-1 mb-5 w-fit">
          <button onClick={() => setTab('bank')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'bank' ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
            {lang === 'zh' ? '词库管理' : 'Word bank'}
          </button>
          <button onClick={() => setTab('stats')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'stats' ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
            {lang === 'zh' ? '掌握情况' : 'Mastery'}
          </button>
          <button onClick={() => setTab('collab')}
            className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'collab' ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
            {lang === 'zh' ? '协作者' : 'Collaborators'}
          </button>
        </div>

        {tab === 'collab' ? (
          selectedCourse ? (
            <CourseCollaborators courseId={selectedCourse} />
          ) : (
            <div className="bg-card border rounded-2xl p-10 text-center text-muted-foreground">
              {lang === 'zh' ? '请先选择课程' : 'Pick a course first'}
            </div>
          )
        ) : tab === 'stats' ? (
          <>
            <div className="bg-card border rounded-2xl p-4 mb-6 flex flex-wrap items-center gap-3">
              <div className="flex gap-1 border rounded-lg overflow-hidden text-xs">
                <button onClick={() => setStatScope('course')}
                  className={`px-3 py-1.5 transition-colors ${statScope === 'course' ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
                  {lang === 'zh' ? '按课程' : 'By course'}
                </button>
                <button onClick={() => setStatScope('class')}
                  className={`px-3 py-1.5 transition-colors ${statScope === 'class' ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
                  {lang === 'zh' ? '按班级' : 'By class'}
                </button>
              </div>
              {statScope === 'course' ? (
                <select value={statCourseId} onChange={e => setStatCourseId(e.target.value)}
                  className="px-3 py-2 border rounded-lg bg-background text-sm">
                  <option value="">{lang === 'zh' ? '选择课程' : 'Course'}</option>
                  {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              ) : (
                <select value={statClassId} onChange={e => setStatClassId(e.target.value)}
                  className="px-3 py-2 border rounded-lg bg-background text-sm">
                  <option value="">{lang === 'zh' ? '选择班级' : 'Class'}</option>
                  {classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              )}
            </div>
            <VocabAnalyticsPanel scope={statScope} courseId={statCourseId} classId={statClassId} />
          </>
        ) : (
        <>
        {/* Cascading selects */}
        <div className="bg-card border rounded-2xl p-4 mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          <select value={selectedCourse} onChange={e => { setSelectedCourse(e.target.value); setSelectedChapter(''); setSelectedLesson('') }}
            className="w-full px-3 py-2 border rounded-lg bg-background text-sm">
            <option value="">{lang === 'zh' ? '选择课程' : 'Course'}</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={selectedChapter} onChange={e => { setSelectedChapter(e.target.value); setSelectedLesson('') }}
            disabled={!selectedCourse}
            className="w-full px-3 py-2 border rounded-lg bg-background text-sm disabled:opacity-50">
            <option value="">{lang === 'zh' ? '选择章节' : 'Chapter'}</option>
            {filteredChapters.map((ch: any) => <option key={ch.id} value={ch.id}>{(ch.sort_order ?? 0) + 1}. {ch.title}</option>)}
          </select>
          <select value={selectedLesson} onChange={e => setSelectedLesson(e.target.value)}
            disabled={!selectedChapter}
            className="w-full px-3 py-2 border rounded-lg bg-background text-sm disabled:opacity-50">
            <option value="">{lang === 'zh' ? '选择课时' : 'Lesson'}</option>
            {filteredLessons.map((l: any) => <option key={l.id} value={l.id}>{l.title}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : !selectedLesson ? (
          <div className="bg-card border rounded-2xl p-10 text-center text-muted-foreground">
            {lang === 'zh' ? '请先选择课程 / 章节 / 课时' : 'Pick a course, chapter and lesson first'}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm text-muted-foreground">{lang === 'zh' ? `共 ${words.length} 个词` : `${words.length} words`}</div>
              <div className="flex gap-2">
                <button onClick={() => { setImportText(''); setImportPreview([]); setShowImport(true) }}
                  className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm hover:bg-accent transition-colors">
                  <ClipboardPaste className="w-4 h-4" /> {lang === 'zh' ? '粘贴 JSON 导入' : 'Paste JSON'}
                </button>
                <button onClick={() => setEditWord({ ...EMPTY_WORD })}
                  className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
                  <Plus className="w-4 h-4" /> {lang === 'zh' ? '手动新增' : 'Add word'}
                </button>
              </div>
            </div>

            {words.length === 0 ? (
              <div className="bg-card border rounded-2xl p-10 text-center text-muted-foreground">
                {lang === 'zh' ? '这个课时还没有词。点「粘贴 JSON 导入」批量加，或手动新增。' : 'No words yet for this lesson.'}
              </div>
            ) : (
              <div className="space-y-2">
                {words.map((w: any) => (
                  <div key={w.id} className="bg-card border rounded-xl p-4 flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      {w.image_url && (
                        <img src={w.image_url} alt="" className="w-16 h-16 object-contain border rounded mb-2 bg-white" />
                      )}
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-semibold">{w.term}</span>
                        {w.ipa && <span className="text-xs text-muted-foreground">{w.ipa}</span>}
                        {w.pos && <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{w.pos}</span>}
                        <span className="text-xs text-muted-foreground">难度 {w.difficulty}</span>
                      </div>
                      <div className="text-sm mt-1">{w.zh}</div>
                      {w.en_def && <div className="text-xs text-muted-foreground mt-0.5">{w.en_def}</div>}
                      {w.note && <div className="text-xs text-amber-700 mt-1">⚠️ {w.note}</div>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setEditWord({ ...EMPTY_WORD, ...w, image_url: w.image_url || '' })} title="编辑"
                        className="p-2 rounded-lg hover:bg-accent transition-colors"><Edit3 className="w-4 h-4 text-muted-foreground" /></button>
                      <button onClick={() => deleteWord(w)} title="删除"
                        className="p-2 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-4 h-4 text-red-500" /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        </>
        )}
      </main>

      {/* Word edit / add modal — closes only via the × button (backdrop clicks
          used to discard typing by accident). */}
      {editWord && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-card rounded-2xl w-full max-w-2xl my-8" onPaste={handlePasteImage}>
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">{editWord.id ? (lang === 'zh' ? '编辑词条' : 'Edit word') : (lang === 'zh' ? '新增词条' : 'Add word')}</h2>
              <button onClick={() => setEditWord(null)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">术语 term *
                  <input value={editWord.term} onChange={e => setEditWord({ ...editWord, term: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
                <label className="text-sm">音标 ipa
                  <input value={editWord.ipa} onChange={e => setEditWord({ ...editWord, ipa: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">中文释义 zh *
                  <input value={editWord.zh} onChange={e => setEditWord({ ...editWord, zh: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
                <label className="text-sm">词性 pos
                  <input value={editWord.pos} onChange={e => setEditWord({ ...editWord, pos: e.target.value })} placeholder="noun / verb / adj"
                    className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
              </div>
              <label className="text-sm block">英文释义 en_def
                <textarea value={editWord.en_def} onChange={e => setEditWord({ ...editWord, en_def: e.target.value })} rows={2}
                  className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
              <label className="text-sm block">英文例句 example_en
                <textarea value={editWord.example_en} onChange={e => setEditWord({ ...editWord, example_en: e.target.value })} rows={2}
                  className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
              <label className="text-sm block">中文例句 example_zh
                <textarea value={editWord.example_zh} onChange={e => setEditWord({ ...editWord, example_zh: e.target.value })} rows={2}
                  className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
              <label className="text-sm block">易错点 / 辨析 note
                <input value={editWord.note} onChange={e => setEditWord({ ...editWord, note: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg bg-background" /></label>
              <label className="text-sm block">难度（1-3）
                <select value={editWord.difficulty} onChange={e => setEditWord({ ...editWord, difficulty: Number(e.target.value) })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg bg-background">
                  <option value={1}>1 · 基础</option>
                  <option value={2}>2 · 中等</option>
                  <option value={3}>3 · 较难</option>
                </select></label>

              <div className="text-sm">
                <div className="mb-1">插图（可选）—— 可直接把图片粘贴到本窗口任意位置</div>
                <div className="flex items-start gap-3">
                  {editWord.image_url
                    ? <img src={editWord.image_url} alt="" className="w-28 h-28 object-contain border rounded-lg bg-white shrink-0" />
                    : <div className="w-28 h-28 border-2 border-dashed rounded-lg flex items-center justify-center text-xs text-muted-foreground text-center px-2 shrink-0">
                        {lang === 'zh' ? '暂无插图' : 'No image'}
                      </div>}
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs cursor-pointer hover:bg-accent transition-colors">
                        <ImagePlus className="w-3.5 h-3.5" /> {lang === 'zh' ? '选择图片' : 'Choose'}
                        <input type="file" accept="image/*" className="hidden"
                          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
                      </label>
                      {uploading && <span className="text-xs text-muted-foreground">{lang === 'zh' ? '上传中…' : 'Uploading…'}</span>}
                      {editWord.image_url && (
                        <button type="button" onClick={() => setEditWord({ ...editWord, image_url: '' })}
                          className="text-xs text-red-600 hover:underline">{lang === 'zh' ? '移除图片' : 'Remove'}</button>
                      )}
                    </div>
                    <input value={editWord.image_url.startsWith('data:') ? '' : editWord.image_url}
                      onChange={e => setEditWord({ ...editWord, image_url: e.target.value })}
                      placeholder={lang === 'zh' ? '或填写图片网址 https://…' : 'or paste an image URL'}
                      className="w-full px-3 py-2 border rounded-lg bg-background text-xs" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setEditWord(null)} className="px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button onClick={saveWord} disabled={saving}
                className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50">
                {saving ? (lang === 'zh' ? '保存中…' : 'Saving…') : (lang === 'zh' ? '保存' : 'Save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON import modal */}
      {showImport && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-card rounded-2xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">{lang === 'zh' ? '粘贴 JSON 导入' : 'Import JSON'}</h2>
              <button onClick={() => setShowImport(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-xs text-muted-foreground">
                {lang === 'zh'
                  ? '字段：term, ipa, pos, zh, en_def, example_en, example_zh, note, difficulty。顶层可以是数组或 { "words": [...] }；```json 围栏会自动去掉。只有 term 和 zh 是必填。'
                  : 'Fields: term, ipa, pos, zh, en_def, example_en, example_zh, note, difficulty. Top level may be an array or { "words": [...] }.'}
              </p>
              <textarea value={importText} onChange={e => { setImportText(e.target.value); setImportPreview([]) }}
                rows={10} placeholder={'[\n  { "term": "atom", "ipa": "/ˈætəm/", "zh": "原子", ... }\n]'}
                className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />

              {importPreview.length > 0 && (
                <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                  <div className="px-3 py-2 text-sm font-medium bg-gray-50">
                    {lang === 'zh' ? `预览：${importPreview.length} 条` : `Preview: ${importPreview.length}`}
                  </div>
                  {importPreview.map((w, i) => (
                    <div key={i} className="px-3 py-2 flex items-center justify-between gap-3 text-sm">
                      <div className="min-w-0">
                        <span className="font-medium">{w.term}</span>
                        <span className="text-muted-foreground"> · {w.zh}</span>
                        {w.ipa && <span className="text-xs text-muted-foreground"> {w.ipa}</span>}
                      </div>
                      <button onClick={() => setImportPreview(importPreview.filter((_, j) => j !== i))}
                        className="p-1 rounded hover:bg-red-50 shrink-0"><X className="w-4 h-4 text-red-500" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t">
              <button onClick={() => setShowImport(false)} className="px-4 py-2 border rounded-lg text-sm hover:bg-accent transition-colors">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              {importPreview.length === 0 ? (
                <button onClick={previewImport} className="px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 transition-colors">
                  {lang === 'zh' ? '解析预览' : 'Parse'}
                </button>
              ) : (
                <button onClick={confirmImport} disabled={saving}
                  className="px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-50">
                  {saving ? (lang === 'zh' ? '导入中…' : 'Importing…') : (lang === 'zh' ? `确认导入 ${importPreview.length} 条` : `Import ${importPreview.length}`)}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function VocabAdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>}>
      <VocabAdminContent />
    </Suspense>
  )
}
