'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useLang } from '@/lib/i18n'

// Course collaborators, shared by the gate-test course editor and the word bank.
// A vocabulary course never opens the course editor (it redirects to /teacher/vocab),
// so this had to become a component rather than live inside that page.
export default function CourseCollaborators({ courseId }: { courseId: string }) {
  const { lang } = useLang()
  const [ready, setReady] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [collaborators, setCollaborators] = useState<any[]>([])
  const [availableTeachers, setAvailableTeachers] = useState<any[]>([])
  const [showTeacherList, setShowTeacherList] = useState(false)
  const [input, setInput] = useState('')
  const [msg, setMsg] = useState('')

  const fetchCollaborators = async () => {
    const res = await fetch(`/api/courses/collaborators?courseId=${courseId}`)
    const json = await res.json()
    setCollaborators(json.collaborators || [])
  }

  useEffect(() => {
    if (!courseId) return
    setReady(false)
    fetch(`/api/courses/${courseId}`).then(r => r.json()).then(j => {
      setIsOwner(!!j.isOwner)
      setReady(true)
    }).catch(() => setReady(true))
    fetchCollaborators()
  }, [courseId])

  const loadTeachers = async () => {
    if (availableTeachers.length > 0) { setShowTeacherList(!showTeacherList); return }
    const res = await fetch(`/api/courses/collaborators?courseId=${courseId}&listTeachers=1`)
    const json = await res.json()
    setAvailableTeachers(json.teachers || [])
    setShowTeacherList(true)
  }

  const add = async (name?: string) => {
    const value = name || input.trim()
    if (!value) return
    setMsg(''); setShowTeacherList(false)
    const res = await fetch('/api/courses/collaborators', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, teacherEmail: value }),
    })
    const json = await res.json()
    if (json.error) setMsg('❌ ' + json.error)
    else { setInput(''); fetchCollaborators() }
  }

  const remove = async (teacherId: string) => {
    await fetch(`/api/courses/collaborators?courseId=${courseId}&teacherId=${teacherId}`, { method: 'DELETE' })
    fetchCollaborators()
  }

  if (!ready) {
    return <div className="bg-card rounded-2xl border p-6 flex justify-center"><Loader2 className="w-5 h-5 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="bg-card rounded-2xl border p-6">
      <h2 className="text-lg font-semibold mb-1">{lang === 'zh' ? '协作者管理' : 'Collaborators'}</h2>
      <p className="text-xs text-muted-foreground mb-3">
        {lang === 'zh' ? '添加其他教师后，他们也能编辑这门课程。' : 'Added teachers can edit this course too.'}
      </p>

      {isOwner && (
        <>
          <div className="flex gap-2 mb-3">
            <div className="relative flex-1">
              <button onClick={loadTeachers}
                className="w-full px-3 py-2 text-sm border rounded-lg outline-none text-left flex items-center justify-between hover:border-emerald-500">
                <span className={input ? '' : 'text-muted-foreground'}>{input || (lang === 'zh' ? '选择教师...' : 'Choose a teacher...')}</span>
                <span className="text-xs text-muted-foreground">▼</span>
              </button>
              {showTeacherList && availableTeachers.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
                  {availableTeachers.filter((t: any) => !collaborators.find((c: any) => c.id === t.id)).map((t: any) => (
                    <button key={t.id} onClick={() => { setInput(t.display_name); setShowTeacherList(false) }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50">{t.display_name}</button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => add()} disabled={!input}
              className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">
              {lang === 'zh' ? '添加' : 'Add'}
            </button>
          </div>
          {msg && <p className="text-sm mb-2">{msg}</p>}
        </>
      )}

      {collaborators.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {collaborators.map((c: any) => (
            <span key={c.id} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full">
              👤 {c.display_name}
              {isOwner && <button onClick={() => remove(c.id)} className="ml-1 text-red-400 hover:text-red-600">✕</button>}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {isOwner
            ? (lang === 'zh' ? '暂无协作者。' : 'No collaborators yet.')
            : (lang === 'zh' ? '只有课程创建者可以管理协作者。' : 'Only the course owner can manage collaborators.')}
        </p>
      )}
    </div>
  )
}
