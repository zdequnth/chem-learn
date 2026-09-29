import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

const CHUNK = 120
const PAGE = 1000

function chunk<T>(arr: T[], size = CHUNK): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function fetchAllIn(table: string, column: string, ids: string[], select = '*'): Promise<any[]> {
  if (ids.length === 0) return []
  const out: any[] = []
  for (const part of chunk(ids)) {
    let offset = 0
    while (true) {
      const { data } = await supabaseAdmin(table, {
        query: `?${column}=in.(${part.join(',')})&select=${select}&limit=${PAGE}&offset=${offset}`,
      })
      const rows = data || []
      out.push(...rows)
      if (rows.length < PAGE) break
      offset += PAGE
    }
  }
  return out
}

// A word counts as mastered once its Leitner box has survived a few spaced
// reviews. Self-ratings (last_result) are deliberately NOT used for this.
const MASTERED_BOX = 3

// Interval (in days) awarded for reaching the given box. Box 0 means "still
// learning" and never gets a long interval. Always >= 1 day so due_at is never
// written in the past — otherwise the review queue could never drain.
const BOX_DAYS: Record<number, number> = { 0: 1, 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 }

function nextSrs(currentBox: number, result: string) {
  let box: number
  if (result === 'known') box = Math.min(currentBox + 1, 5)
  else if (result === 'fuzzy') box = Math.max(currentBox - 1, 0)
  else box = 0
  const days = BOX_DAYS[box] ?? 1
  return { box, dueAt: new Date(Date.now() + days * 86400000).toISOString() }
}

// Which courses may this student practise vocabulary for? Their classes'
// courses, PLUS every published course that has a word bank.
//
// The `is_published` part matters because a class points at exactly one course
// (`classes.course_id`), so a class whose main course is e.g. 化学H can never
// surface a separate vocabulary course like IGCSE 化学. Unpublishing the course
// is the teacher's switch for hiding it again.
async function scopeCourseIds(studentId: string): Promise<string[]> {
  const members = await fetchAllIn('class_members', 'student_id', [studentId], 'class_id')
  const classIds = [...new Set(members.map((m: any) => m.class_id).filter(Boolean))]
  const classes = classIds.length ? await fetchAllIn('classes', 'id', classIds, 'course_id') : []
  const fromClasses = classes.map((c: any) => c.course_id).filter(Boolean)

  const { data: courses } = await supabaseAdmin('courses', { query: `?is_published=eq.true&select=id` })
  const published = (courses || []).map((c: any) => c.id)

  return [...new Set([...fromClasses, ...published])]
}

async function aggregate(courseIds: string[], studentId: string, perCourse: boolean) {
  const chapters = await fetchAllIn('chapters', 'course_id', courseIds, 'id,course_id,title,sort_order')
  const lessons = chapters.length
    ? await fetchAllIn('lessons', 'chapter_id', chapters.map((c: any) => c.id), 'id,chapter_id,title,sort_order')
    : []
  const words = lessons.length
    ? await fetchAllIn('vocab_words', 'lesson_id', lessons.map((l: any) => l.id), 'id,lesson_id')
    : []
  const progress = await fetchAllIn('vocab_progress', 'student_id', [studentId], 'word_id,box,due_at')

  const lessonCourse = new Map(lessons.map((l: any) => [l.id, chapters.find((c: any) => c.id === l.chapter_id)?.course_id]))
  const wordBucket = new Map<string, string>() // word id -> lesson id
  for (const w of words) wordBucket.set(w.id, w.lesson_id)

  const now = Date.now()
  const zero = () => ({ wordCount: 0, studied: 0, mastered: 0, due: 0 })

  if (perCourse) {
    const agg = new Map<string, ReturnType<typeof zero>>()
    for (const cid of courseIds) agg.set(cid, zero())
    for (const w of words) {
      const cid = lessonCourse.get(w.lesson_id)
      const a = cid && agg.get(cid)
      if (a) a.wordCount++
    }
    for (const p of progress) {
      const lid = wordBucket.get(p.word_id)
      const cid = lid && lessonCourse.get(lid)
      const a = cid && agg.get(cid)
      if (!a) continue
      a.studied++
      if ((p.box ?? 0) >= MASTERED_BOX) a.mastered++
      if (p.due_at && new Date(p.due_at).getTime() <= now) a.due++
    }
    return { agg, chapters, lessons, words, progress }
  }

  const agg = new Map<string, ReturnType<typeof zero>>()
  for (const l of lessons) agg.set(l.id, zero())
  for (const w of words) {
    const a = agg.get(w.lesson_id)
    if (a) a.wordCount++
  }
  for (const p of progress) {
    const lid = wordBucket.get(p.word_id)
    const a = lid && agg.get(lid)
    if (!a) continue
    a.studied++
    if ((p.box ?? 0) >= MASTERED_BOX) a.mastered++
    if (p.due_at && new Date(p.due_at).getTime() <= now) a.due++
  }
  return { agg, chapters, lessons, words, progress }
}

// GET             → the courses this student can study, with counts
// GET ?courseId=  → that course's lessons, with counts
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const courseId = searchParams.get('courseId')

  if (courseId) {
    const { agg, chapters, lessons } = await aggregate([courseId], user.id, false)
    const chapterOf = new Map(chapters.map((c: any) => [c.id, c]))
    const list = lessons
      .map((l: any) => {
        const a = agg.get(l.id) || { wordCount: 0, studied: 0, mastered: 0, due: 0 }
        return {
          id: l.id,
          title: l.title,
          chapterId: l.chapter_id,
          chapterTitle: chapterOf.get(l.chapter_id)?.title || '',
          chapterOrder: chapterOf.get(l.chapter_id)?.sort_order ?? 0,
          lessonOrder: l.sort_order ?? 0,
          ...a,
        }
      })
      .filter((l: any) => l.wordCount > 0)
      .sort((a: any, b: any) => a.chapterOrder - b.chapterOrder || a.lessonOrder - b.lessonOrder)

    return NextResponse.json({ lessons: list, dueTotal: list.reduce((s: number, l: any) => s + l.due, 0) })
  }

  const courseIds = await scopeCourseIds(user.id)
  if (courseIds.length === 0) return NextResponse.json({ courses: [] })

  const { agg } = await aggregate(courseIds, user.id, true)
  const courses = await fetchAllIn('courses', 'id', courseIds, 'id,name,sort_order')
  const list = courses
    .map((c: any) => ({ id: c.id, name: c.name, ...(agg.get(c.id) || { wordCount: 0, studied: 0, mastered: 0, due: 0 }) }))
    .filter((c: any) => c.wordCount > 0)

  return NextResponse.json({ courses: list })
}

// POST {wordId, result} → record a self-assessment and advance the SRS schedule.
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { wordId, result } = await request.json()
  if (!wordId || !['known', 'fuzzy', 'unknown'].includes(result)) {
    return NextResponse.json({ error: '参数不对' }, { status: 400 })
  }

  const { data: w } = await supabaseAdmin('vocab_words', { query: `?id=eq.${wordId}&select=id` })
  if (!w?.[0]) return NextResponse.json({ error: '词条不存在' }, { status: 404 })

  // Read-then-write rather than PostgREST upsert: supabaseAdmin() hardcodes
  // `Prefer: return=representation` on POST, and an upsert would need
  // `resolution=merge-duplicates` + on_conflict, so a plain POST hits the
  // UNIQUE(student_id, word_id) constraint with a 409.
  const { data: cur } = await supabaseAdmin('vocab_progress', {
    query: `?student_id=eq.${user.id}&word_id=eq.${wordId}&select=*`,
  })
  const existing = cur?.[0] || null

  const { box, dueAt } = nextSrs(existing?.box ?? 0, result)
  const now = new Date().toISOString()
  const payload: any = {
    last_result: result,
    box,
    due_at: dueAt,
    correct_count: (existing?.correct_count ?? 0) + (result === 'known' ? 1 : 0),
    wrong_count: (existing?.wrong_count ?? 0) + (result === 'unknown' ? 1 : 0),
    last_seen_at: now,
    updated_at: now,
  }

  const { error } = existing
    ? await supabaseAdmin('vocab_progress', { method: 'PATCH', body: payload, query: `?id=eq.${existing.id}` })
    : await supabaseAdmin('vocab_progress', { method: 'POST', body: { student_id: user.id, word_id: wordId, ...payload } })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ progress: { word_id: wordId, ...payload } })
}
