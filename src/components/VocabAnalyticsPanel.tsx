'use client'

import { useEffect, useState } from 'react'
import { useLang } from '@/lib/i18n'
import { Loader2, ChevronDown, ChevronRight } from 'lucide-react'

type LessonStat = { id: string; title: string; wordCount: number; studiedStudents: number; studied: number; mastered: number; masteryRate: number | null }
type WordStat = { id: string; term: string; lessonId: string; lessonTitle: string; studied: number; known: number; fuzzy: number; unknown: number; masteryRate: number | null }

function rateClass(rate: number | null) {
  if (rate === null) return 'text-muted-foreground'
  if (rate >= 0.8) return 'text-emerald-600'
  if (rate >= 0.5) return 'text-amber-600'
  return 'text-red-600'
}
const pct = (r: number | null) => (r === null ? '—' : Math.round(r * 100) + '%')

export default function VocabAnalyticsPanel({ scope, courseId, classId }: {
  scope: 'course' | 'class'
  courseId?: string
  classId?: string
}) {
  const { lang } = useLang()
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<any>(null)
  const [openLessons, setOpenLessons] = useState(false)
  const [showAllWords, setShowAllWords] = useState(false)

  useEffect(() => {
    const id = scope === 'class' ? classId : courseId
    if (!id) { setData(null); return }
    setLoading(true)
    const q = scope === 'class' ? `scope=class&classId=${classId}` : `scope=course&courseId=${courseId}`
    fetch(`/api/vocab/analytics?${q}`)
      .then(r => r.json())
      .then(json => setData(json))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [scope, courseId, classId])

  const words: WordStat[] = data?.words || []
  const lessons: LessonStat[] = data?.lessons || []
  const weakWords = [...words].sort((a, b) => (a.masteryRate ?? 2) - (b.masteryRate ?? 2) || b.unknown - a.unknown)
  const shownWords = showAllWords ? weakWords : weakWords.slice(0, 12)
  const totalStudied = words.reduce((s, w) => s + w.studied, 0)
  const totalMastered = words.reduce((s, w) => s + (w.masteryRate ?? 0) * w.studied, 0)

  return (
    <section className="no-print">
      <h2 className="text-lg font-semibold mb-3">
        {lang === 'zh' ? '词汇掌握情况' : 'Vocabulary Mastery'}
      </h2>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-500 animate-spin" /></div>
      ) : !data || data.empty ? (
        <div className="bg-card border rounded-2xl p-8 text-center text-muted-foreground text-sm">
          {lang === 'zh' ? '该范围内还没有词汇数据（老师还没上传词库，或学生还没开始背）。' : 'No vocabulary data in this scope yet.'}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: lang === 'zh' ? '词条数' : 'Words', value: words.length },
              { label: lang === 'zh' ? '总学习人次' : 'Study records', value: totalStudied },
              { label: lang === 'zh' ? '整体掌握率' : 'Overall mastery', value: pct(totalStudied > 0 ? totalMastered / totalStudied : null) },
              { label: lang === 'zh' ? '开始背的学生' : 'Active students', value: (data.students || []).filter((s: any) => s.studied > 0).length },
            ].map(k => (
              <div key={k.label} className="bg-card border rounded-xl p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-xl font-semibold mt-0.5">{k.value}</div>
              </div>
            ))}
          </div>

          {/* Weak words */}
          <div className="bg-card border rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-semibold">{lang === 'zh' ? '薄弱词（按掌握率升序）' : 'Weakest words'}</h3>
              {weakWords.length > 12 && (
                <button onClick={() => setShowAllWords(v => !v)} className="text-xs text-emerald-600 hover:underline">
                  {showAllWords ? (lang === 'zh' ? '收起' : 'Show less') : (lang === 'zh' ? `展开全部 ${weakWords.length}` : `Show all ${weakWords.length}`)}
                </button>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">{lang === 'zh' ? '词' : 'Word'}</th>
                    <th className="text-left px-4 py-2 font-medium">{lang === 'zh' ? '课时' : 'Lesson'}</th>
                    <th className="text-right px-4 py-2 font-medium">{lang === 'zh' ? '学习人次' : 'Records'}</th>
                    <th className="text-right px-4 py-2 font-medium">{lang === 'zh' ? '不认识' : "Don't know"}</th>
                    <th className="text-right px-4 py-2 font-medium">{lang === 'zh' ? '掌握率' : 'Mastery'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {shownWords.map(w => (
                    <tr key={w.id}>
                      <td className="px-4 py-2 font-medium">{w.term}</td>
                      <td className="px-4 py-2 text-muted-foreground truncate max-w-[200px]">{w.lessonTitle}</td>
                      <td className="px-4 py-2 text-right">{w.studied}</td>
                      <td className="px-4 py-2 text-right">{w.unknown}</td>
                      <td className={`px-4 py-2 text-right font-medium ${rateClass(w.masteryRate)}`}>{pct(w.masteryRate)}</td>
                    </tr>
                  ))}
                  {shownWords.length === 0 && (
                    <tr><td colSpan={5} className="px-4 py-6 text-center text-muted-foreground text-sm">
                      {lang === 'zh' ? '还没有学生开始背词。' : 'No one has studied yet.'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per lesson */}
          <div className="bg-card border rounded-2xl overflow-hidden">
            <button onClick={() => setOpenLessons(v => !v)}
              className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent transition-colors">
              <h3 className="text-sm font-semibold">{lang === 'zh' ? '按课时（点开查看）' : 'By lesson'}</h3>
              {openLessons ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {openLessons && (
              <div className="overflow-x-auto border-t">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">{lang === 'zh' ? '课时' : 'Lesson'}</th>
                      <th className="text-right px-4 py-2 font-medium">{lang === 'zh' ? '词数' : 'Words'}</th>
                      <th className="text-right px-4 py-2 font-medium">{lang === 'zh' ? '学习人数' : 'Students'}</th>
                      <th className="text-right px-4 py-2 font-medium">{lang === 'zh' ? '掌握率' : 'Mastery'}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {lessons.map(l => (
                      <tr key={l.id}>
                        <td className="px-4 py-2">{l.title}</td>
                        <td className="px-4 py-2 text-right">{l.wordCount}</td>
                        <td className="px-4 py-2 text-right">{l.studiedStudents}</td>
                        <td className={`px-4 py-2 text-right font-medium ${rateClass(l.masteryRate)}`}>{pct(l.masteryRate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
