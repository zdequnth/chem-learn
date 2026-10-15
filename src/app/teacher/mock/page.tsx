'use client'

import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, cleanOption, wrapBareLatex } from '@/components/KatexSpan'
import QuestionImage from '@/components/QuestionImage'
import ChemToolbar from '@/components/ChemToolbar'
import { groupsForPaper, partLabel } from '@/lib/mock-groups'
import type { Course } from '@/lib/types'
import { kindTheme } from '@/lib/course-kind'
import { pdfToPageFiles } from '@/lib/pdf-to-images'
import { ArrowLeft, Loader2, Plus, Sparkles, Trash2, ArrowUp, ArrowDown, Image as ImageIcon, X, Save, FileText, Shuffle, BarChart3, Eye, Edit3, CloudUpload } from 'lucide-react'
import { useLang } from '@/lib/i18n'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

// The two paper kinds look nothing alike on purpose: the whole paper is built
// one way, so mistaking which kind you are in is the most expensive slip here.
const PAPER_MODE = {
  choice: {
    emoji: '🔤', label: '选择题卷',
    pill: 'bg-sky-100 text-sky-800 border-sky-200',
    solid: 'bg-sky-600 border-sky-600 text-white',
    box: 'border-sky-300 bg-sky-50',
  },
  short: {
    emoji: '✍️', label: '简答题卷',
    pill: 'bg-amber-100 text-amber-900 border-amber-200',
    solid: 'bg-amber-600 border-amber-600 text-white',
    box: 'border-amber-300 bg-amber-50',
  },
} as const

interface OutChapter { id: string; title: string; lessons: { ref: string; id: string; title: string }[] }
interface DraftOption { content: string; isCorrect: boolean }
interface DraftQuestion {
  id?: string                       // set once saved
  stem: string
  explanation: string
  difficulty: number
  images: string[]               // one question can show several figures
  lessonId: string
  lessonRef: string | null
  chapterTitle: string | null
  lessonTitle: string | null
  options: DraftOption[]
  aiGenerated: boolean
  answerType: 'choice' | 'short'   // 'short' = free response, no options
  answerText: string               // reference answer, AI grades against this
  groupRef: string                 // the big question's number, e.g. "1" ('' = stands alone)
  needsFigure?: boolean            // read off a page image: has a figure the teacher must paste
  num?: number | null              // the printed question number on the paper
  officialAnswer?: string | null   // from the pasted key, when there is one
  independentAnswer?: string | null
  disputed?: boolean               // AI's own answer differs from the official one
}
interface PaperRow { id: string; title: string; mode: 'choice' | 'short'; durationMinutes: number; questionCount: number; attemptCount: number; isPublished: boolean }

// How a PDF becomes pasteable text. One line, because the button below is the
// route most teachers should be taking now.
function MineruHelp({ lang }: { lang: string }) {
  if (lang !== 'zh') {
    return (
      <p className="mb-3 text-xs text-muted-foreground">
        Convert the PDF to text with <a href="https://mineru.net" target="_blank" rel="noopener noreferrer" className="underline">mineru.net</a> (free), then paste the result below.
      </p>
    )
  }
  return (
    <p className="mb-3 text-xs text-blue-800">
      📄 用 <a href="https://mineru.net" target="_blank" rel="noopener noreferrer" className="underline font-semibold">mineru.net</a>（免费）把 PDF 转成文本：打开 → 传 PDF → 全选复制粘到下面。
      <span className="text-blue-700/70">复杂版面偶尔会错位，粘完逐题扫一眼。</span>
    </p>
  )
}

function fmt(seconds: number) {
  const s = Math.max(0, Math.floor(seconds))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

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
  const [answerText, setAnswerText] = useState('')
  const [reviewOnly, setReviewOnly] = useState(false)
  const [mode, setMode] = useState<'choice' | 'short'>('choice')
  const [answerPosition, setAnswerPosition] = useState<'inline' | 'end' | 'none'>('inline')
  // How the paper text gets in: typed/pasted as text, or read off page images.
  const [importMode, setImportMode] = useState<'text' | 'images' | 'pdf'>('text')
  const [pageImages, setPageImages] = useState<string[]>([])
  // the answer key may be a scanned page rather than typed text
  const [answerImages, setAnswerImages] = useState<string[]>([])
  // which question the 编辑 dialog is open for (null = closed)
  const [editQ, setEditQ] = useState<number | null>(null)
  const [newOpen, setNewOpen] = useState(false)
  // pages the last run could not read, so they can be retried on their own
  const [failedPages, setFailedPages] = useState<number[]>([])
  // Whether the questions that came back match the question numbers printed on
  // the paper (only when the paper actually has numbers).
  const [parseCheck, setParseCheck] = useState<{ expected: number; parsed: number; issues: string[] } | null>(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  // the answer-key PDF has its own progress — sharing the page one would show
  // the wrong numbers when both are on screen
  const [answerPdfBusy, setAnswerPdfBusy] = useState(false)
  const [answerPdfProgress, setAnswerPdfProgress] = useState('')
  const [pdfProgress, setPdfProgress] = useState('')
  // MinerU cloud parse: async (submit, then poll), so it narrates its stage.
  const [mineruBusy, setMineruBusy] = useState(false)
  const [mineruStage, setMineruStage] = useState('')
  // The symbol toolbar inserts into whichever answer field was last focused.
  const focusedAnswer = useRef<HTMLTextAreaElement | null>(null)
  const [busy, setBusy] = useState<'' | 'parse' | 'save' | 'load'>('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [resultsFor, setResultsFor] = useState<string | null>(null)
  const [results, setResults] = useState<any>(null)
  const [resultsTab, setResultsTab] = useState<'students' | 'questions'>('students')
  const [resultsClass, setResultsClass] = useState('')
  const [showOverview, setShowOverview] = useState(false)
  const [overview, setOverview] = useState<any>(null)
  const [overviewClass, setOverviewClass] = useState('')
  const [overviewCourse, setOverviewCourse] = useState('')
  const [detail, setDetail] = useState<any>(null)
  const [detailFor, setDetailFor] = useState<string | null>(null)
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
    setOpen(false); setPaperId(null); setQuestions([]); setTitle(''); setImportText(''); setDirty(false); setPageImages([]); setAnswerImages([]); setImportMode('text'); setEditQ(null)
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
      setMode(j.paper.mode === 'short' ? 'short' : 'choice')
      setQuestions((j.questions || []).map((q: any) => ({
        id: q.id, stem: q.stem, explanation: q.explanation || '', difficulty: q.difficulty,
        images: q.images || [], lessonId: q.lessonId, lessonRef: q.lessonRef,
        chapterTitle: q.chapterTitle, lessonTitle: q.lessonTitle,
        options: (q.options || []).map((o: any) => ({ content: o.content, isCorrect: o.isCorrect })),
        aiGenerated: true,
        answerType: q.answerType === 'short' ? 'short' : 'choice',
        answerText: q.answerText || '',
        groupRef: q.groupRef || '',
        // Not a DB column — the parse prompt writes the mismatch into the
        // explanation, so re-reading it is what keeps the flag alive after saving.
        disputed: /官方答案/.test(q.explanation || ''),
      })))
      setImportText(''); setDirty(false)
    } finally { setBusy('') }
  }

  // Preview → editor jump. The preview page links here with ?paper=…&q=… when the
  // teacher spots something to fix, so they land in the editor with that paper
  // open and that question's dialog already showing.
  const autoOpened = useRef(false)
  const jumpedToQuestion = useRef(false)
  useEffect(() => {
    if (autoOpened.current) return
    const want = sp.get('paper')
    if (!want || papers.length === 0) return
    const p = papers.find((x) => x.id === want)
    if (!p) return
    autoOpened.current = true
    openPaper(p.id, p.title, p.durationMinutes)
  }, [papers])

  useEffect(() => {
    const qs = sp.get('q')
    if (jumpedToQuestion.current || qs === null || questions.length === 0) return
    jumpedToQuestion.current = true
    const q = Number(qs)
    if (Number.isInteger(q) && q >= 0 && q < questions.length) setEditQ(q)
  }, [questions.length])

  // 新建试卷 asks for the three things that are awkward to change later — title,
  // length and kind — before opening the editor. Kind in particular decides how
  // the whole paper is built and read.
  const startNewPaper = () => {
    setTitle(''); setDuration(60); setMode('choice')
    setNewOpen(true)
  }
  const confirmNewPaper = () => {
    if (!title.trim()) return alert('请填试卷标题')
    setNewOpen(false)
    setOpen(true)
    setPaperId(null); setQuestions([]); setImportText(''); setDirty(false); setPublished(false)
    setAnswerText(''); setPageImages([]); setAnswerImages([]); setImportMode('text'); setEditQ(null)
  }

  const togglePublish = async (id: string, next: boolean, paperMode?: 'choice' | 'short') => {
    // A short paper's reference answers ARE the marking scheme: one wrong one
    // marks the whole class wrong on that question. Publishing is the last place
    // to catch it, so it takes an explicit confirmation.
    if (next && paperMode === 'short' &&
      !confirm('简答题的参考答案就是判分标准 —— 写错的话，全班这道题都会判错。\n\n确定已经逐题核对过参考答案了吗？')) return
    const r = await fetch(`/api/mock/papers/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPublished: next }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok || j.error) return alert('操作失败：' + (j.error || r.status))
    if (paperId === id) setPublished(next)
    loadPapers(courseId)
  }

  // Page images go up one at a time, in order — the order IS the paper order.
  const uploadPageImages = async (files: File[]) => {
    const added: string[] = []
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      setUploadingIdx(-1)   // -1 = "a page image is uploading"
      try {
        const fd = new FormData(); fd.append('file', f)
        const r = await fetch('/api/upload-image', { method: 'POST', body: fd })
        const j = await r.json()
        if (j.url) added.push(j.url)
        else alert('第 ' + (pageImages.length + added.length + 1) + ' 页上传失败：' + (j.error || r.status))
      } finally { setUploadingIdx(null) }
    }
    if (added.length) setPageImages(prev => [...prev, ...added])
  }

  /**
   * A PDF goes straight to page images in the browser, then down the same upload
   * path as a screenshot — so a teacher needs no command line and nothing
   * installed. See src/lib/pdf-to-images.ts for why it is done client-side.
   */
  // Accepts several files at once, in the order picked. Picking six PDFs used to
  // convert only the first one — the rest vanished with no warning, which reads
  // as "the AI only found a few questions".
  const handlePdfFiles = async (files: File[]) => {
    setPdfBusy(true)
    try {
      for (const [k, file] of files.entries()) {
        const pages = await pdfToPageFiles(file, {
          onProgress: (done, total) => setPdfProgress(`${files.length > 1 ? `${k + 1}/${files.length} · ` : ''}${done}/${total}`),
        })
        if (pages.length === 0) { alert(`「${file.name}」没有可读的页面`); continue }
        setPdfProgress('上传中…')
        await uploadPageImages(pages)
      }
    } catch (e: any) {
      alert('PDF 转换失败：' + (e?.message || e) + '\n（也可以先把 PDF 转成图片再传）')
    } finally { setPdfBusy(false); setPdfProgress('') }
  }

  // The answer key can arrive as a scanned page too, so it gets its own list.
  const uploadAnswerFiles = async (files: File[]) => {
    const added: string[] = []
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue
      const fd = new FormData(); fd.append('file', f)
      try {
        const r = await fetch('/api/upload-image', { method: 'POST', body: fd })
        const j = await r.json()
        if (j.url) added.push(j.url)
        else alert('答案图上传失败：' + (j.error || r.status))
      } catch { alert('答案图上传失败（网络）') }
    }
    if (added.length) setAnswerImages(prev => [...prev, ...added])
  }

  /**
   * Answer key as a PDF. Converting in the browser takes seconds on a long key
   * and uploading the pages takes a few more, so both phases say so — with no
   * feedback at all the button looked like it had done nothing.
   */
  const handleAnswerPdf = async (files: File[]) => {
    setAnswerPdfBusy(true)
    try {
      for (const [k, file] of files.entries()) {
        const pages = await pdfToPageFiles(file, {
          onProgress: (done, total) => setAnswerPdfProgress(`转图片 ${files.length > 1 ? `${k + 1}/${files.length} · ` : ''}${done}/${total}`),
        })
        if (pages.length === 0) { alert(`「${file.name}」没有可读的页面`); continue }
        setAnswerPdfProgress('上传中…')
        await uploadAnswerFiles(pages)
      }
    } catch (e: any) {
      alert('PDF 转换失败：' + (e?.message || e) + '\n（也可以先把 PDF 转成图片再传）')
    } finally { setAnswerPdfBusy(false); setAnswerPdfProgress('') }
  }

  // Paste straight into the key box: an image goes up as a key picture, text
  // pastes normally. The key is usually something you just screenshotted, and
  // saving it to disk first only to pick it back up is busywork.
  const handleAnswerPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length === 0) return
    e.preventDefault()
    uploadAnswerFiles(files)
  }

  const handlePagePaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || [])
    if (files.length === 0) return
    e.preventDefault()
    uploadPageImages(files)
  }

  /** One server-parsed question → one draft row. Shared by both import paths. */
  const toDraft = (q: any): DraftQuestion => ({
    stem: q.stem, explanation: q.explanation || '', difficulty: q.difficulty,
    images: q.images || [], lessonId: q.lessonId || '', lessonRef: q.lessonRef,
    chapterTitle: q.chapterTitle, lessonTitle: q.lessonTitle,
    options: (q.options || []).map((o: any) => ({ content: o.content, isCorrect: o.isCorrect })),
    aiGenerated: true,
    answerType: q.answerType === 'short' ? 'short' : 'choice',
    answerText: q.answerText || '',
    groupRef: q.groupRef || '',
    needsFigure: !!q.needsFigure,
    num: Number.isInteger(q.num) ? q.num : null,
    officialAnswer: q.officialAnswer ?? null,
    independentAnswer: q.independentAnswer ?? null,
    disputed: !!q.disputed,
  })

  // `textOverride` lets a caller parse text that isn't in the box yet — the
  // MinerU path hands over its markdown straight from the fetch.
  const handleParse = async (textOverride?: string) => {
    const src = textOverride ?? importText
    if (!src.trim()) return alert('先粘贴试卷文本')
    if (!courseId) return
    setBusy('parse'); setProgress(null); setParseCheck(null)
    let total = 1
    const reasons = new Map<number, string>()
    // Question numbers the paper printed, and where the parse disagreed with them.
    const expectedAll = new Set<number>()
    const issuesByBatch = new Map<number, string[]>()
    let parsedCount = 0

    // Returns how many questions came out, or -1 when the CALL failed. Throws
    // only if the request never produced JSON (a 502/504 means the platform
    // killed the function and answered with an HTML error page).
    const runBatch = async (i: number): Promise<number> => {
      const res = await fetch('/api/ai/parse-mock-paper', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: src, courseId, batchIndex: i, answerText, answerImages, paperMode: mode, answerPosition }),
      })
      const raw = await res.text()
      let j: any = {}
      try { j = raw ? JSON.parse(raw) : {} }
      catch { throw new Error(`第 ${i + 1} 批没有正常返回（HTTP ${res.status}）`) }
      if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`)

      total = Math.max(total, j.totalBatches || 1)
      // -1 means the call itself failed. Zero questions with a good call is NOT
      // a failure: cover pages, instructions and answer keys have no questions
      // in them, and counting those as "lost" raised a false alarm.
      if (Array.isArray(j.failed) && j.failed.length > 0) { reasons.set(i, String(j.failed[0])); return -1 }
      reasons.delete(i)
      if (Array.isArray(j.expectedNums)) for (const n of j.expectedNums) if (typeof n === 'number') expectedAll.add(n)
      if (Array.isArray(j.numIssues) && j.numIssues.length > 0) issuesByBatch.set(i, j.numIssues.map(String))
      else issuesByBatch.delete(i)
      const batch: DraftQuestion[] = (j.questions || []).map(toDraft)
      if (batch.length) { setQuestions(prev => [...prev, ...batch]); setDirty(true) }
      return batch.length
    }

    try {
      // One batch per request, looping here: a whole paper is 10+ LLM calls, and
      // sending them all in one request blew the serverless timeout.
      //
      // A work queue rather than a plain for-loop, for two reasons: the batch
      // count is only known once the first response lands, and a batch that came
      // back empty gets another go instead of leaving a hole in the paper. The
      // provider does throw transient "service is too busy" errors, so give each
      // batch a few tries with a growing pause, not just one.
      const MAX_TRIES = 4
      const tries = new Map<number, number>()
      const succeeded = new Set<number>()
      const queue = [0]
      let guard = 0
      while (queue.length > 0 && guard++ < 8 * total + 30) {
        const i = queue.shift()!
        const n = (tries.get(i) || 0) + 1
        tries.set(i, n)
        let got = -1
        try { got = await runBatch(i) } catch (e: any) { reasons.set(i, e?.message || String(e)); got = -1 }
        if (got >= 0) { succeeded.add(i); parsedCount += got }
        else if (n < MAX_TRIES) { queue.push(i); await new Promise((r) => setTimeout(r, 1200 * n)) }
        // Newly discovered batches join the queue.
        for (let k = 0; k < total; k++) if (!tries.has(k) && !queue.includes(k)) queue.push(k)
        setProgress({ done: succeeded.size, total })
      }
      // Only meaningful when the paper actually printed question numbers.
      if (expectedAll.size > 0) {
        const issues = [...issuesByBatch.entries()]
          .sort((a, b) => a[0] - b[0])
          .flatMap(([i, arr]) => arr.map((s) => `第 ${i + 1} 批：${s}`))
        setParseCheck({ expected: expectedAll.size, parsed: parsedCount, issues })
      } else {
        setParseCheck(null)
      }
      const lost = total - succeeded.size
      if (lost > 0) {
        const why = [...reasons.entries()].slice(0, 4).map(([i, r]) => `· 第 ${i + 1} 批：${r}`).join('\n')
        alert(`解析完成，但有 ${lost} 批没成功，题目没全。\n\n${why}\n\n再点一次「AI 解析」会从头重跑，已解析的题要手工去重。`)
      }
    } catch (e: any) {
      alert('解析出错：' + (e?.message || e))
    } finally { setBusy(''); setProgress(null) }
  }

  /** One page → one request. Throws with something readable to show the teacher. */
  const runPage = async (i: number) => {
    const res = await fetch('/api/ai/parse-mock-paper-images', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, images: pageImages, answerImages, pageIndex: i, paperMode: mode, answerText, answerPosition }),
    })
    const raw = await res.text()
    let j: any = {}
    try { j = raw ? JSON.parse(raw) : {} }
    catch {
      // A 502/504 means the platform killed the function and answered with HTML.
      throw new Error(res.status === 504 ? '这一页处理超时（页面太复杂或图太多）' : `没有正常返回（HTTP ${res.status}）`)
    }
    if (!res.ok || j.error) throw new Error(j.error || `HTTP ${res.status}`)
    // The route answers 200 even when the model call itself failed, so this is
    // the only way to tell "the model found nothing" from "it never ran".
    if (Array.isArray(j.failed) && j.failed.length > 0) throw new Error('AI 这一页没返回结果（多半是模型调用超时或失败）')
    const batch: DraftQuestion[] = (j.questions || []).map(toDraft)
    if (batch.length) { setQuestions(prev => [...prev, ...batch]); setDirty(true) }
  }

  /** Read the given pages, each with one retry; remember what still failed. */
  const runPages = async (targets: number[]) => {
    if (targets.length === 0) return
    setBusy('parse'); setProgress(null); setFailedPages([])
    const queue = [...targets]
    const tries = new Map<number, number>()
    const ok = new Set<number>()
    const errs = new Map<number, string>()
    let guard = 0
    while (queue.length > 0 && guard++ < 4 * targets.length + 20) {
      const i = queue.shift()!
      const n = (tries.get(i) || 0) + 1
      tries.set(i, n)
      try { await runPage(i); ok.add(i); errs.delete(i) }
      catch (e: any) { errs.set(i, e?.message || String(e)); if (n < 2) queue.push(i) }
      setProgress({ done: ok.size, total: targets.length })
    }
    setBusy(''); setProgress(null)

    const failed = targets.filter((i) => !ok.has(i))
    setFailedPages(failed)
    if (failed.length > 0) {
      alert(
        `有 ${failed.length} 页没成功，这几页的题目没进来：\n\n`
        + failed.map((i) => `第 ${i + 1} 页 — ${errs.get(i) || '未知原因'}`).join('\n')
        + `\n\n下面会出现「重跑这几页」的按钮，不用把整份重来。`,
      )
    }
  }

  /**
   * Upload the PDF to MinerU and parse it in the cloud, then run the SAME text
   * parse as a pasted paper: MinerU hands back full.md, which is the text the
   * teacher would otherwise have copied off mineru.net by hand.
   *
   * The file goes browser → Supabase directly (the signed URL), because a
   * scanned paper is well over Vercel's 4.5 MB function-body limit. We only
   * pass MinerU a link to it; the parse itself is async, so we poll.
   */
  const handleMineruPdf = async (file: File) => {
    if (!courseId) return
    setMineruBusy(true)
    setMineruStage('准备上传…')
    try {
      const uRes = await fetch('/api/mineru/upload-url', { method: 'POST' })
      const uj = await uRes.json().catch(() => ({}))
      if (!uRes.ok || !uj.uploadUrl) throw new Error(uj.error || `HTTP ${uRes.status}`)

      setMineruStage('上传 PDF…')
      const put = await fetch(uj.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: file })
      if (!put.ok) throw new Error('上传到存储失败（HTTP ' + put.status + '）')

      setMineruStage('提交给 MinerU…')
      const sRes = await fetch('/api/mineru/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, path: uj.path }),
      })
      const sj = await sRes.json().catch(() => ({}))
      if (!sRes.ok || !sj.taskId) throw new Error(sj.error || `HTTP ${sRes.status}`)

      // A paper takes tens of seconds to a few minutes. Poll, don't block.
      const t0 = Date.now()
      let md = ''
      while (Date.now() - t0 < 6 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 4000))
        setMineruStage(`MinerU 正在解析… ${Math.round((Date.now() - t0) / 1000)}s`)
        const rRes = await fetch(`/api/mineru/result?taskId=${encodeURIComponent(sj.taskId)}&path=${encodeURIComponent(uj.path)}`)
        const rj = await rRes.json().catch(() => ({}))
        if (!rRes.ok || (rj.error && rj.state !== 'failed')) throw new Error(rj.error || `HTTP ${rRes.status}`)
        if (rj.state === 'failed') throw new Error(rj.error || 'MinerU 解析失败')
        if (rj.state === 'done') { md = rj.markdown || ''; break }
      }
      if (!md) throw new Error('MinerU 解析超时（6 分钟）')

      setImportText(md)
      setMineruStage('文本已就绪，正在拆题…')
      await handleParse(md)
    } catch (e: any) {
      alert('MinerU 解析失败：' + (e?.message || e) + '\n\n可以改用下面的「本地转成图片」备用方式。')
    } finally {
      setMineruBusy(false); setMineruStage('')
    }
  }

  /**
   * Read the paper off page screenshots, one page per request.
   */
  const handleParseImages = async () => {
    if (pageImages.length === 0) return alert('先选一个 PDF，或粘贴/选择试卷页面图片')
    if (!courseId) return
    await runPages(pageImages.map((_, i) => i))
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
  const addQuestion = () => {
    setQuestions(prev => [...prev, {
      stem: '', explanation: '', difficulty: 3, images: [], lessonId: '',
      lessonRef: null, chapterTitle: null, lessonTitle: null, aiGenerated: false,
      answerType: mode, answerText: '', groupRef: '',
      options: mode === 'choice'
        ? [{ content: '', isCorrect: true }, { content: '', isCorrect: false }]
        : [],
    }])
    setDirty(true)
    setReviewOnly(false)
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

  // Options that are themselves a picture (or a formula too fiddly to type) live
  // in the stem instead; each option then holds only its own letter. Keeps the
  // option non-empty so the save and the「选项没拆出来」check stay happy, and the
  // letter is exactly what the student taps.
  const fillOptionLetters = (qi: number) => {
    const cur = questions[qi]
    const n = Math.max(4, cur.options.length)
    const correctAt = Math.max(0, cur.options.findIndex(o => o.isCorrect))
    patchQ(qi, {
      options: Array.from({ length: n }, (_, k) => ({ content: LETTERS[k], isCorrect: k === correctAt })),
    })
  }
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
      // Append — a question can carry several figures. Overwriting here is what
      // used to make the second paste replace the first.
      if (j.url) setQuestions(list => list.map((q, k) => (k === i ? { ...q, images: [...q.images, j.url] } : q)))
      else alert('上传失败：' + (j.error || r.status))
    } finally { setUploadingIdx(null) }
    setDirty(true)
  }

  const handlePaste = (i: number) => async (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData?.items || []).find(it => it.type.startsWith('image/'))
    if (!item) return
    e.preventDefault()
    const file = item.getAsFile()
    if (file) await uploadImage(i, file)
  }

  // Both save paths need the questions settled first.
  const buildSavePayload = () => {
    if (!courseId) return null
    if (!title.trim()) { alert('请填试卷标题'); return null }
    if (questions.length === 0) { alert('还没有题目'); return null }
    const noLesson = questions.findIndex(q => !q.lessonId)
    if (noLesson >= 0) { alert(`第 ${noLesson + 1} 题还没有选所属章节课时`); return null }
    return questions.map(q => ({
      stem: q.stem, explanation: q.explanation, difficulty: q.difficulty,
      images: q.images, lessonId: q.lessonId,
      answerType: q.answerType, answerText: q.answerText, groupRef: q.groupRef || null,
      options: q.answerType === 'short' ? [] : q.options.filter(o => o.content.trim()),
    }))
  }

  const saveAsNewPaper = async (payload: any[]) => {
    const res = await fetch('/api/mock/papers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, title, mode, durationMinutes: duration, questions: payload }),
    })
    const j = await res.json()
    if (!res.ok || j.error) { alert('保存失败：' + (j.error || res.status)); return }
    alert(`已另存为新试卷：${j.saved} 道题` + (j.imageWarnings?.length ? `\n⚠️ ${j.imageWarnings.join('；')}` : ''))
    setDirty(false)
    await loadPapers(courseId)
    await openPaper(j.paperId, title, duration)
  }

  /**
   * Save. On a paper that is already open this writes back over the SAME paper,
   * so fixing a typo does not leave a trail of near-identical papers behind.
   *
   * The exception is a paper that has been taken: its sessions' answers point at
   * question ids that replacing the set would delete. The server refuses (409)
   * and the teacher is offered a new paper instead.
   */
  const handleSave = async () => {
    const payload = buildSavePayload()
    if (!payload) return
    setBusy('save')
    try {
      if (!paperId) { await saveAsNewPaper(payload); return }
      const res = await fetch(`/api/mock/papers/${paperId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, mode, durationMinutes: duration, questions: payload }),
      })
      const j = await res.json().catch(() => ({}))
      if (res.status === 409 && j.hasSessions) {
        if (confirm(`${j.error}\n\n改成「另存为新试卷」吗？原来那张保持不动，学生的成绩也不受影响。`)) {
          await saveAsNewPaper(payload)
        }
        return
      }
      if (!res.ok || j.error) { alert('保存失败：' + (j.error || res.status)); return }
      alert(`已保存到本试卷：${j.saved} 道题` + (j.imageWarnings?.length ? `\n⚠️ ${j.imageWarnings.join('；')}` : ''))
      setDirty(false)
      await loadPapers(courseId)
      await openPaper(paperId, title, duration)
    } catch (e: any) {
      alert('保存出错：' + (e?.message || e))
    } finally { setBusy('') }
  }

  /** The explicit "save a copy" button (and the fallback for a taken paper). */
  const handleSaveAsNew = async () => {
    const payload = buildSavePayload()
    if (!payload) return
    setBusy('save')
    try { await saveAsNewPaper(payload) }
    catch (e: any) { alert('保存出错：' + (e?.message || e)) }
    finally { setBusy('') }
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

  const openResults = async (id: string, cls = resultsClass) => {
    setResultsFor(id); setResults(null); setResultsTab('students')
    try {
      const j = await fetch(`/api/teacher/mock-results?paperId=${id}&classId=${cls}`).then(r => r.json())
      if (j.error) { alert('读取失败：' + j.error); setResultsFor(null); return }
      setResults(j)
    } catch { setResultsFor(null) }
  }

  // Students × papers matrix for the whole course — the "how is he doing across
  // several mock exams" view, which a single paper's results cannot answer.
  const openOverview = async (cid = courseId, cls = '') => {
    setShowOverview(true); setOverview(null); setOverviewCourse(cid); setOverviewClass(cls)
    try {
      const j = await fetch(`/api/teacher/mock-overview?courseId=${cid}&classId=${cls}`).then(r => r.json())
      if (j.error) { alert('读取失败：' + j.error); setShowOverview(false); return }
      setOverview(j)
    } catch { setShowOverview(false) }
  }

  const openDetail = async (sessionId: string) => {
    setDetailFor(sessionId); setDetail(null)
    try {
      const j = await fetch(`/api/teacher/mock-session-detail?sessionId=${sessionId}`).then(r => r.json())
      if (j.error) { alert('读取失败：' + j.error); setDetailFor(null); return }
      setDetail(j)
    } catch { setDetailFor(null) }
  }
  // One list of reasons, so the warning box, the card highlight and the filter
  // can never disagree about what still needs a human.
  const reasonsFor = (q: DraftQuestion): string[] => {
    const out: string[] = []
    if (q.disputed) out.push(`AI 独立解答选 ${q.independentAnswer}，官方答案是 ${q.officialAnswer} —— 可能答案印错，也可能是道有坑的题`)
    // Read off a page image: the figure is part of the page, not something we
    // could carve out — the teacher pastes it on.
    if (q.needsFigure) out.push(q.images.length > 0
      ? '配图是 AI 从页面上自动裁的，请核对裁得完整不完整'
      : '这题有配图，但没能自动裁出来，请手工截图贴到题干下面')
    if (!q.lessonId) out.push('没能自动对应章节课时，请手动选')
    if (q.answerType === 'short') {
      if (!q.answerText.trim()) out.push('简答题还没有参考答案 —— 没有它，AI 判不了分')
    } else if (q.options.length < 2) out.push('选项没拆出来，需要手工补')
    else if (q.options.filter(o => o.isCorrect).length !== 1) out.push('正确答案不是恰好 1 个，AI 解错了或漏标')
    return out
  }
  const flaggedCount = questions.filter(q => reasonsFor(q).length > 0).length
  // "2a"/"2b" labels keyed by flat index, so the list lines up with what
  // students see.
  const draftGroups = groupsForPaper(questions, mode === 'short')
  const draftLabel = new Map<number, string>()
  draftGroups.forEach((g, gi) => g.items.forEach((_, si) => draftLabel.set(g.start + si, partLabel(gi, si, g.items.length))))
  const qWarn = useMemo(() => ({
    disputed: questions.filter(q => q.disputed).length,
    lesson: questions.filter(q => !q.lessonId).length,
    noRef: questions.filter(q => q.answerType === 'short' && !q.answerText.trim()).length,
    options: questions.filter(q => q.answerType === 'choice' && q.options.length < 2).length,
    answer: questions.filter(q => q.answerType === 'choice' && q.options.length >= 2 && q.options.filter(o => o.isCorrect).length !== 1).length,
  }), [questions])
  const refLabel = (q: DraftQuestion) => {
    if (!q.lessonId) return { text: '未指定课时', cls: 'bg-rose-50 text-rose-700 border-rose-200' }
    const hit = lessonOptions.find(l => l.id === q.lessonId)
    return { text: hit ? `${hit.chapter} › ${hit.ref} ${hit.title}` : '课时无效', cls: 'bg-violet-50 text-violet-700 border-violet-200' }
  }

  // Three ways in, and they are peers: paste text (via MinerU), drop screenshots,
  // or pick a PDF (which becomes page images in the browser). The page-image
  // modes share one ordered list — a teacher can add a PDF and then a couple of
  // screenshots on top of it.
  const importSource = (placeholder: string) => (
    <>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        {([
          ['text', '📄 粘贴文本'],
          ['pdf', '📕 上传 PDF'],
          ['images', '📷 上传图片'],
        ] as const).map(([k, label]) => (
          <button key={k} onClick={() => setImportMode(k)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${importMode === k ? 'bg-violet-600 border-violet-600 text-white' : 'hover:bg-accent'}`}>
            {label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-1">
          {importMode === 'text' ? '' : importMode === 'pdf' ? 'MinerU 读真实文字层，配图自动提取' : 'AI 直接看图，版面不会错位'}
        </span>
      </div>

      {importMode === 'text' && (
        <textarea value={importText} onChange={e => setImportText(e.target.value)} rows={7}
          placeholder={placeholder}
          className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
      )}

      {importMode === 'pdf' && (
        <div className="space-y-2">
          <label className={`flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed p-6 transition-colors ${mineruBusy ? 'border-violet-400 bg-violet-50/40 opacity-70 cursor-default' : 'border-violet-400 bg-violet-50/40 cursor-pointer hover:border-violet-500'}`}>
            <CloudUpload className="w-7 h-7 text-violet-500" />
            <span className="text-sm font-medium">
              {mineruBusy ? (mineruStage || '处理中…') : '上传 PDF 到 MinerU 解析（更准）'}
            </span>
            <span className="text-xs text-muted-foreground">读 PDF 的真实文字层和配图 —— 扫描版、手写版也能认</span>
            <input type="file" accept="application/pdf,.pdf" className="hidden" disabled={mineruBusy}
              onChange={e => { const f = e.target.files?.[0]; if (f) handleMineruPdf(f); e.currentTarget.value = '' }} />
          </label>
          <label className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs cursor-pointer hover:bg-accent ${pdfBusy || mineruBusy ? 'opacity-60 pointer-events-none' : ''}`}>
            <FileText className="w-3.5 h-3.5" />
            {pdfBusy ? `正在本地转成图片… ${pdfProgress}` : '或：本地转成图片（备用，走截图识别）'}
            <input type="file" accept="application/pdf,.pdf" multiple className="hidden"
              onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) handlePdfFiles(fs); e.currentTarget.value = '' }} />
          </label>
        </div>
      )}

      {importMode === 'images' && (
        <div className="space-y-2">
          <div onPaste={handlePagePaste} tabIndex={0}
            className="rounded-xl border-2 border-dashed border-gray-300 p-5 text-center outline-none focus:border-violet-400 cursor-text">
            <div className="text-sm font-medium mb-1">在这一块里点一下，然后 Ctrl+V 粘贴截图</div>
            <div className="text-xs text-muted-foreground">一页一张图。按页的顺序贴 —— <b>顺序就是试卷顺序</b>。</div>
          </div>
          <label className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border text-xs cursor-pointer hover:bg-accent ${pdfBusy ? 'opacity-60 pointer-events-none' : ''}`}>
            <ImageIcon className="w-3.5 h-3.5" /> {uploadingIdx === -1 ? '上传中…' : '或者选图片文件（可多选）'}
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) uploadPageImages(fs); e.currentTarget.value = '' }} />
          </label>
        </div>
      )}

      {/* The page list belongs to both page modes, so it sits outside them. */}
      {importMode !== 'text' && pageImages.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1.5">已加入 {pageImages.length} 页（点图放大，右下角可删）</div>
          <div className="flex flex-wrap gap-2">
            {pageImages.map((src, i) => (
              <div key={src + i} className="relative rounded-lg border p-0.5 bg-white">
                <button onClick={() => setZoom(src)} title="放大看">
                  <img src={src} alt="" className="h-16 w-12 object-cover" />
                </button>
                <span className="absolute bottom-0.5 left-0.5 text-[10px] leading-none bg-black/65 text-white rounded px-1 py-0.5">{i + 1}</span>
                <button onClick={() => setPageImages(p => p.filter((_, k) => k !== i))} title="删掉这一页"
                  className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 text-red-500 hover:text-red-700">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )

  const handleParseAny = () => (importMode === 'text' ? handleParse() : handleParseImages())

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
              <button onClick={() => openOverview('')} className={`ml-auto flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border hover:bg-accent transition-colors`}>
                <BarChart3 className="w-4 h-4" /> {lang === 'zh' ? '总成绩（跨套卷）' : 'Overview'}
              </button>

              <button onClick={startNewPaper} className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium text-white ${theme.solid}`}>
                <Plus className="w-4 h-4" /> {lang === 'zh' ? '新建试卷' : 'New paper'}
              </button>
            </div>

            {/* paper list — hidden while the editor is open, so a new paper's
                editor is not competing with a list of the others */}
            {!open && (<>
            {/* Two publish switches exist (course and paper) and it is easy to
                flip only one. Spell out which one actually decides whether
                students can see anything. */}
            {(() => {
              const c = courses.find(x => x.id === courseId)
              const coursePublished = !!c?.is_published
              const anyPublished = papers.some(p => p.isPublished)
              if (coursePublished && (anyPublished || papers.length === 0)) return null
              return (
                <div className="mb-5 px-4 py-3 rounded-xl border border-violet-200 bg-violet-50 text-sm text-violet-900 flex flex-wrap items-center gap-2">
                  <span className="font-medium">发布说明</span>
                  <span className="text-violet-800">
                    {anyPublished
                      ? '已经有卷子发布了，学生看得到、能参加。'
                      : '还没有卷子发布——学生看不到任何卷子。审核完点卷子上的「发布」即可。'}
                  </span>
                  {!coursePublished && (
                    <>
                      <span className="text-violet-800">课程本身未发布（这个不影响模拟考）。</span>
                      <button onClick={async () => {
                        const r = await fetch(`/api/courses/${courseId}`, {
                          method: 'PUT', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ is_published: true }),
                        })
                        const j = await r.json().catch(() => ({}))
                        if (!r.ok || j.error) return alert('发布失败：' + (j.error || r.status))
                        const res = await fetch('/api/courses').then(x => x.json())
                        setCourses(((res.courses || []) as Course[]).filter(x => x.kind === 'mock'))
                      }} className="px-2 py-0.5 rounded-md bg-violet-500 text-white text-xs font-medium hover:bg-violet-600">
                        顺便发布课程
                      </button>
                    </>
                  )}
                </div>
              )
            })()}

            <div className="bg-card border rounded-2xl divide-y mb-6">
              {papers.length === 0 && <div className="p-6 text-sm text-muted-foreground">{lang === 'zh' ? '这门课还没有试卷。点「新建试卷」，粘一份试卷文本让 AI 拆题。' : 'No papers yet.'}</div>}
              {papers.map(p => (
                <div key={p.id} className={`p-4 flex items-center gap-3 flex-wrap ${paperId === p.id ? 'bg-violet-50' : ''}`}>
                  <span className="text-xl shrink-0" title={PAPER_MODE[p.mode].label}>{PAPER_MODE[p.mode].emoji}</span>
                  <div className="min-w-0">
                    <div className="font-medium truncate flex items-center gap-2">
                      {p.title}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium border ${PAPER_MODE[p.mode].pill}`}>
                        {PAPER_MODE[p.mode].label}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${p.isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                        {p.isPublished ? '已发布' : '未发布'}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{p.durationMinutes} 分钟 · {p.questionCount} 题 · {p.attemptCount} 人次考过</div>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <button onClick={() => togglePublish(p.id, !p.isPublished, p.mode)}
                      className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                        p.isPublished ? 'bg-amber-50 text-amber-600 hover:bg-amber-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                      {p.isPublished ? '取消发布' : '发布'}
                    </button>
                    <Link href={`/teacher/mock/${p.id}/preview`}
                      className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium ${theme.button}`}>
                      <Eye className="w-3 h-3 inline" /> {lang === 'zh' ? '预览' : 'Preview'}
                    </Link>
                    <button onClick={() => openResults(p.id)} className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium ${theme.button}`}>
                      <BarChart3 className="w-3 h-3 inline" /> {lang === 'zh' ? '成绩' : 'Results'}
                    </button>
                    <button onClick={() => openPaper(p.id, p.title, p.durationMinutes)} className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium ${theme.button}`}>
                      {lang === 'zh' ? '编辑' : 'Edit'}
                    </button>
                    <button onClick={() => deletePaper(p.id, p.title)} className="shrink-0 p-1.5 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
            </div>
            </>)}

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

                    {/* Decided in the 新建试卷 dialog, then frozen. The whole paper
                        is built one way — student page, grading and review all
                        branch on it — so switching later would strand or clear
                        the questions already written. */}
                    <span className={`text-sm px-3 py-2 rounded-lg border font-semibold ${PAPER_MODE[mode].box}`}
                      title="卷子类型在新建时定好，之后不能改">
                      {PAPER_MODE[mode].emoji} {PAPER_MODE[mode].label}
                    </span>

                    <button onClick={handleSave} disabled={busy !== ''}
                      className={`flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50 ${theme.solid}`}>
                      {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                      {paperId ? (lang === 'zh' ? '保存（更新本卷）' : 'Save') : (lang === 'zh' ? '保存试卷' : 'Save paper')}
                    </button>
                    {paperId && (
                      <button onClick={handleSaveAsNew} disabled={busy !== ''}
                        className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium border hover:bg-accent disabled:opacity-50 transition-colors">
                        {lang === 'zh' ? '另存为新试卷' : 'Save as new'}
                      </button>
                    )}
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
                          <button onClick={() => togglePublish(paperId, !published, mode)}
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

                {/* import — choice papers only for now: the parser still emits
                    multiple-choice questions, which a short paper would reject
                    on save. */}
                {mode === 'short' ? (
                  <div className="bg-card border rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <h2 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" /> {lang === 'zh' ? '粘贴试卷文本 → AI 拆简答题' : 'Paste paper text'}</h2>
                    </div>

                    {importMode === 'text' && <MineruHelp lang={lang} />}
                    {importSource(lang === 'zh' ? '把整套试卷的文本粘进来。' : 'Paste the whole paper…')}

                    {/* Where the answers are. Guessing this wrong would misplace
                        every answer in the paper, so it is asked, not inferred. */}
                    <div className="mt-3">
                      <div className="text-xs font-medium mb-1.5">答案在哪里？</div>
                      <div className="flex flex-wrap gap-1.5">
                        {([['inline', '紧跟每道题后面'], ['end', '集中放在末尾'], ['none', '没有答案']] as const).map(([k, label]) => (
                          <button key={k} onClick={() => setAnswerPosition(k)}
                            className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${answerPosition === k ? 'bg-violet-600 border-violet-600 text-white' : 'hover:bg-accent'}`}>
                            {label}
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {answerPosition === 'inline' && '答案和题目混在一起 —— AI 会把答案剥出来单独存，题干只留问题本身。'}
                        {answerPosition === 'end' && '把试卷末尾的答案区粘到下面那个框里。'}
                        {answerPosition === 'none' && '⚠️ AI 会自己解题当参考答案。这份答案就是判分标准，你必须逐题核对后才能发布。'}
                      </p>
                    </div>

                    {answerPosition === 'end' && (
                      <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} rows={4}
                        placeholder="把试卷末尾的答案区原样粘进来（按题号即可，如「1. ... 2. ...」）"
                        className="mt-2 w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
                    )}

                    <div className="flex items-center gap-3 mt-2">
                      <button onClick={handleParseAny} disabled={busy !== ''}
                        className="flex items-center gap-1 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50">
                        {busy === 'parse' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                        {busy === 'parse'
                          ? (progress ? `解析中… 第 ${progress.done}/${progress.total} 批` : 'AI 解析中…')
                          : (lang === 'zh' ? 'AI 解析' : 'Parse')}
                      </button>
                    </div>
                    {progress && (
                      <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                        <div className="h-full bg-violet-500 transition-all"
                          style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                      </div>
                    )}
                  </div>
                ) : (
                <div className="bg-card border rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-2">
                    <h2 className="font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-violet-500" /> {lang === 'zh' ? '粘贴试卷文本 → AI 拆题' : 'Paste paper text'}</h2>
                  </div>

                  {importMode === 'text' && <MineruHelp lang={lang} />}
                  {importSource(lang === 'zh' ? '把整套试卷的文本粘进来。' : 'Paste the whole paper…')}

                  {/* The key sits in its own box on purpose: inside the paper text its
                      answer lines look exactly like question numbers. It can be typed,
                      or handed over as a picture — plenty of papers ship the key as a
                      scanned page. */}
                  <div className="mt-3">
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                      <label className="text-xs font-medium">
                        {lang === 'zh' ? '试卷自带答案（可选）' : 'Answer key (optional)'}
                      </label>
                      <label className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        uploadingIdx === -1 ? 'opacity-70 cursor-wait' : 'cursor-pointer hover:bg-accent'}`}>
                        {uploadingIdx === -1 ? '上传中…' : '🖼 选答案截图'}
                        <input type="file" accept="image/*" multiple className="hidden"
                          disabled={uploadingIdx === -1}
                          onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) uploadAnswerFiles(fs); e.currentTarget.value = '' }} />
                      </label>
                      <label className={`text-xs px-2 py-1 rounded-lg border transition-colors ${
                        answerPdfBusy ? 'opacity-70 cursor-wait border-violet-300 bg-violet-50' : 'cursor-pointer hover:bg-accent'}`}>
                        {answerPdfBusy ? `正在转成图片… ${answerPdfProgress}` : '📕 选答案 PDF'}
                        <input type="file" accept="application/pdf,.pdf" multiple className="hidden"
                          disabled={answerPdfBusy}
                          onChange={e => { const fs = Array.from(e.target.files || []); if (fs.length) handleAnswerPdf(fs); e.currentTarget.value = '' }} />
                      </label>
                      {answerImages.length > 0 && (
                        <span className="text-xs text-emerald-700">已加 {answerImages.length} 张，将按图片读答案</span>
                      )}
                    </div>

                    {answerImages.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {answerImages.map((src, i) => (
                          <div key={src + i} className="relative rounded-lg border p-0.5 bg-white">
                            <button onClick={() => setZoom(src)} title="放大看"><img src={src} alt="" className="h-16 w-24 object-cover" /></button>
                            <span className="absolute bottom-0.5 left-0.5 text-[10px] leading-none bg-black/65 text-white rounded px-1 py-0.5">{i + 1}</span>
                            <button onClick={() => setAnswerImages(p => p.filter((_, k) => k !== i))} title="删掉"
                              className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 text-red-500 hover:text-red-700">
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <textarea value={answerText} onChange={e => setAnswerText(e.target.value)} rows={2}
                      onPaste={handleAnswerPaste}
                      placeholder={answerImages.length > 0
                        ? '（已经用图片了，这里可以不填）'
                        : (lang === 'zh' ? '答案文字粘这里，如「1. B 2. C」或「1-5 BCDAB」；截图直接 Ctrl+V 也行。' : 'Paste the key as text, or Ctrl+V a screenshot.')}
                      className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
                    <p className="text-xs text-muted-foreground mt-1">
                      {lang === 'zh'
                        ? '答案区是扫描页/照片的话，截图后直接在这个框里 Ctrl+V。'
                        : 'For a scanned key, screenshot it and Ctrl+V into the box.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={handleParseAny} disabled={busy !== ''}
                      className="flex items-center gap-1 px-4 py-2 bg-gray-800 text-white rounded-lg text-sm font-medium hover:bg-gray-900 disabled:opacity-50">
                      {busy === 'parse' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {busy === 'parse'
                        ? (progress ? `解析中… 第 ${progress.done}/${progress.total} 批` : 'AI 解析中…')
                        : (lang === 'zh' ? 'AI 解析' : 'Parse')}
                    </button>
                  </div>
                  {progress && (
                    <div className="mt-2 h-1.5 rounded-full bg-gray-200 overflow-hidden">
                      <div className="h-full bg-violet-500 transition-all"
                        style={{ width: `${Math.round((progress.done / Math.max(1, progress.total)) * 100)}%` }} />
                    </div>
                  )}
                </div>
                )}

                {/* Warnings recomputed from the list itself, so they stay correct
                    across a multi-batch import instead of flashing per batch.
                    Kept outside the import card — a short paper hides that card
                    but still needs these. */}
                {(qWarn.disputed || qWarn.lesson || qWarn.noRef || qWarn.options || qWarn.answer) > 0 && (
                  <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-0.5">
                    {qWarn.disputed > 0 && <div>⚠️ {qWarn.disputed} 题的 AI 独立解答与官方答案不一致，请重点核对</div>}
                    {qWarn.noRef > 0 && <div>⚠️ {qWarn.noRef} 道简答题还没有参考答案，AI 判不了分</div>}
                    {qWarn.lesson > 0 && <div>⚠️ {qWarn.lesson} 题没能自动对应章节课时，请手动选</div>}
                    {qWarn.options > 0 && <div>⚠️ {qWarn.options} 题的选项没拆出来，需要手工补（在列表里，别漏掉）</div>}
                    {qWarn.answer > 0 && <div>⚠️ {qWarn.answer} 题的正确答案不是恰好 1 个（AI 解错了或漏标），请检查</div>}
                    <button onClick={() => setReviewOnly(v => !v)}
                      className="mt-1 font-semibold underline underline-offset-2 hover:text-amber-950">
                      {reviewOnly ? `显示全部 ${questions.length} 题` : `只看这 ${flaggedCount} 道有问题的题 →`}
                    </button>
                  </div>
                )}

                {/* Pages the last run could not read. Retry just those instead of
                    re-running the whole paper and de-duplicating by hand. */}
                {failedPages.length > 0 && (
                  <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-900 flex flex-wrap items-center gap-2">
                    <span>
                      ⚠️ 第 <b>{failedPages.map(i => i + 1).join('、')}</b> 页没解析出来，这几页的题目不在下面。
                    </span>
                    <button onClick={() => runPages(failedPages)} disabled={busy !== ''}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-medium disabled:opacity-50">
                      重跑这几页
                    </button>
                    <button onClick={() => setFailedPages([])} className="text-rose-700 hover:underline">忽略</button>
                  </div>
                )}

                {/* Did what came back match the question numbers printed on the
                    paper? One question read as two lands here (a number missing,
                    or one that was never on the paper). */}
                {parseCheck && (
                  <div className={`px-3 py-2 rounded-lg border text-xs ${parseCheck.issues.length ? 'bg-amber-50 border-amber-300 text-amber-900' : 'bg-emerald-50 border-emerald-200 text-emerald-800'}`}>
                    {parseCheck.issues.length === 0 ? (
                      <span>✅ 卷面共 <b>{parseCheck.expected}</b> 个题号，解析出 <b>{parseCheck.parsed}</b> 道题，题号对得上。</span>
                    ) : (
                      <div className="space-y-0.5">
                        <div>⚠️ 卷面共 <b>{parseCheck.expected}</b> 个题号，解析出 <b>{parseCheck.parsed}</b> 道题 —— 下面几处对不上，请对照原卷核对：</div>
                        {parseCheck.issues.map((s, k) => <div key={k} className="pl-3">· {s}</div>)}
                      </div>
                    )}
                  </div>
                )}

                {/* question review */}
                {(
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm text-muted-foreground">
                        {reviewOnly ? `需人工审核 ${flaggedCount} / 共 ${questions.length} 题` : `共 ${questions.length} 题`}
                      </span>
                      <button onClick={() => setReviewOnly(false)}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${reviewOnly ? 'hover:bg-accent' : 'bg-violet-100 border-violet-300 text-violet-800'}`}>
                        全部
                      </button>
                      <button onClick={() => setReviewOnly(true)} disabled={flaggedCount === 0}
                        className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors disabled:opacity-40 ${reviewOnly ? 'bg-red-600 border-red-600 text-white' : 'border-red-300 text-red-700 hover:bg-red-50'}`}>
                        只看有问题的{flaggedCount > 0 ? ` (${flaggedCount})` : ''}
                      </button>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button onClick={addQuestion}
                          className="text-xs px-2.5 py-1 rounded-lg border font-medium hover:bg-accent transition-colors">+ 加一道题</button>
                      </div>
                    </div>
                    {questions.length === 0 && (
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        还没有题目 —— 上面粘贴试卷让 AI 拆，或点右上角「+ 加一道题」自己写一道。
                      </p>
                    )}
                    {questions.map((q, i) => ({ q, i }))
                      .filter(({ q }) => !reviewOnly || reasonsFor(q).length > 0)
                      .map(({ q, i }) => {
                      const ref = refLabel(q)
                      const reasons = reasonsFor(q)
                      return (
                        <div key={i} className={`border rounded-2xl p-4 ${reasons.length ? 'bg-red-50 border-red-400 ring-1 ring-red-300' : 'bg-card'}`}>
                          {reasons.length > 0 && (
                            <div className="mb-2 px-3 py-2 rounded-lg bg-red-100 border border-red-300 text-xs text-red-800 space-y-0.5">
                              {reasons.map((r, k) => <div key={k}>⚠️ {r}</div>)}
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-3 flex-wrap">
                            <span className={`min-w-7 h-7 px-1 rounded-lg text-sm font-semibold flex items-center justify-center shrink-0 ${reasons.length ? 'bg-red-600 text-white' : 'bg-violet-100 text-violet-800'}`}>
                              {draftLabel.get(i) ?? i + 1}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${ref.cls}`}>{ref.text}</span>
                            {q.num != null && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">卷面第 {q.num} 题</span>
                            )}
                            {reasons.length > 0 && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-red-600 text-white font-medium">需人工审核</span>
                            )}
                            <span className="text-xs text-muted-foreground">难度 {q.difficulty}</span>
                            <div className="ml-auto flex items-center gap-1">
                              <button onClick={() => setEditQ(i)}
                                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium hover:bg-accent transition-colors">
                                <Edit3 className="w-3.5 h-3.5" /> 编辑
                              </button>
                              <button onClick={() => moveQ(i, -1)} disabled={i === 0} title="上移" className="p-1.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                              <button onClick={() => moveQ(i, 1)} disabled={i === questions.length - 1} title="下移" className="p-1.5 rounded hover:bg-accent text-muted-foreground disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                              <button onClick={() => removeQ(i)} title="删除这道题" className="p-1.5 rounded hover:bg-red-50 text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          </div>

                          {/* Read-only: exactly what the student will see. All
                              the controls live in the 编辑 dialog — mixing them
                              in made proof-reading the paper hard work. */}
                          <div className="space-y-2">
                            <div className="text-sm"><KatexHtml text={q.stem} /></div>

                            {q.images.map((src, k) => (
                              <button key={k} onClick={() => setZoom(src)} className="block">
                                <QuestionImage src={src} />
                              </button>
                            ))}

                            {q.answerType === 'choice' ? (
                              <div className="space-y-1">
                                {q.options.map((o, oi) => (
                                  <div key={oi}
                                    className={`flex items-start gap-2 px-2.5 py-1.5 rounded-lg text-sm border ${
                                      o.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'border-transparent'}`}>
                                    <span className="font-medium text-muted-foreground shrink-0">{LETTERS[oi]}.</span>
                                    <span className="flex-1">
                                      {cleanOption(o.content) !== LETTERS[oi] && <KatexHtml text={cleanOption(o.content)} />}
                                    </span>
                                    {o.isCorrect && <span className="text-xs text-emerald-700 shrink-0">正确答案</span>}
                                  </div>
                                ))}
                                {q.options.length === 0 && <p className="text-sm text-rose-600">还没有选项</p>}
                              </div>
                            ) : (
                              <div className="px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/60 text-sm">
                                <div className="text-xs text-muted-foreground mb-1">参考答案（判分依据）</div>
                                <div className="whitespace-pre-wrap">
                                  {q.answerText.trim()
                                    ? <KatexHtml text={wrapBareLatex(q.answerText)} />
                                    : <span className="text-rose-600">还没填</span>}
                                </div>
                              </div>
                            )}

                            {q.explanation.trim() && (
                              <div className="px-3 py-2 rounded-lg bg-gray-50 text-sm text-muted-foreground">
                                <KatexHtml text={q.explanation} />
                              </div>
                            )}
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

      {/* 新建试卷：先定标题 / 时长 / 类型，再进编辑界面。类型决定整份卷子怎么
          建、怎么看，进来之后再改会很折腾，所以在门口就问清楚。 */}
      {newOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl shadow-xl p-6 w-full max-w-md">
            <h2 className="text-lg font-semibold mb-4">新建试卷</h2>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-medium mb-1">试卷标题</div>
                <input value={title} onChange={e => setTitle(e.target.value)} autoFocus
                  placeholder="如 AP Chem 2012"
                  className="w-full px-3 py-2 border rounded-lg bg-background outline-none focus:ring-2 focus:ring-violet-400" />
              </div>

              <div>
                <div className="text-xs font-medium mb-1">考试时长</div>
                <div className="flex items-center gap-2">
                  <input type="number" min={1} max={600} value={duration}
                    onChange={e => setDuration(Math.min(600, Math.max(1, Number(e.target.value) || 60)))}
                    className="w-24 px-3 py-2 border rounded-lg bg-background" />
                  <span className="text-sm text-muted-foreground">分钟</span>
                </div>
              </div>

              <div>
                <div className="text-xs font-medium mb-2">卷子类型</div>
                <div className="grid grid-cols-2 gap-2">
                  {(['choice', 'short'] as const).map(m => (
                    <button key={m} onClick={() => setMode(m)}
                      className={`rounded-xl border-2 p-4 text-left transition-all ${
                        mode === m ? PAPER_MODE[m].solid : 'hover:bg-accent'}`}>
                      <div className="text-2xl mb-1">{PAPER_MODE[m].emoji}</div>
                      <div className="font-semibold text-sm">{PAPER_MODE[m].label}</div>
                      <div className={`text-[11px] mt-0.5 ${mode === m ? 'text-white/80' : 'text-muted-foreground'}`}>
                        {m === 'choice' ? '每题 A/B/C/D 选项' : '每题写文字，AI 判分'}
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  一份卷子只有一种题型。建好之后不能改 —— 要换类型就新建一份卷子。
                </p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button onClick={confirmNewPaper}
                className={`flex-1 py-2.5 rounded-lg font-medium text-white ${PAPER_MODE[mode].solid}`}>
                确认，开始建卷
              </button>
              <button onClick={() => setNewOpen(false)} className="px-5 py-2.5 bg-accent rounded-lg font-medium">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* 编辑一道题。The card shows only what students see; every control lives
          here, so proof-reading a paper is reading, not form-filling. */}
      {editQ !== null && questions[editQ] && (() => {
        const i = editQ
        const q = questions[i]
        const ref = refLabel(q)
        return (
          <div className="fixed inset-0 z-[75] bg-black/50 flex items-start justify-center overflow-y-auto p-4">
            <div className="bg-card rounded-2xl w-full max-w-4xl my-8">
              <div className="flex items-center justify-between px-5 py-4 border-b">
                <h2 className="font-semibold flex items-center gap-2 flex-wrap">
                  编辑第 {draftLabel.get(i) ?? i + 1} 题
                  <span className={`text-xs px-2 py-0.5 rounded-full border font-normal ${ref.cls}`}>{ref.text}</span>
                </h2>
                <button onClick={() => setEditQ(null)} title="关闭"
                  className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-5 space-y-4 max-h-[76vh] overflow-y-auto">
                <div>
                  <div className="text-xs font-medium mb-1">题干（支持 LaTeX；可直接 Ctrl+V 贴图）</div>
                  <textarea value={q.stem} onChange={e => patchQ(i, { stem: e.target.value })} rows={9}
                    onPaste={handlePaste(i)}
                    className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
                  <div className="mt-1 px-3 py-2 bg-gray-50 border rounded-lg text-sm"><KatexHtml text={q.stem} /></div>
                </div>

                <div>
                  <div className="text-xs font-medium mb-1">配图（可多张，学生会按顺序看到全部）</div>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs border cursor-pointer ${theme.button}`}>
                      <ImageIcon className="w-3.5 h-3.5" />
                      {uploadingIdx === i ? '上传中…' : '选一张图'}
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadImage(i, f); e.currentTarget.value = '' }} />
                    </label>
                    <span className="text-xs text-muted-foreground">也可以直接 Ctrl+V 粘到上面的题干框里</span>
                  </div>
                  {q.images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {q.images.map((src, k) => (
                        <span key={k} className="relative border rounded-lg p-0.5 bg-white">
                          <button onClick={() => setZoom(src)} title="放大看"><img src={src} alt="" className="h-16 w-24 object-contain" /></button>
                          <button onClick={() => patchQ(i, { images: q.images.filter((_, n) => n !== k) })} title="删掉这张图"
                            className="absolute -top-1.5 -right-1.5 bg-white border rounded-full p-0.5 text-red-500 hover:text-red-700">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {q.answerType === 'choice' ? (
                  <div>
                    <div className="text-xs font-medium mb-1">选项（点左边的字母圈设为正确答案）</div>
                    <div className="space-y-1.5">
                      {q.options.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <button onClick={() => setCorrect(i, oi)} title="设为正确答案"
                            className={`w-6 h-6 rounded-full border text-xs font-semibold shrink-0 ${o.isCorrect ? 'bg-emerald-500 border-emerald-500 text-white' : 'hover:bg-accent text-muted-foreground'}`}>
                            {LETTERS[oi]}
                          </button>
                          <input value={o.content} onChange={e => setOptionText(i, oi, e.target.value)}
                            className="flex-1 px-3 py-1.5 border rounded-lg bg-background font-mono text-xs" />
                          <span className="text-xs text-muted-foreground w-32 truncate hidden sm:block"><KatexHtml text={cleanOption(o.content)} /></span>
                          <button onClick={() => removeOption(i, oi)} className="p-1 text-red-300 hover:text-red-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      <button onClick={() => addOption(i)} className="text-xs text-muted-foreground hover:text-foreground">+ 加一个选项</button>
                      <button onClick={() => shuffleOptions(i)} title="把选项循环挪一位（对付两栏排版被读串的情况）"
                        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                        <Shuffle className="w-3.5 h-3.5" /> 选项挪一位
                      </button>
                      <button onClick={() => fillOptionLetters(i)}
                        title="选项本身就是图片/复杂公式时用这个：题干里贴一张含所有选项的图，各选项只留 A B C D 当占位"
                        className="text-xs text-muted-foreground hover:text-foreground">选项用字母代替（A B C D）</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-medium mb-1">参考答案（必填）—— 学生的答案由 AI 对照它判分，写错则全班这道题都判错</div>
                    <ChemToolbar value={q.answerText} onChange={next => patchQ(i, { answerText: next })} textareaRef={focusedAnswer} />
                    <textarea value={q.answerText} onChange={e => patchQ(i, { answerText: e.target.value })} rows={7}
                      onFocus={e => { focusedAnswer.current = e.currentTarget }}
                      placeholder="可以直接写 CH3NH2、10^-4 这种普通写法；下标/上标点上面的按钮。公式要用 $…$ 包起来。"
                      className="mt-1 w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
                    {q.answerText.trim() && (
                      <div className="mt-1 px-3 py-2 bg-gray-50 border rounded-lg text-sm">
                        <div className="text-xs text-muted-foreground mb-1">预览（学生看到的样子）</div>
                        <KatexHtml text={wrapBareLatex(q.answerText)} />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="text-xs font-medium mb-1">解析（AI 草稿，请核对）</div>
                  <textarea value={q.explanation} onChange={e => patchQ(i, { explanation: e.target.value })} rows={5}
                    className="w-full px-3 py-2 border rounded-lg bg-background font-mono text-xs" />
                </div>

                <div className="flex flex-wrap items-center gap-4">
                  <label className="text-xs text-muted-foreground flex items-center gap-1">
                    难度
                    <input type="number" min={1} max={5} value={q.difficulty}
                      onChange={e => patchQ(i, { difficulty: Math.min(5, Math.max(1, Number(e.target.value) || 3)) })}
                      className="w-14 px-2 py-1 border rounded bg-background text-xs" />
                  </label>
                  <div className="flex-1 min-w-[220px] flex items-center gap-2">
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

                {q.officialAnswer && (
                  <p className="text-xs text-muted-foreground">
                    官方答案：<b className="text-foreground">{q.officialAnswer}</b>
                    {q.independentAnswer && (
                      <> · AI 独立解答：<b className={q.disputed ? 'text-red-600' : 'text-foreground'}>{q.independentAnswer}</b>{q.disputed ? '（不一致）' : '（一致）'}</>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between px-5 py-4 border-t">
                <button onClick={() => { removeQ(i); setEditQ(null) }} className="text-xs text-red-500 hover:underline">删除这道题</button>
                <button onClick={() => setEditQ(null)}
                  className={`px-5 py-2 rounded-lg text-sm font-medium text-white ${theme.solid}`}>完成</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* paper results: who sat it, and which questions the class missed */}
      {resultsFor && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-card rounded-2xl w-full max-w-4xl my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-500" />
                {results?.paper?.title || '成绩'}
                {results?.paper && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${results.paper.isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {results.paper.isPublished ? '已发布' : '未发布'}
                  </span>
                )}
              </h2>
              <button onClick={() => setResultsFor(null)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
            </div>

            {!results ? (
              <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin inline" /></div>
            ) : (
              <>
                <div className="px-5 py-4 grid grid-cols-2 sm:grid-cols-4 gap-3 border-b">
                  <div><div className="text-xs text-muted-foreground">已考学生</div><div className="text-xl font-semibold">{results.submittedCount}</div></div>
                  <div><div className="text-xs text-muted-foreground">平均分</div><div className="text-xl font-semibold text-violet-700">{results.average ?? '—'}</div></div>
                  <div><div className="text-xs text-muted-foreground">最高 / 最低</div><div className="text-xl font-semibold">{results.highest ?? '—'} / {results.lowest ?? '—'}</div></div>
                  <div><div className="text-xs text-muted-foreground">进行中</div><div className="text-xl font-semibold">{results.inProgressCount}</div></div>
                </div>

                {/* A published mock course is sat by several classes at once, so
                    the raw list mixes them — narrow to one class here. */}
                {results.classes?.length > 0 && (
                  <div className="flex items-center gap-2 px-5 pt-4">
                    <span className="text-xs text-muted-foreground">班级</span>
                    <select value={results.classId || ''}
                      onChange={e => { setResultsClass(e.target.value); openResults(resultsFor!, e.target.value) }}
                      className="px-2 py-1.5 border rounded-lg bg-background text-xs">
                      <option value="">全部班级</option>
                      {results.classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                    {results.classId === '' && results.classes.length > 1 && (
                      <span className="text-xs text-amber-700">当前是全部学生的合并成绩，选一个班级可以只看本班</span>
                    )}
                  </div>
                )}

                <div className="flex gap-1 px-5 pt-4">
                  <button onClick={() => setResultsTab('students')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'students' ? 'bg-violet-500 text-white font-medium' : 'hover:bg-accent'}`}>
                    按学生 ({results.rows.length})
                  </button>
                  <button onClick={() => setResultsTab('questions')}
                    className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${resultsTab === 'questions' ? 'bg-violet-500 text-white font-medium' : 'hover:bg-accent'}`}>
                    按题目（薄弱优先）
                  </button>
                </div>

                <div className="p-5">
                  {resultsTab === 'students' ? (
                    results.rows.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-6 text-center">还没有人交卷。</p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="text-muted-foreground">
                          <tr className="text-left">
                            <th className="py-2 pr-3 font-medium">学生</th>
                            {/* One column per attempt, so 第一次 → 第二次 → 重测
                                reads as progress rather than three separate rows. */}
                            <th className="py-2 font-medium">各次正确率</th>
                            <th className="py-2 px-2 font-medium text-center">至今没答对</th>
                            <th className="py-2 px-2 font-medium text-center">最近用时</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.rows.map((r: any) => (
                            <tr key={r.studentId} className="border-t">
                              <td className="py-2 pr-3">
                                <button onClick={() => r.latestSessionId && openDetail(r.latestSessionId)}
                                  className={`font-medium hover:underline ${r.neverCorrect === 0 ? 'text-emerald-700' : ''}`}
                                  title="点开看逐题情况">
                                  {r.studentName} ↗
                                </button>
                                {r.neverCorrect === 0 && <span className="ml-1 text-xs text-emerald-600">全对</span>}
                              </td>
                              <td className="py-2">
                                <div className="flex flex-wrap items-center gap-1">
                                  {r.attempts.map((a: any, i: number) => (
                                    <span key={a.sessionId} className="flex items-center gap-1">
                                      {i > 0 && <span className="text-gray-300">→</span>}
                                      <button onClick={() => openDetail(a.sessionId)}
                                        title={`第 ${a.n} 次${a.mode === 'retry' ? '（错题重测）' : ''}：本场 ${a.correctInAttempt}/${a.totalInAttempt}，全卷累计 ${a.cumulativeCorrect}/${r.paperTotal}${a.submitReason === 'timeout' ? ' · 超时交卷' : ''}`}
                                        className={`px-1.5 py-0.5 rounded tabular-nums hover:bg-accent transition-colors ${
                                          a.cumulativePercentage >= 60 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                        <span className="text-[10px] text-muted-foreground">{a.mode === 'retry' ? '测' : a.n}</span> {a.cumulativePercentage}%
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="py-2 px-2 text-center">
                                {r.neverCorrect > 0
                                  ? <span className="text-rose-600 tabular-nums">{r.neverCorrect}</span>
                                  : <span className="text-emerald-600">0</span>}
                              </td>
                              <td className="py-2 px-2 text-center text-muted-foreground tabular-nums">
                                {r.attempts[r.attempts.length - 1]?.usedSeconds != null ? fmt(r.attempts[r.attempts.length - 1].usedSeconds) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )
                  ) : (
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground mb-2">
                        正确率从低到高排；每题标出它对应的章节课时。全班错得多的题，就是该回去讲的课时。
                      </p>
                      {[...results.questions].sort((a: any, b: any) => a.rate - b.rate).map((q: any) => (
                        <div key={q.questionId} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                          <span className="w-8 shrink-0 text-xs text-muted-foreground tabular-nums">#{q.sortOrder + 1}</span>
                          <span className={`w-12 shrink-0 text-sm font-medium tabular-nums ${q.rate >= 60 ? 'text-emerald-700' : q.rate >= 30 ? 'text-amber-600' : 'text-rose-600'}`}>{q.rate}%</span>
                          <span className="flex-1 min-w-0 text-sm truncate">{String(q.stem).replace(/\s+/g, ' ').slice(0, 80)}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">{q.correct}/{q.asked}</span>
                          {(q.chapterTitle || q.lessonTitle) && (
                            <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 max-w-[240px] truncate">
                              {q.lessonRef ? `${q.lessonRef} ` : ''}{q.lessonTitle || q.chapterTitle}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* students × papers: how each student is doing across the whole course */}
      {showOverview && (
        <div className="fixed inset-0 z-[70] bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-card rounded-2xl w-full max-w-5xl my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-violet-500" />
                总成绩 · 每人在各套卷上的表现
                {overview?.courseName && <span className="text-xs font-normal text-muted-foreground">{overview.courseName}</span>}
              </h2>
              <button onClick={() => setShowOverview(false)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
            </div>

            {!overview ? (
              <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin inline" /></div>
            ) : (
              <div className="p-5">
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  <span className="text-xs text-muted-foreground">课程</span>
                  <select value={overviewCourse}
                    onChange={e => openOverview(e.target.value, '')}
                    className="px-2 py-1.5 border rounded-lg bg-background text-xs">
                    {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground ml-2">班级</span>
                  <select value={overviewClass}
                    onChange={e => openOverview(overviewCourse, e.target.value)}
                    className="px-2 py-1.5 border rounded-lg bg-background text-xs">
                    <option value="">全部班级</option>
                    {(overview.classes || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  <span className="text-xs text-muted-foreground">同一套卷多次考取最好的一次；点分数看该生这一场的逐题对错</span>
                </div>

                {overview.students.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">还没有交卷记录。</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-muted-foreground">
                        <tr className="text-left">
                          <th className="py-2 pr-3 font-medium sticky left-0 bg-card">学生</th>
                          {overview.papers.map((p: any) => (
                            <th key={p.id} className="py-2 px-2 font-medium text-center whitespace-nowrap">
                              {p.title.replace(/^【.*?】/, '').slice(0, 12)}
                              {!p.isPublished && <span className="ml-1 text-[10px] text-gray-400">未发布</span>}
                            </th>
                          ))}
                          <th className="py-2 px-2 font-medium text-center">平均</th>
                          <th className="py-2 px-2 font-medium text-center">趋势</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overview.students.map((s: any) => (
                          <tr key={s.studentId} className="border-t">
                            <td className="py-2 pr-3 sticky left-0 bg-card">
                              <div className="whitespace-nowrap">{s.studentName}</div>
                              {s.classNames?.length > 0 && <div className="text-[10px] text-muted-foreground">{s.classNames.join('、')}</div>}
                            </td>
                            {overview.papers.map((p: any) => {
                              const v = s.scores[p.id]
                              return (
                                <td key={p.id} className="py-2 px-2 text-center tabular-nums">
                                  {v ? (
                                    <button onClick={() => openDetail(v.sessionId)}
                                      className={`px-1.5 py-0.5 rounded hover:bg-accent transition-colors ${v.percentage >= 60 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                      {v.percentage}%
                                    </button>
                                  ) : <span className="text-gray-300">—</span>}
                                </td>
                              )
                            })}
                            <td className="py-2 px-2 text-center font-medium tabular-nums">{s.average ?? '—'}</td>
                            <td className="py-2 px-2 text-center tabular-nums">
                              {s.trend == null ? <span className="text-gray-300">—</span> : (
                                <span className={s.trend > 0 ? 'text-emerald-600' : s.trend < 0 ? 'text-rose-600' : 'text-muted-foreground'}>
                                  {s.trend > 0 ? '↑' : s.trend < 0 ? '↓' : '→'} {Math.abs(s.trend)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-4">
                  趋势 = 最近一次成绩 − 第一次成绩（同一套卷取最好一次）。点每套卷旁边的「成绩」可以看那一场的逐题情况。
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* one student, one paper: every question with what they chose */}
      {detailFor && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-card rounded-2xl w-full max-w-3xl my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="font-semibold">
                {detail?.studentName || '…'}
                <span className="text-sm font-normal text-muted-foreground"> · {detail?.review?.paperTitle || ''}</span>
                {detail?.review && (
                  <span className={`ml-2 text-sm font-semibold ${detail.review.score.percentage >= 60 ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {detail.review.score.percentage}%
                  </span>
                )}
              </h2>
              <button onClick={() => setDetailFor(null)} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><X className="w-5 h-5" /></button>
            </div>
            {!detail ? (
              <div className="py-16 text-center"><Loader2 className="w-6 h-6 text-violet-500 animate-spin inline" /></div>
            ) : (
              <div className="p-5 space-y-3">
                <div className="text-xs text-muted-foreground">
                  全卷 {detail.review.score.total} 题，累计答对 {detail.review.score.correct} 题
                  {detail.review.score.unanswered > 0 && ` · 还没答对 ${detail.review.score.unanswered} 题`}
                  {detail.review.submitReason === 'timeout' && ' · 超时自动交卷'}
                </div>
                {detail.review.attempts?.length > 1 && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>历次：</span>
                    {detail.review.attempts.map((a: any) => (
                      <span key={a.sessionId} className={a.sessionId === detail.review.sessionId ? 'font-medium text-violet-700' : ''}>
                        第{a.n}次 {a.correctInAttempt}/{a.totalInAttempt} → 累计 {a.cumulativeCorrect}/{detail.review.score.total}（{a.cumulativePercentage}%）
                      </span>
                    ))}
                  </div>
                )}
                {detail.review.questions.map((q: any, i: number) => (
                  <div key={q.questionId} className="border rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className={`w-6 h-6 rounded-md text-xs font-semibold flex items-center justify-center ${q.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{i + 1}</span>
                      {!q.isCorrect && q.selectedOptionId == null && <span className="text-xs text-gray-500">未作答</span>}
                      {q.flagged && <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800">考试时标记过</span>}
                      {/* Which attempt finally got it right — the whole point of
                          tracking retests. */}
                      {q.firstCorrectAttempt == null ? (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700">
                          至今没答对（错 {q.wrongTimes} 次）
                        </span>
                      ) : (
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                          q.firstCorrectAttempt === 1 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
                          {q.firstCorrectAttempt === 1 ? '第一次就答对' : `第 ${q.firstCorrectAttempt} 次才答对`}
                        </span>
                      )}
                      {q.lessonId && (q.chapterTitle || q.lessonTitle) && (
                        <Link href={`/play/${q.lessonId}`} title="去这一课看知识点"
                          className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 hover:bg-violet-100 hover:text-violet-800 underline decoration-dotted underline-offset-2 transition-colors">
                          {q.lessonRef ? `${q.lessonRef} ` : ''}{q.lessonTitle || q.chapterTitle} ↗
                        </Link>
                      )}
                    </div>
                    <div className="text-sm mb-2"><KatexHtml text={q.stem} /></div>
                    <div className="space-y-1">
                      {q.options.map((o: any, oi: number) => {
                        const right = o.id === q.correctOptionId
                        const picked = o.id === q.selectedOptionId
                        return (
                          <div key={o.id} className={`flex items-start gap-2 px-2 py-1 rounded text-sm ${right ? 'bg-emerald-50' : picked ? 'bg-rose-50' : ''}`}>
                            <span className="font-medium text-muted-foreground shrink-0">{'ABCDEFGH'[oi]}.</span>
                            <span className="flex-1"><KatexHtml text={cleanOption(o.content)} /></span>
                            {right && <span className="text-xs text-emerald-700 shrink-0">正确答案</span>}
                            {picked && !right && <span className="text-xs text-rose-700 shrink-0">他选的</span>}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {zoom && (
        <div className="fixed inset-0 z-[70] bg-black/85 flex items-center justify-center p-3">
          <button onClick={() => setZoom(null)} title="关闭"
            className="absolute top-4 right-4 p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white transition-colors">
            <X className="w-6 h-6" />
          </button>
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
