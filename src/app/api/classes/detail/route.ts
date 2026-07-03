import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const classId = searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: '缺少classId' }, { status: 400 })

  const role = (user.user_metadata as any)?.role

  // Get class info
  const { data: classes } = await supabaseAdmin('classes', {
    query: `?id=eq.${classId}&select=*`,
  })
  const cls = classes?.[0]
  if (!cls) return NextResponse.json({ error: '班级不存在' }, { status: 404 })

  // Permission check
  const isOwner = cls.teacher_id === user.id
  if (!isOwner && role !== 'admin') {
    // Check if student is a member
    const { data: member } = await supabaseAdmin('class_members', {
      query: `?class_id=eq.${classId}&student_id=eq.${user.id}&select=id`,
    })
    if (!member || member.length === 0) {
      return NextResponse.json({ error: '无权访问' }, { status: 403 })
    }
  }

  // Get members with profiles
  const { data: members } = await supabaseAdmin('class_members', {
    query: `?class_id=eq.${classId}&select=student_id`,
  })
  const studentIds = (members || []).map((m: any) => m.student_id)

  let students: any[] = []
  if (studentIds.length > 0) {
    const { data: profiles } = await supabaseAdmin('profiles', {
      query: `?id=in.(${studentIds.join(',')})&select=id,display_name`,
    })

    // Get lesson progress for these students
    const { data: progress } = await supabaseAdmin('student_progress', {
      query: `?student_id=in.(${studentIds.join(',')})&select=*`,
    })

    // Filter by class's course — only count lessons from the bound course
    const courseId = cls.course_id
    let allLessons: any[] = []
    let allChapters: any[] = []
    if (courseId) {
      const { data: chs } = await supabaseAdmin('chapters', {
        query: `?course_id=eq.${courseId}&order=sort_order&select=id,title,course_id`,
      })
      allChapters = chs || []
      const chapterIds = allChapters.map((c: any) => c.id)
      if (chapterIds.length > 0) {
        const { data: lns } = await supabaseAdmin('lessons', {
          query: `?chapter_id=in.(${chapterIds.join(',')})&order=sort_order&select=id,title,chapter_id`,
        })
        allLessons = lns || []
      }
    } else {
      // No course bound — show nothing
      allLessons = []
      allChapters = []
    }

    students = (profiles || []).map((p: any) => {
      const studentProgress = (progress || []).filter((sp: any) => sp.student_id === p.id)
      const passedCount = studentProgress.filter((sp: any) => sp.status === 'passed').length
      const totalLessons = (allLessons || []).length
      const percent = totalLessons > 0 ? Math.round((passedCount / totalLessons) * 100) : 0

      // Build per-chapter progress
      const chapterProgress = (allChapters || []).map((ch: any) => {
        const chLessons = (allLessons || []).filter((l: any) => l.chapter_id === ch.id)
        const chPassed = chLessons.filter((l: any) =>
          studentProgress.some((sp: any) => sp.lesson_id === l.id && sp.status === 'passed')
        ).length
        return {
          chapterId: ch.id,
          chapterTitle: ch.title,
          total: chLessons.length,
          passed: chPassed,
          percent: chLessons.length > 0 ? Math.round((chPassed / chLessons.length) * 100) : 0,
        }
      })

      return {
        id: p.id,
        display_name: p.display_name,
        totalPassed: passedCount,
        totalLessons,
        percent,
        chapterProgress,
      }
    })
  }

  return NextResponse.json({ class: cls, students, isOwner })
}
