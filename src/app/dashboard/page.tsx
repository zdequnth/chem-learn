'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course } from '@/lib/types'
import { kindTheme } from '@/lib/course-kind'
import { Loader2 } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

export default function DashboardPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { lang } = useLang()

  const [courses, setCourses] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState('')
  const [joinCode, setJoinCode] = useState('')
  const [joinMsg, setJoinMsg] = useState('')
  const [joinBusy, setJoinBusy] = useState(false)
  const [myClasses, setMyClasses] = useState<any[]>([])
  const [vocabByCourse, setVocabByCourse] = useState<Record<string, any>>({})
  const [favorites, setFavorites] = useState<string[]>([])
  const [teacherClasses, setTeacherClasses] = useState<any[]>([])

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
    // Word progress for vocabulary courses, so their card can show 背单词 stats
    // instead of the gate-test percentage.
    fetch('/api/vocab/progress').then(r => r.json()).then(json => {
      const map: Record<string, any> = {}
      for (const c of (json.courses || [])) map[c.id] = c
      setVocabByCourse(map)
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

  // Teacher overview: their classes (for counts + quick links)
  useEffect(() => {
    if (!user || !isTeacher) return
    fetch('/api/classes').then(r => r.json()).then(json => {
      if (!json.error) setTeacherClasses(json.classes || [])
    }).catch(() => {})
  }, [user, isTeacher])

  const totalStudents = teacherClasses.reduce((a: number, c: any) => a + (c.student_count || 0), 0)

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
            {isTeacher ? t('teacherDashboard', lang) : (lang === 'zh' ? `你好，${profile?.display_name || user.email || '同学'}` : `Hi, ${profile?.display_name || user.email || ''}`)}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isTeacher ? t('manageCourses', lang) : t('studentDashboard', lang)}
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
                <>
                <h3 className="text-lg font-semibold mb-3">已加入的班级与课程</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {myClasses.map((c: any) => {
                    // One card shape for both kinds — a vocabulary class differs by
                    // colour/badge/destination, never by size. Rows: 1) class +
                    // course + status, 2) bar, 3) note / action.
                    const isVocab = c.courseKind === 'vocab'
                    const isMock = c.courseKind === 'mock'
                    const v = vocabByCourse[c.course_id] || { wordCount: 0, studied: 0, mastered: 0, due: 0 }
                    const pct = isVocab
                      ? (v.wordCount > 0 ? Math.round((v.studied / v.wordCount) * 100) : 0)
                      : c.percent
                    const t = isVocab
                      ? { box: 'bg-amber-50 border-amber-300', text: 'text-amber-800', track: 'bg-amber-200',
                          bar: 'bg-amber-500', link: 'text-amber-700', badge: 'bg-amber-200 text-amber-900',
                          btn: 'bg-amber-500 hover:bg-amber-600' }
                      : isMock
                      ? { box: 'bg-violet-50 border-violet-300', text: 'text-violet-800', track: 'bg-violet-200',
                          bar: 'bg-violet-500', link: 'text-violet-700', badge: 'bg-violet-200 text-violet-900',
                          btn: 'bg-violet-500 hover:bg-violet-600' }
                      : { box: 'bg-blue-50 border-blue-200', text: 'text-blue-700', track: 'bg-blue-200',
                          bar: 'bg-blue-500', link: 'text-emerald-600', badge: '',
                          btn: 'bg-blue-500 hover:bg-blue-600' }
                    return (
                      <div key={c.id}
                        className={`rounded-lg border px-3 py-2 min-h-[86px] flex flex-col justify-between gap-1.5 min-w-0 ${t.box}`}>
                        {/* 1 — class + course + headline number */}
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-sm font-medium truncate shrink-0 ${t.text}`}>
                            {isVocab ? '📖' : isMock ? '📝' : '📚'} {c.name}
                          </span>
                          {(isVocab || isMock) && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${t.badge}`}>
                              {isVocab ? '背单词' : '模拟考'}
                            </span>
                          )}
                          {c.courseName && (
                            <>
                              <span className={`text-xs shrink-0 opacity-40 ${t.text}`}>·</span>
                              <Link href={isVocab ? `/vocab?course=${c.course_id}` : isMock ? `/mock?course=${c.course_id}` : `/courses/${c.course_id}`}
                                className={`text-xs hover:underline truncate ${t.link}`}>
                                {c.courseName}
                              </Link>
                            </>
                          )}
                          <span className={`ml-auto shrink-0 text-xs tabular-nums ${t.text}`}>
                            {isVocab && v.due > 0 ? `待复习 ${v.due}` : ''}
                          </span>
                        </div>
                        {/* 2 — progress bar + its number */}
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`flex-1 rounded-full h-2.5 ${t.track}`}>
                            <div className={`h-2.5 rounded-full transition-all ${t.bar}`} style={{ width: `${pct}%` }} />
                          </div>
                          <span className={`shrink-0 text-xs tabular-nums ${t.text}`}>
                            {isVocab
                              ? (v.wordCount > 0 ? `已学 ${v.studied}/${v.wordCount} · 掌握 ${v.mastered}` : '—')
                              : (c.total > 0 ? `${c.percent}%` : '—')}
                          </span>
                        </div>
                        {/* 3 — teacher note and/or the vocab action */}
                        <div className="flex items-center gap-2 min-w-0">
                          {c.message && (
                            <p className={`text-xs line-clamp-1 min-w-0 ${t.text}`}>{c.message}</p>
                          )}
                          {isVocab && (
                            <Link href={`/vocab?course=${c.course_id}`}
                              className={`ml-auto shrink-0 px-2.5 py-0.5 rounded-lg text-[11px] font-medium text-white transition-colors ${t.btn}`}>
                              去背单词 →
                            </Link>
                          )}
                          {isMock && (
                            <Link href={`/mock?course=${c.course_id}`}
                              className={`ml-auto shrink-0 px-2.5 py-0.5 rounded-lg text-[11px] font-medium text-white transition-colors ${t.btn}`}>
                              去模拟考 →
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                </>
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
              <h3 className="text-lg font-semibold mb-3">
                选择学科
                <span className="ml-2 text-xs font-normal text-muted-foreground">所有已发布的课程，无论是否加入班级，均可在此学习</span>
              </h3>
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

          {/* Teacher overview */}
          {isTeacher && (
            <div className="space-y-8">
              {/* Counts */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-card rounded-2xl border p-5 text-center">
                  <div className="text-3xl font-bold text-emerald-600">{courses.length}</div>
                  <div className="text-sm text-muted-foreground mt-1">课程</div>
                </div>
                <div className="bg-card rounded-2xl border p-5 text-center">
                  <div className="text-3xl font-bold text-blue-600">{teacherClasses.length}</div>
                  <div className="text-sm text-muted-foreground mt-1">班级</div>
                </div>
                <div className="bg-card rounded-2xl border p-5 text-center">
                  <div className="text-3xl font-bold text-purple-600">{totalStudents}</div>
                  <div className="text-sm text-muted-foreground mt-1">学生（按班级合计）</div>
                </div>
              </div>

              {/* Quick links — centred, to match the count cards above */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/teacher/courses" className="bg-card rounded-2xl border p-5 hover:shadow-md hover:border-emerald-200 transition-all group flex flex-col items-center text-center">
                  <div className="text-2xl mb-2">📚</div>
                  <div className="font-semibold group-hover:text-emerald-600">课程管理</div>
                  <div className="text-xs text-muted-foreground mt-1">课程、章节、课时与题库</div>
                </Link>
                <Link href="/teacher/analytics" className="bg-card rounded-2xl border p-5 hover:shadow-md hover:border-emerald-200 transition-all group flex flex-col items-center text-center">
                  <div className="text-2xl mb-2">📊</div>
                  <div className="font-semibold group-hover:text-emerald-600">学情分析</div>
                  <div className="text-xs text-muted-foreground mt-1">薄弱知识点、高错题、尝试与用时</div>
                </Link>
                <Link href="/teacher/classes" className="bg-card rounded-2xl border p-5 hover:shadow-md hover:border-emerald-200 transition-all group flex flex-col items-center text-center">
                  <div className="text-2xl mb-2">🏫</div>
                  <div className="font-semibold group-hover:text-emerald-600">班级管理</div>
                  <div className="text-xs text-muted-foreground mt-1">学生进度、邀请码</div>
                </Link>
              </div>

              {/* Per-course entry, coloured by course kind */}
              <div>
                <h3 className="text-lg font-semibold mb-3">课程速览 · 按课程查看</h3>
                <div className="space-y-2">
                  {[...courses].map((course: any) => {
                    const theme = kindTheme(course.kind)
                    const k = course.kind ?? 'gate'
                    return (
                      <div key={course.id}
                        className={`rounded-xl border p-4 flex items-center justify-between ${k !== 'gate' ? `${theme.banner} border` : 'bg-card border-gray-200'}`}>
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl">{k !== 'gate' ? theme.emoji : (course.icon || '🧪')}</span>
                          <div className="min-w-0">
                            <div className="font-medium truncate flex items-center gap-2">
                              {course.name}
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${theme.pill}`}>
                                {theme.label.replace('课程', '')}
                              </span>
                            </div>
                            <div className={`text-xs ${k !== 'gate' ? theme.text : 'text-muted-foreground'}`}>
                              {course.grade_level ? course.grade_level + ' · ' : ''}{course.is_published ? '已发布' : '未发布'}
                            </div>
                          </div>
                        </div>
                        {/* Each kind's entry point: word bank, papers, or analytics. */}
                        {k === 'vocab' ? (
                          <Link href={`/teacher/vocab?course=${course.id}`}
                            className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium text-white transition-colors ${theme.solid}`}>
                            词库与掌握情况 →
                          </Link>
                        ) : k === 'mock' ? (
                          <Link href={`/teacher/mock?course=${course.id}`}
                            className={`shrink-0 px-3 py-1.5 text-xs rounded-lg font-medium text-white transition-colors ${theme.solid}`}>
                            试卷与成绩 →
                          </Link>
                        ) : (
                          <Link href={`/teacher/analytics?scope=course&courseId=${course.id}`}
                            className="shrink-0 px-3 py-1.5 text-xs bg-emerald-50 text-emerald-600 rounded-lg font-medium hover:bg-emerald-100 transition-colors">
                            查看学情 →
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          </>
        )}
      </main>
    </div>
  )
}
