'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { Course } from '@/lib/types'

// One course of each kind per class. The gate binding is locked after it is
// set — student progress hangs off that course's lessons — while vocab and
// mock carry no per-lesson progress and can be swapped freely.

const KINDS = [
  { kind: 'gate', label: '🧪 通关课程', noun: '通关课程', hint: '决定这个班的进度条算哪门课；绑定后不可更改' },
  { kind: 'vocab', label: '📖 背单词课程', noun: '背单词课程', hint: '可选；绑上后学生首页会多一张卡片' },
  { kind: 'mock', label: '📝 模拟考课程', noun: '模拟考课程', hint: '可选；绑上后学生首页会多一张卡片' },
] as const

interface Binding { id: string; kind: string; courseId: string; courseName: string }

export default function CourseBindings({ classId, onChange }: { classId: string; onChange?: () => void }) {
  const [bindings, setBindings] = useState<Binding[] | null>(null)
  const [courses, setCourses] = useState<Course[]>([])
  const [pick, setPick] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = async () => {
    const j = await fetch(`/api/class-courses?classId=${classId}`).then(r => r.json()).catch(() => ({}))
    setBindings(j.bindings || [])
  }

  useEffect(() => {
    load()
    fetch('/api/courses').then(r => r.json()).then(j => setCourses((j.courses || []) as Course[])).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classId])

  const bind = async (kind: string) => {
    const courseId = pick[kind]
    if (!courseId) return
    const bound = (bindings || []).find(b => b.kind === kind)
    if (bound && kind !== 'gate') {
      if (!confirm(`这个班已经绑定了「${bound.courseName}」，换成新的？\n（学生的词汇进度按词记、模拟考成绩按卷子记，都不受影响）`)) return
    }
    setBusy(kind)
    const r = await fetch('/api/class-courses', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ classId, courseId }),
    })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok || j.error) return alert('绑定失败：' + (j.error || r.status))
    setPick(p => ({ ...p, [kind]: '' }))
    await load()
    onChange?.()
  }

  const unbind = async (kind: string, name: string) => {
    if (!confirm(`解除与「${name}」的绑定？`)) return
    setBusy(kind)
    const r = await fetch(`/api/class-courses?classId=${classId}&kind=${kind}`, { method: 'DELETE' })
    const j = await r.json().catch(() => ({}))
    setBusy(null)
    if (!r.ok || j.error) return alert('解除失败：' + (j.error || r.status))
    await load()
    onChange?.()
  }

  if (!bindings) {
    return <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin inline text-gray-400" /></div>
  }

  return (
    <div className="space-y-4">
      {KINDS.map(({ kind, label, noun, hint }) => {
        const bound = bindings.find(b => b.kind === kind)
        const options = courses.filter(c => (c.kind ?? 'gate') === kind)
        return (
          <div key={kind} className="border rounded-xl p-3">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-sm font-medium">{label}</span>
              {bound ? (
                <>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">{bound.courseName}</span>
                  {kind === 'gate'
                    ? <span className="text-xs text-muted-foreground">已锁定</span>
                    : <button onClick={() => unbind(kind, bound.courseName)} disabled={busy === kind}
                        className="text-xs text-red-500 hover:underline disabled:opacity-50">解除</button>}
                </>
              ) : (
                <span className="text-xs text-muted-foreground">未绑定</span>
              )}
            </div>
            <div className="flex gap-2">
              <select value={pick[kind] || ''} onChange={e => setPick(p => ({ ...p, [kind]: e.target.value }))}
                className="flex-1 px-3 py-2 border rounded-lg bg-background text-sm">
                <option value="">{bound ? '换成…' : '选择课程…'}</option>
                {options.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button onClick={() => bind(kind)} disabled={!pick[kind] || busy === kind}
                className="px-3 py-2 rounded-lg text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40">
                {busy === kind ? '处理中…' : bound ? '更换' : '绑定'}
              </button>
            </div>
            <p className="text-xs text-muted-foreground mt-1.5">
              {hint}
              {options.length === 0 && ` · 你还没有${noun}`}
            </p>
          </div>
        )
      })}
      <p className="text-xs text-muted-foreground">
        一类课程只能绑一个。背单词 / 模拟考课程也可以不绑，直接「发布」那门课就对学生可见。
      </p>
    </div>
  )
}
