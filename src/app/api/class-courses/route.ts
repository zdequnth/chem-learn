import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

// Course bindings of a class. A class holds at most one course of each kind —
// one gate course (which drives its progress card), plus optionally one
// vocabulary and one mock course.
//
//   GET    ?classId=            → { bindings: [{ id, kind, courseId, courseName }] }
//   POST   { classId, courseId } → add or replace a binding
//   DELETE ?classId=&kind=       → remove a binding (vocab / mock only)
//
// The gate binding cannot be changed: student progress is stored per LESSON of
// the gate course, so swapping it would misattribute or orphan everyone's work.
// The other two carry no per-lesson progress (vocabulary is per word, mock
// results are per paper), so a mis-binding there is fixable.

async function loadClass(userId: string, classId: string) {
  const { data } = await supabaseAdmin('classes', {
    query: `?id=eq.${classId}&select=id,name,teacher_id`,
  })
  const cls = data?.[0]
  if (!cls) return { error: '班级不存在', status: 404 }
  if (cls.teacher_id !== userId) return { error: '只有班级创建者可以管理课程绑定', status: 403 }
  return { cls }
}

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const classId = new URL(request.url).searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: '缺少classId' }, { status: 400 })

  const { data: rows } = await supabaseAdmin('class_courses', {
    query: `?class_id=eq.${classId}&select=id,kind,course_id`,
  })
  const list = (rows || []) as any[]
  const { data: courses } = list.length
    ? await supabaseAdmin('courses', { query: `?id=in.(${list.map((r) => r.course_id).join(',')})&select=id,name` })
    : { data: [] as any[] }
  const nameById = new Map((courses || []).map((c: any) => [c.id, c.name]))

  return NextResponse.json({
    bindings: list.map((r) => ({ id: r.id, kind: r.kind, courseId: r.course_id, courseName: nameById.get(r.course_id) || '（已删除）' })),
  })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { classId, courseId } = await request.json()
  if (!classId || !courseId) return NextResponse.json({ error: '参数不全' }, { status: 400 })

  const { error, status } = await loadClass(user.id, classId)
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  // The kind comes from the course itself, so the caller cannot mislabel it.
  const { data: courseRows } = await supabaseAdmin('courses', {
    query: `?id=eq.${courseId}&select=id,name,kind`,
  })
  const course = courseRows?.[0]
  if (!course) return NextResponse.json({ error: '课程不存在' }, { status: 404 })
  const kind = course.kind || 'gate'

  const { data: existing } = await supabaseAdmin('class_courses', {
    query: `?class_id=eq.${classId}&kind=eq.${kind}&select=id,course_id`,
  })
  const current = existing?.[0]

  if (current && kind === 'gate') {
    return NextResponse.json({ error: '通关课程绑定后不能更改（学生的课时进度挂在这门课上）' }, { status: 400 })
  }

  if (current) {
    await supabaseAdmin('class_courses', { method: 'PATCH', body: { course_id: courseId }, query: `?id=eq.${current.id}` })
  } else {
    const { error: insErr } = await supabaseAdmin('class_courses', {
      method: 'POST', body: { class_id: classId, course_id: courseId, kind },
    })
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  }

  // Keep classes.course_id in step for the gate binding — the student dashboard's
  // progress card, analytics-by-class and the vocabulary scope all still read it.
  if (kind === 'gate') {
    await supabaseAdmin('classes', { method: 'PATCH', body: { course_id: courseId }, query: `?id=eq.${classId}` })
  }

  return NextResponse.json({ success: true, kind })
}

export async function DELETE(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const classId = params.get('classId')
  const kind = params.get('kind')
  if (!classId || !kind) return NextResponse.json({ error: '参数不全' }, { status: 400 })
  if (kind === 'gate') return NextResponse.json({ error: '通关课程不能解绑' }, { status: 400 })

  const { error, status } = await loadClass(user.id, classId)
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  await supabaseAdmin('class_courses', { method: 'DELETE', query: `?class_id=eq.${classId}&kind=eq.${kind}` })
  return NextResponse.json({ success: true })
}
