'use client'

import { useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import type { VocabResult, VocabWordWithProgress } from '@/lib/types'
import { Loader2, ArrowLeft, Volume2, Sparkles } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

type LessonRow = {
  id: string; title: string; chapterId: string; chapterTitle: string
  chapterOrder: number; lessonOrder: number
  wordCount: number; studied: number; mastered: number; due: number
}
type CourseRow = { id: string; name: string; wordCount: number; studied: number; mastered: number; due: number }

type StudyMode = 'card' | 'spell' | 'choice' | 'def'

const SESSION_CAP = 30

// A word is "due" when it has never been answered, or its scheduled review time
// has passed.
function isDue(w: VocabWordWithProgress) {
  if (!w.progress) return true
  return new Date(w.progress.due_at).getTime() <= Date.now()
}

// Must match MASTERED_BOX in /api/vocab/progress — a word is mastered once its
// box has been raised twice by objective answers.
const MASTERED_BOX = 2

// `review` must return exactly the words the "今日复习" list advertises
// (overdue only) — otherwise the tab says 0 due but the session still runs.
// `study` ("继续") is the rest of the lesson: overdue words first, then the ones
// not yet mastered. Words already mastered and not yet due are left out, so a
// student who has done 10 of 11 words is not made to redo all 11.
function buildQueue(words: VocabWordWithProgress[], mode: 'study' | 'review'): VocabWordWithProgress[] {
  const byDue = (a: VocabWordWithProgress, b: VocabWordWithProgress) =>
    new Date(a.progress!.due_at).getTime() - new Date(b.progress!.due_at).getTime()
  const due = words.filter(w => w.progress && isDue(w)).sort(byDue)
  if (mode === 'review') return due.slice(0, SESSION_CAP)

  const fresh = words.filter(w => !w.progress)
  const unmastered = words
    .filter(w => w.progress && !isDue(w) && (w.progress.box ?? 0) < MASTERED_BOX)
    .sort((a, b) => (a.progress!.box ?? 0) - (b.progress!.box ?? 0))
  const queue = [...due, ...fresh, ...unmastered]
  // Nothing left to work on → let them go through the whole lesson again.
  return queue.length > 0 ? queue : words
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function VocabContent() {
  const router = useRouter()
  const sp = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  const { lang } = useLang()

  const [courses, setCourses] = useState<CourseRow[]>([])
  const [selectedCourse, setSelectedCourse] = useState<string>(sp.get('course') || '')
  const [lessons, setLessons] = useState<LessonRow[]>([])
  const [dueTotal, setDueTotal] = useState(0)
  const [tab, setTab] = useState<'study' | 'review'>('study')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // Active study session
  const [queue, setQueue] = useState<VocabWordWithProgress[] | null>(null)
  const [wordPool, setWordPool] = useState<VocabWordWithProgress[]>([])
  const [again, setAgain] = useState<VocabWordWithProgress[]>([])
  const [pos, setPos] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [mode, setMode] = useState<StudyMode>('card')
  const [answerInput, setAnswerInput] = useState('')
  const [choicePick, setChoicePick] = useState<string | null>(null)
  const [lastOk, setLastOk] = useState<boolean | null>(null)
  const [fx, setFx] = useState<{ kind: 'correct' | 'wrong'; key: number } | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [done, setDone] = useState(0)
  const requeued = useRef<Set<string>>(new Set())

  // ---- Text-to-speech. British and American are offered separately, because
  // IGCSE uses British spelling but students still need to recognise American
  // pronunciation. Chrome populates getVoices() asynchronously.
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  // getVoices() is unreliable (Chrome often returns [] until voiceschanged, and
  // some builds never list the system voice). speak() still works with a bare
  // lang tag, so only treat genuinely missing speechSynthesis as "no voice" —
  // hiding the buttons otherwise is what made pronunciation look broken.
  const [ttsUnsupported, setTtsUnsupported] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('speechSynthesis' in window)) { setTtsUnsupported(true); return }
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load)
  }, [])
  const norm = (l?: string) => (l || '').replace('_', '-').toLowerCase()
  const gbVoice = useMemo(() => voices.find(v => norm(v.lang).startsWith('en-gb')) || null, [voices])
  const usVoice = useMemo(() => voices.find(v => norm(v.lang).startsWith('en-us')) || null, [voices])
  // Preferred voice per accent; falls back to any English voice, then to a bare
  // lang tag which lets the OS pick.
  const anyEn = useMemo(() => gbVoice || usVoice || voices.find(v => norm(v.lang).startsWith('en')) || null, [voices])
  const noVoice = ttsUnsupported

  const speak = (text: string, accent: 'gb' | 'us' = 'gb') => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    const chosen = accent === 'us' ? (usVoice || anyEn) : (gbVoice || anyEn)
    const u = new SpeechSynthesisUtterance(text)
    if (chosen) { u.voice = chosen; u.lang = chosen.lang }
    else u.lang = accent === 'us' ? 'en-US' : 'en-GB'
    u.rate = 0.9
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
  }

  const speakButtons = (text: string) => (
    <div className="flex items-center justify-center gap-2 flex-wrap">
      <button onClick={() => speak(text, 'gb')}
        className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-accent transition-colors">
        <Volume2 className="w-4 h-4" /> {lang === 'zh' ? '英式' : 'UK'}
      </button>
      <button onClick={() => speak(text, 'us')}
        className="flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-sm hover:bg-accent transition-colors">
        <Volume2 className="w-4 h-4" /> {lang === 'zh' ? '美式' : 'US'}
      </button>
    </div>
  )

  useEffect(() => {
    if (!authLoading && !user) router.push('/login')
  }, [user, authLoading, router])

  useEffect(() => { localStorage.setItem('vocab.tab', tab) }, [tab])

  useEffect(() => {
    if (!user) return
    fetch('/api/vocab/progress').then(r => r.json()).then(json => {
      const list: CourseRow[] = json.courses || []
      setCourses(list)
      setSelectedCourse(prev => prev || localStorage.getItem('vocab.course') || list[0]?.id || '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [user])

  useEffect(() => {
    if (!selectedCourse) { setLessons([]); setDueTotal(0); return }
    localStorage.setItem('vocab.course', selectedCourse)
    fetch(`/api/vocab/progress?courseId=${selectedCourse}`).then(r => r.json()).then(json => {
      setLessons(json.lessons || [])
      setDueTotal(json.dueTotal || 0)
    }).catch(() => {})
  }, [selectedCourse])

  const startSession = async (lessonId: string, sessionMode: 'study' | 'review') => {
    setBusy(true)
    const json = await fetch(`/api/vocab/words?lessonId=${lessonId}`).then(r => r.json()).catch(() => ({}))
    const words: VocabWordWithProgress[] = json.words || []
    const q = buildQueue(words, sessionMode)
    setBusy(false)
    if (q.length === 0) { alert(lang === 'zh' ? '这个课时没有可学的词' : 'No words to study'); return }
    requeued.current = new Set()
    // The whole lesson is kept as the distractor pool, so a word re-shown after
    // a mistake still gets four options (the re-queue holds only missed words).
    setWordPool(words)
    setQueue(q); setAgain([]); setPos(0); setFlipped(false)
    setAnswerInput(''); setChoicePick(null); setLastOk(null); setFx(null); setDone(0)
    // Warm the image cache up front so flipping a card does not wait on the
    // network — images are served from our own domain and cached immutably.
    if (typeof window !== 'undefined') {
      for (const w of words) {
        if (!w.image_url) continue
        const img = new window.Image()
        img.decoding = 'async'
        img.src = w.image_url
      }
    }
  }

  // Entering from a lesson hub (/play/[lessonId]) jumps straight into study.
  const autoStarted = useRef(false)
  useEffect(() => {
    const lessonId = sp.get('lessonId')
    if (!user || !lessonId || autoStarted.current) return
    autoStarted.current = true
    startSession(lessonId, 'study')
  }, [user])

  const endSession = () => {
    setQueue(null); setAgain([]); setPos(0)
    // refresh counts
    if (selectedCourse) {
      fetch(`/api/vocab/progress?courseId=${selectedCourse}`).then(r => r.json()).then(json => {
        setLessons(json.lessons || []); setDueTotal(json.dueTotal || 0)
      }).catch(() => {})
    }
    fetch('/api/vocab/progress').then(r => r.json()).then(json => setCourses(json.courses || [])).catch(() => {})
  }

  const advance = (word: VocabWordWithProgress, wrong: boolean) => {
    setDone(d => d + 1)
    let nextAgain = again
    // Re-show a missed word later in this session, but only once, so a student
    // who keeps pressing "不认识" can still finish.
    if (wrong && !requeued.current.has(word.id)) {
      requeued.current.add(word.id)
      nextAgain = [...again, word]
    }
    const nextPos = pos + 1
    setFlipped(false); setAnswerInput(''); setChoicePick(null); setLastOk(null); setFx(null)
    if (nextPos < queue!.length) { setPos(nextPos); setAgain(nextAgain); return }
    // `requeued` is deliberately NOT cleared here — clearing it would let a word
    // be re-queued on every pass, so a student who kept pressing "不认识" could
    // never reach the end of the session.
    if (nextAgain.length > 0) { setQueue(nextAgain); setAgain([]); setPos(0); return }
    endSession()
  }

  const rate = async (result: VocabResult) => {
    const word = queue![pos]
    fetch('/api/vocab/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // mode lets the server tell an objective answer from a self-assessment
      body: JSON.stringify({ wordId: word.id, result, mode: 'card' }),
    }).catch(() => {})
    advance(word, result !== 'known')
  }

  // Every "did they get it right" mode funnels through here so the right/wrong
  // flash, the SRS write and the Next button all agree on one answer.
  const settle = (ok: boolean) => {
    const word = queue![pos]
    setLastOk(ok)
    setFlipped(true)
    setFx({ kind: ok ? 'correct' : 'wrong', key: Date.now() })
    fetch('/api/vocab/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      // spell / choice / def are objective, so they may raise the box
      body: JSON.stringify({ wordId: word.id, result: ok ? 'known' : 'unknown', mode }),
    }).catch(() => {})
  }

  const submitSpelling = () => {
    const word = queue![pos]
    settle(answerInput.trim().toLowerCase() === word.term.trim().toLowerCase())
  }

  const submitChoice = (option: string) => {
    const word = queue![pos]
    setChoicePick(option)
    settle(option === (mode === 'def' ? word.term : word.zh))
  }

  const grouped = useMemo(() => {
    const byChapter = new Map<string, { title: string; order: number; rows: LessonRow[] }>()
    for (const l of lessons) {
      if (!byChapter.has(l.chapterId)) byChapter.set(l.chapterId, { title: l.chapterTitle, order: l.chapterOrder, rows: [] })
      byChapter.get(l.chapterId)!.rows.push(l)
    }
    return [...byChapter.values()].sort((a, b) => a.order - b.order)
  }, [lessons])

  // On first load, fold away chapters the student has already finished, so the
  // ones still to do are immediately visible. Runs once — later updates (e.g.
  // finishing a chapter in this session) must not silently fold it.
  const collapseInit = useRef(false)
  useEffect(() => {
    if (collapseInit.current || grouped.length === 0) return
    collapseInit.current = true
    const init: Record<string, boolean> = {}
    for (const ch of grouped) {
      if (ch.rows.length > 0 && ch.rows.every(r => r.wordCount > 0 && r.mastered >= r.wordCount)) {
        init[ch.title] = true
      }
    }
    if (Object.keys(init).length > 0) setCollapsed(init)
  }, [grouped])

  // Options for the choice/definition modes. Memoised on the current word (not
  // on `pos`/`queue`) so they neither reshuffle when the answer is revealed nor
  // collapse to a single option when the queue shrinks to the re-asked words.
  const currentWordId = queue && queue.length > 0 ? queue[pos]?.id : null
  // Stable reference while a session runs, so the memo below is not invalidated
  // (and the options are not reshuffled) when the queue swaps to re-asked words.
  const optionSource = wordPool.length > 0 ? wordPool : (queue || [])
  const optionList = useMemo(() => {
    if (!currentWordId) return []
    const w = optionSource.find(x => x.id === currentWordId)
    if (!w) return []
    const correct = mode === 'def' ? w.term : w.zh
    const seen = new Set([correct])
    const pool: string[] = []
    for (const other of optionSource) {
      if (other.id === w.id) continue
      const v = mode === 'def' ? other.term : other.zh
      if (!v || seen.has(v)) continue
      seen.add(v)
      pool.push(v)
    }
    return shuffle([correct, ...shuffle(pool).slice(0, 3)])
  }, [currentWordId, mode, optionSource])

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  // ---------- Active session ----------
  if (queue && queue.length > 0) {
    const word = queue[pos]
    const isLast = pos === queue.length - 1 && again.length === 0
    const pct = Math.round((done / (done + queue.length - pos + again.length)) * 100)
    const correctOption = mode === 'def' ? word.term : word.zh

    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <main className="max-w-2xl mx-auto px-4 pt-24 pb-20">
          <div className="flex items-center justify-between mb-4">
            <button onClick={endSession} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-4 h-4" /> {lang === 'zh' ? '结束' : 'End'}
            </button>
            <div className="flex gap-1 border rounded-lg overflow-hidden text-xs">
              {([['card', '卡片'], ['spell', '拼写'], ['choice', '选择'], ['def', '释义']] as const).map(([m, label]) => (
                <button key={m} onClick={() => {
                  setMode(m); setFlipped(false); setAnswerInput(''); setChoicePick(null); setLastOk(null); setFx(null)
                }}
                  className={`px-3 py-1.5 transition-colors ${mode === m ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="h-1.5 bg-gray-200 rounded-full mb-2 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
          </div>

          <p className="text-xs text-muted-foreground mb-5">
            {mode === 'card'
              ? (lang === 'zh' ? '卡片是预习：这里的「认识」只是自己感觉，不计入「掌握」。掌握要靠 拼写 / 选择 / 释义 答对两次。' : 'Flashcards are for preview — self-rated "known" does not count as mastery. Spelling / choice / definition must be right twice.')
              : (lang === 'zh' ? '答对会计入「掌握」，同一词累计答对两次即算掌握。' : 'A correct answer counts towards mastery — twice and the word is mastered.')}
          </p>

          <div className="relative bg-card border rounded-2xl p-8 min-h-[280px] flex flex-col">
            {/* the right/wrong mark stays put until the next word */}
            {fx && (
              <span key={fx.key} aria-hidden
                className={`fx-mark absolute right-4 top-4 leading-none ${fx.kind === 'correct' ? 'text-emerald-500' : 'text-red-500'}`}>
                {fx.kind === 'correct' ? '✓' : '✗'}
              </span>
            )}
            {/* Front / prompt */}
            {mode === 'card' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="text-3xl font-bold">{word.term}</div>
                {word.ipa && <div className="text-sm text-muted-foreground mt-1">{word.ipa}</div>}
                {noVoice
                  ? <div className="mt-3 text-xs text-amber-600">{lang === 'zh' ? '此设备没有英语语音库，无法朗读' : 'No English voice on this device'}</div>
                  : <div className="mt-3">{speakButtons(word.term)}</div>}
              </div>
            )}

            {mode === 'spell' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="text-sm text-muted-foreground mb-2">{lang === 'zh' ? '看中文写英文' : 'Spell the English term'}</div>
                <div className="text-2xl font-semibold mb-1">{word.zh}</div>
                {word.en_def && <div className="text-sm text-muted-foreground mb-4">{word.en_def}</div>}
                <div className="mb-4">{speakButtons(word.term)}</div>
                <input value={answerInput} onChange={e => setAnswerInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !flipped && answerInput.trim()) submitSpelling() }}
                  disabled={flipped} autoFocus
                  className="w-full max-w-xs px-4 py-2 border rounded-lg bg-background text-center disabled:opacity-60"
                  placeholder="type here" />
                {!flipped && (
                  <button onClick={submitSpelling} disabled={!answerInput.trim()}
                    className="mt-3 px-5 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors disabled:opacity-40">
                    {lang === 'zh' ? '检查' : 'Check'}
                  </button>
                )}
              </div>
            )}

            {mode === 'choice' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="text-sm text-muted-foreground mb-2">{lang === 'zh' ? '选出正确的中文释义' : 'Pick the correct meaning'}</div>
                <div className="text-3xl font-bold mb-1">{word.term}</div>
                <div className="mb-4">{speakButtons(word.term)}</div>
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {optionList.map(c => {
                    const picked = choicePick === c
                    const isRight = c === correctOption
                    let cls = 'border hover:bg-accent'
                    if (flipped && isRight) cls = 'border-emerald-400 bg-emerald-50 text-emerald-800'
                    else if (flipped && picked) cls = 'border-red-300 bg-red-50 text-red-700'
                    return (
                      <button key={c} onClick={() => !flipped && submitChoice(c)} disabled={flipped}
                        className={`px-4 py-4 border rounded-xl text-sm transition-colors ${cls}`}>{c}</button>
                    )
                  })}
                </div>
              </div>
            )}

            {mode === 'def' && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <div className="text-sm text-muted-foreground mb-2">{lang === 'zh' ? '看英文释义，选出对应的英文单词' : 'Pick the word that matches the definition'}</div>
                <div className="text-lg font-medium mb-1 max-w-md">{word.en_def || word.zh}</div>
                {word.ipa && <div className="text-sm text-muted-foreground mb-4">{word.ipa}</div>}
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                  {optionList.map(c => {
                    const picked = choicePick === c
                    const isRight = c === correctOption
                    let cls = 'border hover:bg-accent'
                    if (flipped && isRight) cls = 'border-emerald-400 bg-emerald-50 text-emerald-800'
                    else if (flipped && picked) cls = 'border-red-300 bg-red-50 text-red-700'
                    return (
                      <button key={c} onClick={() => !flipped && submitChoice(c)} disabled={flipped}
                        className={`px-4 py-4 border rounded-xl text-sm transition-colors ${cls}`}>{c}</button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Back / answer reveal */}
            {flipped && (
              <div className="mt-6 pt-5 border-t text-center">
                <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                  {lang === 'zh' ? '答案' : 'Answer'}
                </div>
                <div className="text-3xl font-bold">{word.term}</div>
                <div className="text-xl font-semibold text-emerald-700 mt-1">{word.zh}</div>
                {word.ipa && <div className="text-sm text-muted-foreground mt-1">{word.ipa}</div>}
                <div className="mt-3">{speakButtons(word.term)}</div>
                {word.image_url && (
                  <button type="button" onClick={() => setZoom(word.image_url)}
                    className="block mx-auto mt-4 group">
                    <img src={word.image_url} alt={word.term}
                      className="mx-auto max-h-72 w-auto rounded-xl border object-contain cursor-zoom-in" loading="lazy" />
                    <span className="block mt-1 text-xs text-muted-foreground group-hover:text-foreground">
                      {lang === 'zh' ? '点图放大' : 'Tap to enlarge'}
                    </span>
                  </button>
                )}
                {word.en_def && (
                  <div className="mt-4 text-base font-medium">{word.en_def}</div>
                )}
                {word.example_en && <div className="mt-2 text-sm">{word.example_en}</div>}
                {word.example_zh && <div className="text-xs text-muted-foreground">{word.example_zh}</div>}
                {word.note && <div className="mt-2 text-xs text-amber-700">⚠️ {word.note}</div>}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-5">
            {mode === 'card' && !flipped && (
              <button onClick={() => setFlipped(true)}
                className="w-full py-4 border-2 border-dashed rounded-2xl text-sm font-medium text-muted-foreground hover:border-emerald-300 hover:text-foreground transition-colors">
                {lang === 'zh' ? '翻卡看答案' : 'Flip to reveal'}
              </button>
            )}

            {flipped && mode === 'card' && (
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => rate('unknown')} className="py-4 rounded-2xl bg-red-50 text-red-700 font-medium hover:bg-red-100 transition-colors">
                  {t('knowUnknown', lang)}
                </button>
                <button onClick={() => rate('fuzzy')} className="py-4 rounded-2xl bg-amber-50 text-amber-700 font-medium hover:bg-amber-100 transition-colors">
                  {t('knowFuzzy', lang)}
                </button>
                <button onClick={() => rate('known')} className="py-4 rounded-2xl bg-emerald-50 text-emerald-700 font-medium hover:bg-emerald-100 transition-colors">
                  {t('knowKnown', lang)}
                </button>
              </div>
            )}

            {flipped && mode !== 'card' && (
              <button onClick={() => advance(word, lastOk === false)}
                className="w-full py-4 bg-gray-900 text-white rounded-2xl text-sm font-medium hover:bg-black transition-colors">
                {isLast ? (lang === 'zh' ? '完成' : 'Finish') : (lang === 'zh' ? '下一个' : 'Next')}
              </button>
            )}
          </div>

          <div className="text-center text-xs text-muted-foreground mt-4">
            {lang === 'zh' ? `已完成 ${done} · 剩余 ${queue.length - pos + again.length}` : `Done ${done} · Left ${queue.length - pos + again.length}`}
          </div>
        </main>

        {/* full-screen image, for diagrams with small labels */}
        {zoom && (
          <div className="fixed inset-0 z-[60] bg-black/85 flex items-center justify-center p-3"
            onClick={() => setZoom(null)}>
            <img src={zoom} alt="" className="max-h-full max-w-full rounded-lg bg-white object-contain" />
          </div>
        )}
      </div>
    )
  }

  // ---------- Browse / overview ----------
  const reviewRows = lessons.filter(l => l.due > 0)

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6 text-emerald-500" /> {lang === 'zh' ? '背单词' : 'Vocabulary'}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === 'zh' ? '按课时学习化学专业词汇，进度自动保存，换设备也在。' : 'Learn chemistry terms by lesson; progress is saved to your account.'}
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : courses.length === 0 ? (
          <div className="bg-card border rounded-2xl p-10 text-center text-muted-foreground">
            {lang === 'zh' ? '还没有可学的词汇。等老师上传词库后就会出现在这里。' : 'No vocabulary available yet.'}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}
                className="px-3 py-2 border rounded-lg bg-background text-sm">
                {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {courses.find(c => c.id === selectedCourse) && (
                <span className="text-sm text-muted-foreground">
                  {(() => { const c = courses.find(x => x.id === selectedCourse)!; return lang === 'zh'
                    ? `${c.wordCount} 词 · 已学 ${c.studied} · 掌握 ${c.mastered}`
                    : `${c.wordCount} words · studied ${c.studied} · mastered ${c.mastered}` })()}
                </span>
              )}
            </div>

            <div className="flex gap-1 border rounded-xl p-1 mb-5 w-fit">
              <button onClick={() => setTab('study')}
                className={`px-4 py-2 rounded-lg text-sm transition-colors ${tab === 'study' ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
                {lang === 'zh' ? '按课时学习' : 'Study'}
              </button>
              <button onClick={() => setTab('review')}
                className={`px-4 py-2 rounded-lg text-sm transition-colors flex items-center gap-1.5 ${tab === 'review' ? 'bg-emerald-500 text-white font-medium' : 'hover:bg-accent'}`}>
                {t('todayReview', lang)}
                {dueTotal > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'review' ? 'bg-white/25' : 'bg-red-100 text-red-700'}`}>{dueTotal}</span>
                )}
              </button>
            </div>

            <p className="text-xs text-muted-foreground mb-5">
              {lang === 'zh'
                ? '「已学」= 学过的词数；「掌握」= 在 拼写 / 选择 / 释义 里答对了两次的词。只点卡片的「认识」不算掌握。'
                : '"Studied" = words you have opened; "Mastered" = words answered right twice in spelling / choice / definition. Tapping "known" on a flashcard does not count.'}
            </p>

            {busy && <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>}

            {!busy && tab === 'study' && (
              grouped.length === 0 ? (
                <div className="bg-card border rounded-2xl p-10 text-center text-muted-foreground">
                  {lang === 'zh' ? '这门课还没有词库。' : 'No words in this course yet.'}
                </div>
              ) : (
                <div className="space-y-6">
                  {grouped.map(ch => {
                    const chDone = ch.rows.every(r => r.wordCount > 0 && r.mastered >= r.wordCount)
                    const chOpen = !collapsed[ch.title]
                    return (
                      <div key={ch.title} className="bg-card border rounded-2xl p-5">
                        <button onClick={() => setCollapsed(c => ({ ...c, [ch.title]: !!chOpen }))}
                          className="w-full flex items-center gap-3 text-left">
                          <h2 className="text-xl font-bold">
                            {ch.order + 1}. {ch.title}
                          </h2>
                          {chDone && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium shrink-0">
                              {lang === 'zh' ? '✓ 已全部掌握' : '✓ all mastered'}
                            </span>
                          )}
                          <span className="ml-auto shrink-0 text-muted-foreground">
                            {chOpen ? '▾' : '▸'}
                          </span>
                        </button>
                        <div className="h-px bg-gray-200 my-3" />
                        {chOpen && (
                          <div className="space-y-2">
                            {ch.rows.map(l => {
                              const pct = l.wordCount ? Math.round((l.mastered / l.wordCount) * 100) : 0
                              const done = pct >= 100
                              // finished → solid green; part-way → a green bar filled to pct%
                              const fill = done
                                ? { background: 'rgba(16,185,129,0.42)', borderColor: '#34d399' }
                                : pct > 0
                                  ? {
                                      background: `linear-gradient(to right, rgba(16,185,129,0.11) 0 ${pct}%, rgba(0,0,0,0) ${pct}% 100%)`,
                                    }
                                  : {}
                              return (
                                <div key={l.id} style={fill}
                                  className="flex items-center justify-between gap-3 border rounded-xl p-3">
                                  <div className="min-w-0">
                                    <div className="text-sm font-medium truncate">
                                      {l.title}
                                      {done && <span className="ml-2 text-emerald-700">✓</span>}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-0.5">
                                      {l.wordCount} 词 · 已学 {l.studied} · 掌握 {pct}%
                                      {l.due > 0 && <span className="text-red-600"> · 待复习 {l.due}</span>}
                                    </div>
                                  </div>
                                  <button onClick={() => startSession(l.id, 'study')}
                                    className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium border bg-white/70 hover:bg-accent transition-colors">
                                    {done
                                      ? (lang === 'zh' ? '复习' : 'Review')
                                      : l.studied > 0
                                        ? (lang === 'zh' ? '继续' : 'Continue')
                                        : (lang === 'zh' ? '开始' : 'Start')}
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )
            )}

            {!busy && tab === 'review' && (
              reviewRows.length === 0 ? (
                <div className="bg-card border rounded-2xl p-10 text-center text-muted-foreground">
                  🎉 {lang === 'zh' ? '今天没有要复习的词，都记住啦。' : 'Nothing to review today.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {reviewRows.map(l => (
                    <div key={l.id} className="bg-card border rounded-2xl p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{l.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{l.chapterOrder + 1}. {l.chapterTitle} · 待复习 {l.due} 词</div>
                      </div>
                      <button onClick={() => startSession(l.id, 'review')}
                        className="shrink-0 px-4 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
                        {lang === 'zh' ? '复习' : 'Review'}
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
          </>
        )}
      </main>
    </div>
  )
}

export default function VocabPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>}>
      <VocabContent />
    </Suspense>
  )
}
