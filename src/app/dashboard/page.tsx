'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course } from '@/lib/types'
import { ArrowRight, Loader2 } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinMsg, setJoinMsg] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)

  const role = profile?.role || (user?.user_metadata as any)?.role || 'student'
  const isTeacher = role === 'teacher' || role === 'admin'

  const handleJoinClass = async () => {
    if (!joinCode.trim()) return
    setJoinBusy(true)
    setJoinMsg('')
    const res = await fetch('/api/classes', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: joinCode.trim() }),
    })
    const json = await res.json()
    if (json.error) { setJoinMsg('❌ ' + json.error) }
    else { setJoinMsg('✅ 加入成功！'); setJoinCode('') }
    setJoinBusy(false)
  }

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user) return

    setLoading(true)
    setFetchError('')
    let cancelled = false

    const timeout = setTimeout(() => {
      if (!cancelled) {
        setFetchError('加载超时，请刷新页面重试')
        setLoading(false)
        cancelled = true
      }
    }, 12000)

    // Use server API instead of direct Supabase query (avoids client-side auth race condition on refresh)
    fetch('/api/student/course-data')
      .then(res => res.json())
      .then(json => {
        if (!cancelled) {
          if (json.error) { setFetchError(json.error); setCourses([]) }
          else if (json.courses) { setCourses(json.courses) }
          else { setCourses([]) }
        }
      })
      .catch((e: any) => {
        if (!cancelled) { setFetchError(e.message || '加载失败'); setCourses([]) }
      })
      .finally(() => {
        clearTimeout(timeout)
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true; clearTimeout(timeout) }
  }, [user, isTeacher])

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">加载中...</p>
        </div>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 pt-24 pb-20">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">
            {isTeacher ? '教师工作台' : `你好，${profile?.display_name || user.email || '同学'}`}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isTeacher ? '管理课程、题库和班级' : '继续你的化学闯关之旅'}
          </p>

          {/* Join class for students */}
          {!isTeacher && (
            <div className="mt-4 flex items-center gap-2">
              <input value={joinCode} onChange={e => setJoinCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleJoinClass() }}
                placeholder="输入班级邀请码"
                className="px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 w-48" />
              <button onClick={handleJoinClass} disabled={joinBusy}
                className="px-4 py-1.5 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
                {joinBusy ? '...' : '加入班级'}
              </button>
              {joinMsg && <span className="text-sm">{joinMsg}</span>}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
          </div>
        ) : fetchError ? (
          <div className="text-center py-20">
            <div className="text-4xl mb-4">⚠️</div>
            <h2 className="text-xl font-semibold mb-2">加载失败</h2>
            <p className="text-muted-foreground mb-4 text-sm">{fetchError}</p>
            <button onClick={() => window.location.reload()} className="px-6 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600">
              重新加载
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">📭</div>
            <h2 className="text-xl font-semibold mb-2">
              {isTeacher ? '还没有课程' : '暂无可用课程'}
            </h2>
            <p className="text-muted-foreground mb-6">
              {isTeacher ? '创建第一门课程吧' : '请联系老师添加课程'}
            </p>
            {isTeacher && (
              <Link href="/teacher/courses" className="px-6 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-medium hover:from-emerald-600 hover:to-emerald-700 transition-colors inline-block">
                创建课程
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {courses.map((course: any) => (
              <Link
                key={course.id}
                href={isTeacher ? `/teacher/courses/${course.id}` : `/courses/${course.id}`}
                className="bg-card rounded-2xl p-6 border shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-xl flex items-center justify-center text-2xl">
                    {course.icon || '🧪'}
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="text-lg font-semibold mb-1">{course.name}</h3>
                {course.grade_level && (
                  <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium mb-2">
                    {course.grade_level}
                  </span>
                )}
                {course.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{course.description}</p>
                )}
                <div className="text-sm text-muted-foreground mt-2">
                  {course.is_published ? '🟢 已发布' : '⚪ 未发布'}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
