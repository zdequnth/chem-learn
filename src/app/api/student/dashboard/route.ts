import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  // Ensure profile exists
  await supabaseAdmin('profiles', {
    method: 'POST',
    body: { id: user.id, role: (user.user_metadata as any)?.role || 'student', display_name: (user.user_metadata as any)?.display_name || user.email || '用户' },
  }).catch(() => {})

  // Get student's classes
  const { data: memberships } = await supabaseAdmin('class_members', {
    query: `?student_id=eq.${user.id}&select=class_id`,
  })
  const classIds = (memberships || []).map((m: any) => m.class_id)

  const { data: myProgress } = await supabaseAdmin('student_progress', {
    query: `?student_id=eq.${user.id}&select=lesson_id,status`,
  })

  // Build per-class progress
  let myClasses: any[] = []
  if (classIds.length > 0) {
    const { data: classes } = await supabaseAdmin('classes', {
      query: `?id=in.(${classIds.join(',')})&select=*`,
    })

    for (const cls of (classes || [])) {
      let passed = 0; let total = 0
      if (cls.course_id) {
        // Get chapters and lessons for this course
        const { data: chs } = await supabaseAdmin('chapters', {
          query: `?course_id=eq.${cls.course_id}&select=id`,
        })
        const chIds = (chs || []).map((c: any) => c.id)
        if (chIds.length > 0) {
          const { data: lns } = await supabaseAdmin('lessons', {
            query: `?chapter_id=in.(${chIds.join(',')})&select=id`,
          })
          total = (lns || []).length
          passed = (lns || []).filter((l: any) =>
            (myProgress || []).some((p: any) => p.lesson_id === l.id && p.status === 'passed')
          ).length
        }
      }
      myClasses.push({ ...cls, passed, total, percent: total > 0 ? Math.round((passed / total) * 100) : 0 })
    }
  }

  return NextResponse.json({ classes: myClasses })
}
