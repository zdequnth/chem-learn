import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

const CHUNK = 120
const PAGE = 1000
const MASTERED_BOX = 3

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

async function canAccessCourse(userId: string, role: string | undefined, courseId: string | null): Promise<boolean> {
  if (!courseId) return false
  if (role === 'admin') return true
  const { data: course } = await supabaseAdmin('courses', { query: `?id=eq.${courseId}&select=owner_id` })
  if (course?.[0]?.owner_id === userId) return true
  const { data: cc } = await supabaseAdmin('course_collaborators', { query: `?course_id=eq.${courseId}&teacher_id=eq.${userId}&select=id` })
  return (cc || []).length > 0
}

// `scope=course` → ?courseId=   |   `scope=class` → ?classId=
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })
  const role = (user.user_metadata as any)?.role

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') === 'class' ? 'class' : 'course'
  const courseIdParam = searchParams.get('courseId')
  const classIdParam = searchParams.get('classId')

  let courseId: string | null = null
  let scopeName = ''
  let scopeStudents: string[] | null = null // null = "everyone with progress in this course"

  if (scope === 'class') {
    if (!classIdParam) return NextResponse.json({ error: '缺少classId' }, { status: 400 })
    const { data: cls } = await supabaseAdmin('classes', { query: `?id=eq.${classIdParam}&select=id,name,teacher_id,course_id` })
    const c = cls?.[0]
    if (!c) return NextResponse.json({ error: '班级不存在' }, { status: 404 })
    if (c.teacher_id !== user.id && role !== 'admin') return NextResponse.json({ error: '无权查看' }, { status: 403 })
    courseId = c.course_id
    scopeName = c.name
    const members = await fetchAllIn('class_members', 'class_id', [classIdParam], 'student_id')
    scopeStudents = [...new Set(members.map((m: any) => m.student_id))]
  } else {
    if (!courseIdParam) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })
    if (!await canAccessCourse(user.id, role, courseIdParam)) return NextResponse.json({ error: '无权查看' }, { status: 403 })
    const { data: cr } = await supabaseAdmin('courses', { query: `?id=eq.${courseIdParam}&select=name` })
    courseId = courseIdParam
    scopeName = cr?.[0]?.name || ''
  }

  const empty = { scope, scopeName, lessons: [], words: [], students: [], empty: true }
  if (!courseId) return NextResponse.json(empty)

  const chapters = await fetchAllIn('chapters', 'course_id', [courseId], 'id,title,sort_order')
  const lessons = chapters.length
    ? await fetchAllIn('lessons', 'chapter_id', chapters.map((c: any) => c.id), 'id,title,sort_order,chapter_id')
    : []
  const words = lessons.length
    ? await fetchAllIn('vocab_words', 'lesson_id', lessons.map((l: any) => l.id), 'id,term,lesson_id,difficulty')
    : []
  if (words.length === 0) return NextResponse.json(empty)

  const wordIds = words.map((w: any) => w.id)
  let progress = await fetchAllIn('vocab_progress', 'word_id', wordIds, 'student_id,word_id,box,last_result')

  // Scope filter — this is what stops a class view from leaking other classes'
  // students, and a course view from leaking another course's words.
  const wordIdSet = new Set(wordIds)
  progress = progress.filter((p: any) => wordIdSet.has(p.word_id))
  if (scopeStudents) {
    const allow = new Set(scopeStudents)
    progress = progress.filter((p: any) => allow.has(p.student_id))
  }

  // Everyone who has touched this course's vocabulary (plus the class roster, if
  // we have one) — students with zero progress still deserve a row.
  const seenStudents = [...new Set(progress.map((p: any) => p.student_id))]
  const studentIds = scopeStudents
    ? [...new Set([...scopeStudents, ...seenStudents])]
    : seenStudents
  const profiles = await fetchAllIn('profiles', 'id', studentIds, 'id,display_name')
  const nameById = new Map(profiles.map((p: any) => [p.id, p.display_name]))
  const lessonTitle = new Map(lessons.map((l: any) => [l.id, l.title]))
  const wordsByLesson = new Map<string, string[]>()
  for (const w of words) {
    if (!wordsByLesson.has(w.lesson_id)) wordsByLesson.set(w.lesson_id, [])
    wordsByLesson.get(w.lesson_id)!.push(w.id)
  }

  // Per word
  const wAgg = new Map<string, { studied: number; mastered: number; known: number; fuzzy: number; unknown: number }>()
  for (const w of words) wAgg.set(w.id, { studied: 0, mastered: 0, known: 0, fuzzy: 0, unknown: 0 })
  for (const p of progress) {
    const a = wAgg.get(p.word_id)
    if (!a) continue
    a.studied++
    if ((p.box ?? 0) >= MASTERED_BOX) a.mastered++
    if (p.last_result === 'known') a.known++
    else if (p.last_result === 'fuzzy') a.fuzzy++
    else if (p.last_result === 'unknown') a.unknown++
  }
  const wordsOut = words.map((w: any) => {
    const a = wAgg.get(w.id)!
    return {
      id: w.id,
      term: w.term,
      lessonId: w.lesson_id,
      lessonTitle: lessonTitle.get(w.lesson_id) || '',
      studied: a.studied,
      known: a.known,
      fuzzy: a.fuzzy,
      unknown: a.unknown,
      masteryRate: a.studied > 0 ? a.mastered / a.studied : null,
    }
  }).filter((w: any) => w.studied > 0)

  // Per lesson
  const progressByLesson = new Map<string, any[]>()
  for (const p of progress) {
    const lid = words.find((w: any) => w.id === p.word_id)?.lesson_id
    if (!lid) continue
    if (!progressByLesson.has(lid)) progressByLesson.set(lid, [])
    progressByLesson.get(lid)!.push(p)
  }
  const lessonsOut = lessons.map((l: any) => {
    const wordCount = (wordsByLesson.get(l.id) || []).length
    const rows = progressByLesson.get(l.id) || []
    const mastered = rows.filter((p: any) => (p.box ?? 0) >= MASTERED_BOX).length
    return {
      id: l.id,
      title: l.title,
      wordCount,
      studiedStudents: new Set(rows.map((p: any) => p.student_id)).size,
      studied: rows.length,
      mastered,
      masteryRate: rows.length > 0 ? mastered / rows.length : null,
    }
  }).filter((l: any) => l.wordCount > 0)

  // Per student
  const sAgg = new Map<string, { studied: number; mastered: number }>()
  for (const id of studentIds) sAgg.set(id, { studied: 0, mastered: 0 })
  for (const p of progress) {
    const a = sAgg.get(p.student_id)
    if (!a) continue
    a.studied++
    if ((p.box ?? 0) >= MASTERED_BOX) a.mastered++
  }
  const studentsOut = studentIds.map((id: string) => {
    const a = sAgg.get(id)!
    return {
      id,
      name: nameById.get(id) || '未命名',
      studied: a.studied,
      mastered: a.mastered,
      masteryRate: a.studied > 0 ? a.mastered / a.studied : null,
    }
  }).sort((a: any, b: any) => b.mastered - a.mastered || b.studied - a.studied)

  return NextResponse.json({
    scope, scopeName,
    lessons: lessonsOut,
    words: wordsOut,
    students: studentsOut,
    empty: false,
  })
}
