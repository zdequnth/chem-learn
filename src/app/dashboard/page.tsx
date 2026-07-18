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
  const [myClasses, setMyClasses] = useState<any[]>([])
  const [favorites, setFavorites] = useState<string[]>([])
  const [favorites, setFavorites] = useState<string[]>([])

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

  // Fetch student's classes, progress, and favorites
  useEffect(() => {
    if (!user || isTeacher) return
    fetch('/api/student/dashboard').then(r => r.json()).then(json => {
      if (!json.error) setMyClasses(json.classes || [])
    }).catch(() => {})
    fetchFavs()
  }, [user, isTeacher])

  const fetchFavs = () => {
    fetch('/api/student/favorites').then(r => r.json()).then(json => {
      if (!json.error) setFavorites(json.favorites || [])
    }).catch(() => {})
  }

  // Re-fetch favorites on page focus (after navigating back)
  useEffect(() => {
    if (!user || isTeacher) return
    const onFocus = () => fetchFavs()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user, isTeacher])

  const toggleFavorite = async (courseId: string) => {
    const isFav = favorites.includes(courseId)
    if (isFav) {
      setFavorites(favorites.filter(id => id !== courseId))
      await fetch(`/api/student/favorites?courseId=${courseId}`, { method: 'DELETE' })
    } else {
      setFavorites([...favorites, courseId])
      await fetch('/api/student/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId }),
      })
    }
  }

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

          {/* Join class + progress for students */}
          {!isTeacher && (
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-2">
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

              {/* My classes with progress */}
              {myClasses.length > 0 && (
                <div className="space-y-2">
                  {myClasses.map((c: any) => (
                    <div key={c.id} className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-blue-700 shrink-0">📚 {c.name}</span>
                        {c.courseName && (
                          <Link href={`/courses/${c.course_id}`}
                            className="text-xs text-emerald-600 hover:underline shrink-0">
                            {c.courseName}
                          </Link>
                        )}
                        {c.total > 0 && (
                          <>
                            <div className="flex-1 bg-blue-200 rounded-full h-2.5">
                              <div className="bg-blue-500 h-2.5 rounded-full transition-all" style={{ width: `${c.percent}%` }} />
                            </div>
                            <span className="text-xs text-blue-600 w-10 text-right shrink-0">{c.percent}%</span>
                          </>
                        )}
                      </div>
                      {c.message && (
                        <p className="text-xs text-blue-600 mt-1 whitespace-pre-wrap">{c.message}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
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
          <>
          {/* Favorited courses */}
          {!isTeacher && [...courses].filter((c: any) => favorites.includes(c.id)).length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold mb-3">⭐ 我的收藏</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...courses].filter((c: any) => favorites.includes(c.id)).map((course: any) => (
                  <Link key={course.id} href={`/courses/${course.id}`}
                    className="bg-card rounded-2xl p-4 border shadow-sm hover:shadow-md hover:border-amber-300 transition-all group">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{course.icon || '🧪'}</div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm group-hover:text-amber-600 truncate">{course.name}</h4>
                        {course.grade_level && <span className="text-xs text-muted-foreground">{course.grade_level}</span>}
                      </div>
                      <button onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(course.id) }}
                        className="text-amber-500 text-lg shrink-0">⭐</button>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Subject grid for students */}
          {!isTeacher && (
            <div>
              <h3 className="text-lg font-semibold mb-3">选择学科</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {key:'Chinese',name:'Chinese',icon:'📖',bg:'bg-red-50 border-red-200'},
                  {key:'Math',name:'Math',icon:'📐',bg:'bg-blue-50 border-blue-200'},
                  {key:'English',name:'English',icon:'🌍',bg:'bg-indigo-50 border-indigo-200'},
                  {key:'Second foreign Language',name:'2nd Language',icon:'🗣️',bg:'bg-teal-50 border-teal-200'},
                  {key:'Physics',name:'Physics',icon:'⚛️',bg:'bg-amber-50 border-amber-200'},
                  {key:'Chemistry',name:'Chemistry',icon:'🧪',bg:'bg-emerald-50 border-emerald-200'},
                  {key:'Biology',name:'Biology',icon:'🧬',bg:'bg-green-50 border-green-200'},
                  {key:'Humanities',name:'Humanities',icon:'📜',bg:'bg-violet-50 border-violet-200'},
                ].map(s => (
                  <Link key={s.key} href={`/subjects/${encodeURIComponent(s.key)}`}
                    className={`${s.bg} border rounded-xl p-4 text-center hover:shadow-md hover:-translate-y-0.5 transition-all`}>
                    <div className="text-3xl mb-1">{s.icon}</div>
                    <span className="text-sm font-medium">{s.name}</span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Teacher course grid */}
          {isTeacher && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...courses].map((course: any) => (
                <Link key={course.id} href={`/teacher/courses/${course.id}`}
                  className="bg-card rounded-2xl p-6 border shadow-sm hover:shadow-md hover:border-emerald-200 transition-all group">
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-xl flex items-center justify-center text-2xl">{course.icon || '🧪'}</div>
                    <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                  </div>
                  <h3 className="text-lg font-semibold mb-1">{course.name}</h3>
                  {course.grade_level && <span className="inline-block px-2 py-0.5 bg-blue-50 text-blue-600 text-xs rounded-full font-medium mb-2">{course.grade_level}</span>}
                  {course.description && <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{course.description}</p>}
                  <div className="text-sm text-muted-foreground mt-2">{course.is_published ? '🟢 已发布' : '⚪ 未发布'}</div>
                </Link>
              ))}
            </div>
          )}
          </>
        )}
      </main>
    </div>
  )
}
