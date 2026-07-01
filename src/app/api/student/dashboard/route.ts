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

  let myClasses: any[] = []
  if (classIds.length > 0) {
    const { data: classes } = await supabaseAdmin('classes', {
      query: `?id=in.(${classIds.join(',')})&select=*`,
    })
    myClasses = classes || []
  }

  // Get overall progress
  const { data: progress } = await supabaseAdmin('student_progress', {
    query: `?student_id=eq.${user.id}&select=status`,
  })
  const passedCount = (progress || []).filter((p: any) => p.status === 'passed').length
  const totalCount = (progress || []).length
  const percent = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0

  return NextResponse.json({
    classes: myClasses,
    progress: { passed: passedCount, total: totalCount, percent },
  })
}
