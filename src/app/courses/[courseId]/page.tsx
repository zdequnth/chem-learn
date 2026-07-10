'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import type { Course, Chapter, Lesson, StudentProgress } from '@/lib/types'
import { ArrowLeft, Lock, CheckCircle, Play, Loader2 } from 'lucide-react'

interface LessonWithProgress extends Lesson {
  progress: StudentProgress | null
}

interface ChapterWithData extends Chapter {
  lessons: LessonWithProgress[]
}

export default function CoursePage() {
  const { courseId } = useParams<{ courseId: string }>()
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [course, setCourse] = useState<Course | null>(null)
  const [chapters, setChapters] = useState<ChapterWithData[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) { router.push('/login') }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user || !profile) return

    const fetchData = async () => {
      const res = await fetch(`/api/student/course-data?courseId=${courseId}`)
      const json = await res.json()
      if (!json.course) { setLoading(false); return }
      setCourse(json.course as Course)

      const chaptersWithLessons: ChapterWithData[] = (json.chapters || []).map((ch: any) => ({
        ...ch,
        lessons: (json.lessons || []).filter((l: any) => l.chapter_id === ch.id).sort((a: any, b: any) => a.sort_order - b.sort_order)
          .map((l: any) => ({ ...l, progress: ((json.progress || []) as any[]).find((p: any) => p.lesson_id === l.id) || null })),
      }))

      setChapters(chaptersWithLessons)
      setLoading(false)
    }

    fetchData()
  }, [user, profile, courseId, supabase])

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        <Link href="/dashboard" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> 返回课程列表
        </Link>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : !course ? (
          <div className="text-center py-20"><p className="text-muted-foreground">课程不存在</p></div>
        ) : (
          <>
            <div className="bg-card rounded-2xl border p-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-2xl flex items-center justify-center text-4xl">
                  {course.icon || '🧪'}
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{course.name}</h1>
                  {course.grade_level && <span className="text-sm px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{course.grade_level}</span>}
                  {course.description && <p className="text-muted-foreground mt-1">{course.description}</p>}
                </div>
              </div>
            </div>

            {/* Chapter Map */}
            <div className="space-y-8">
              {chapters.map((chapter, cIdx) => (
                <div key={chapter.id}>
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center text-white text-sm font-bold">
                      {cIdx + 1}
                    </div>
                    <h2 className="text-xl font-semibold">{chapter.title}</h2>
                  </div>

                  <div className="ml-4 space-y-3 relative">
                    <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-gradient-to-b from-purple-300 to-emerald-300" />

                    {chapter.lessons.map((lesson, lIdx) => {
                      const isPassed = lesson.progress?.status === 'passed'
                      const isUnlocked = lesson.progress?.status === 'unlocked' || lesson.progress?.status === 'in_progress' || lesson.progress?.status === 'passed'
                      const isLocked = !isPassed && !isUnlocked && lesson.progress?.status !== 'passed'

                      return (
                        <div key={lesson.id} className="relative flex items-center gap-4 pl-10">
                          <div className={`absolute left-5 -translate-x-1/2 w-5 h-5 rounded-full border-2 ${
                            isPassed ? 'bg-emerald-500 border-emerald-500' :
                            isUnlocked ? 'bg-white border-blue-500' :
                            'bg-white border-gray-300'
                          } flex items-center justify-center`}>
                            {isPassed && <CheckCircle className="w-3 h-3 text-white" />}
                          </div>

                          {isUnlocked ? (
                            <Link href={`/play/${lesson.id}`}
                              className={`flex-1 bg-card border rounded-xl p-4 hover:shadow-md transition-all group ${
                                (lesson as any).is_key ? 'border-red-300 bg-red-50/30 hover:border-red-400' : 'hover:border-emerald-300'
                              }`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className={`font-medium transition-colors ${
                                    (lesson as any).is_key ? 'group-hover:text-red-600' : 'group-hover:text-emerald-600'
                                  }`}>
                                    {cIdx + 1}.{lIdx + 1} {lesson.title}
                                    {(lesson as any).is_key && <span className="ml-1">❤️</span>}
                                  </h3>
                                </div>
                                <Play className={`w-5 h-5 transition-transform group-hover:translate-x-1 ${
                                  (lesson as any).is_key ? 'text-red-500' : 'text-emerald-500'
                                }`} />
                              </div>
                            </Link>
                          ) : (
                            <div className={`flex-1 bg-card border rounded-xl p-4 opacity-50 ${(lesson as any).is_key ? 'border-red-200' : ''}`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="font-medium text-muted-foreground">
                                    {cIdx + 1}.{lIdx + 1} {lesson.title}
                                    {(lesson as any).is_key && <span className="ml-1">❤️</span>}
                                  </h3>
                                </div>
                                <Lock className="w-4 h-4 text-muted-foreground" />
                              </div>
                            </div>
                          )}

                          {isPassed && (
                            <div className="shrink-0 flex items-center gap-2">
                              <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">🏅 已通过</span>
                              <span className="text-yellow-500 text-sm">
                                {'★'.repeat(lesson.progress?.stars_earned || 0)}
                                {'☆'.repeat(3 - (lesson.progress?.stars_earned || 0))}
                              </span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
