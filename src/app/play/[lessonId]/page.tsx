'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { KatexHtml } from '@/components/KatexSpan'
import type { Lesson, Chapter, Course, KnowledgePoint, VideoLink, StudentProgress, GateTestSession } from '@/lib/types'
import { ArrowLeft, BookOpen, Video, Swords, Clock, Lock, Loader2 } from 'lucide-react'
import { useLang, t } from '@/lib/i18n'

export default function LessonHubPage() {
  const { lessonId } = useParams<{ lessonId: string }>()
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()
  const supabase = createClient()
  const { lang } = useLang()

  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [chapter, setChapter] = useState<Chapter | null>(null)
  const [course, setCourse] = useState<Course | null>(null)
  const [knowledgePoints, setKnowledgePoints] = useState<KnowledgePoint[]>([])
  const [videoLinks, setVideoLinks] = useState<Record<string, VideoLink[]>>({})
  const [progress, setProgress] = useState<StudentProgress | null>(null)
  const [lockInfo, setLockInfo] = useState<{ lockedUntil: string | null; failCount: number }>({ lockedUntil: null, failCount: 0 })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) { router.push('/login') }
  }, [user, authLoading, router])

  useEffect(() => {
    if (!user || !profile) return

    const fetchData = async () => {
      const res = await fetch(`/api/student/lesson-data?lessonId=${lessonId}`)
      const json = await res.json()
      if (!json.lesson) { setLoading(false); return }
      setLesson(json.lesson)
      setChapter(json.chapter)
      setCourse(json.course)
      setProgress(json.progress)
      setKnowledgePoints(json.knowledgePoints || [])

      // Video links
      const map: Record<string, VideoLink[]> = {}
      ;(json.videoLinks || []).forEach((vl: VideoLink) => {
        if (!map[vl.knowledge_point_id]) map[vl.knowledge_point_id] = []
        map[vl.knowledge_point_id].push(vl)
      })
      setVideoLinks(map)

      // Lock status
      if (json.lockedUntil) {
        const lockTime = new Date(json.lockedUntil)
        if (lockTime > new Date()) {
          setLockInfo({ lockedUntil: json.lockedUntil, failCount: 1 })
        }
      }

      setLoading(false)
    }

    fetchData()
  }, [user, profile, lessonId, supabase])

  const handleStartGateTest = () => {
    router.push(`/play/${lessonId}/gate-test`)
  }

  const isGateLocked = lockInfo.lockedUntil && new Date(lockInfo.lockedUntil) > new Date()
  const isLessonUnlocked = progress?.status === 'unlocked' || progress?.status === 'in_progress' || progress?.status === 'passed'
  const isPassed = progress?.status === 'passed'

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-4xl mx-auto px-4 pt-24 pb-20">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : !lesson ? (
          <div className="text-center py-20"><p className="text-muted-foreground">{lang === 'zh' ? '课时不存在' : 'Lesson not found'}</p></div>
        ) : (
          <>
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
              <Link href="/dashboard" className="hover:text-foreground">课程</Link>
              <span>/</span>
              {course && <Link href={`/courses/${course.id}`} className="hover:text-foreground">{course.name}</Link>}
              {chapter && <><span>/</span><span>{chapter.title}</span></>}
            </div>

            {/* Header */}
            <div className="bg-card rounded-2xl border p-6 mb-6">
              <h1 className="text-2xl font-bold mb-2">{lesson.title}</h1>
              {lesson.description && <p className="text-muted-foreground">{lesson.description}</p>}
              {progress?.status === 'passed' && (
                <div className="mt-3 flex items-center gap-2 text-yellow-500">
                  {'★'.repeat(progress.stars_earned || 0)}{'☆'.repeat(3 - (progress.stars_earned || 0))}
                  <span className="text-sm text-muted-foreground">已通关</span>
                </div>
              )}
            </div>

            {/* Knowledge Points */}
            {knowledgePoints.length > 0 && (
              <div className="bg-card rounded-2xl border p-6 mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
                  <BookOpen className="w-5 h-5 text-blue-500" /> 知识点清单
                </h2>
                <div className="space-y-3">
                  {knowledgePoints.map(kp => (
                    <div key={kp.id} className="border rounded-xl p-4">
                      <h3 className="font-medium mb-1">{kp.title}</h3>
                      {kp.description && <div className="text-sm text-muted-foreground"><KatexHtml text={kp.description} /></div>}
                      {videoLinks[kp.id] && videoLinks[kp.id].length > 0 && (
                        <div className="mt-3 border rounded-lg p-3 bg-blue-50 border-blue-200">
                          <div className="text-sm font-medium text-blue-800 mb-1">🎬 视频讲解</div>
                          {videoLinks[kp.id].map(vl => (
                            <a key={vl.id} href={vl.url} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700">
                              <Video className="w-3.5 h-3.5" />
                              {vl.title || '观看视频'}
                              {vl.platform && vl.platform !== 'other' && (
                                <span className="text-xs px-1.5 py-0.5 bg-blue-100 rounded">{vl.platform}</span>
                              )}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            {/* Gate Test */}
            {isPassed ? (
              <div className="bg-card border border-emerald-200 rounded-2xl p-6 text-left">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-xl">
                    🏅
                  </div>
                  <div>
                    <h3 className="font-semibold">{t('gateTest', lang)}</h3>
                    <div className="flex items-center gap-1 text-yellow-500 mt-1">
                      {'★'.repeat(progress?.stars_earned || 0)}{'☆'.repeat(3 - (progress?.stars_earned || 0))}
                    </div>
                  </div>
                </div>
                <p className="text-sm text-emerald-600 font-medium mb-3">{lang === 'zh' ? '已通过 ✓' : 'Passed ✓'}</p>
                <button onClick={handleStartGateTest}
                  className="px-5 py-2 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 transition-colors">
                  {t('retestBtn', lang)}
                </button>
              </div>
            ) : !isLessonUnlocked ? (
              <div className="bg-card border rounded-2xl p-6 text-left opacity-60">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <Lock className="w-5 h-5 text-gray-400" />
                  </div>
                  <h3 className="font-semibold text-muted-foreground">关卡测试</h3>
                </div>
                <p className="text-sm text-muted-foreground">{lang === 'zh' ? '请先完成上一个课时的关卡测试' : 'Complete the previous lesson first'}</p>
              </div>
            ) : isGateLocked ? (
              <div className="bg-card border border-red-200 rounded-2xl p-6 text-left">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center">
                    <Clock className="w-5 h-5 text-red-500" />
                  </div>
                  <h3 className="font-semibold">{t('gateTest', lang)}</h3>
                </div>
                <p className="text-sm text-red-600">
                  {lang === 'zh' ? '已被锁定 · ' : 'Locked · '}{Math.ceil((new Date(lockInfo.lockedUntil!).getTime() - Date.now()) / 60000)}{lang === 'zh' ? ' 分钟后解锁' : ' min remaining'}
                </p>
              </div>
            ) : (
              <button onClick={handleStartGateTest}
                className="bg-card border rounded-2xl p-6 text-left hover:shadow-md hover:border-emerald-300 transition-all group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center">
                    <Swords className="w-5 h-5 text-emerald-500" />
                  </div>
                  <h3 className="font-semibold">{t('gateTest', lang)}</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t('passRules', lang)}
                </p>
              </button>
            )}
          </>
        )}
      </main>
    </div>
  )
}
