'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/app/providers'
import Navbar from '@/components/Navbar'
import { KatexHtml, getPdfUrl } from '@/components/KatexSpan'
import type { Course, Chapter, Lesson } from '@/lib/types'
import { ArrowLeft, Plus, ChevronDown, ChevronRight, Edit3, Trash2, Loader2, ArrowUp, ArrowDown, Image, Save, X } from 'lucide-react'

interface ChapterWithLessons extends Chapter {
  lessons: Lesson[]
  expanded: boolean
}

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>()
  const router = useRouter()
  const { user, profile, loading: authLoading } = useAuth()

  const [course, setCourse] = useState<Course | null>(null)
  const [chapters, setChapters] = useState<ChapterWithLessons[]>([])
  const [loading, setLoading] = useState(true)
  const [editCourse, setEditCourse] = useState(false)
  const [courseForm, setCourseForm] = useState({ name: '', description: '', grade_level: '', icon: '🧪' })
  const [newChapterTitle, setNewChapterTitle] = useState('')
  const [newLessonTitle, setNewLessonTitle] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [expandedLesson, setExpandedLesson] = useState<string | null>(null)
  const [kpData, setKpData] = useState<Record<string, { kps: any[]; videoLinks: any[] }>>({})
  const [newKpTitle, setNewKpTitle] = useState<Record<string, string>>({})
  const [newKpDesc, setNewKpDesc] = useState<Record<string, string>>({})
  const [newVlUrl, setNewVlUrl] = useState<Record<string, string>>({})
  const [newVlTitle, setNewVlTitle] = useState<Record<string, string>>({})
  const [newKpPdf, setNewKpPdf] = useState<Record<string, string>>({})
  const [editingKpId, setEditingKpId] = useState<string | null>(null)
  const [editKpTitle, setEditKpTitle] = useState('')
  const [editKpDesc, setEditKpDesc] = useState('')
  const [editKpPdf, setEditKpPdf] = useState('')
  const [isCourseOwner, setIsCourseOwner] = useState(false)
  const [isCollaborator, setIsCollaborator] = useState(false)
  const canEdit = isCourseOwner || isCollaborator || (profile?.role === 'admin')
  const [collaborators, setCollaborators] = useState<any[]>([])
  const [collabInput, setCollabInput] = useState('')
  const [collabMsg, setCollabMsg] = useState('')
  const [availableTeachers, setAvailableTeachers] = useState<any[]>([])
  const [showTeacherList, setShowTeacherList] = useState(false)
  const [modalKp, setModalKp] = useState<any>(null)
  const [modalLessonId, setModalLessonId] = useState('')
  const [modalTitle, setModalTitle] = useState('')
  const [modalDesc, setModalDesc] = useState('')
  const [modalPdfTitle, setModalPdfTitle] = useState('')
  const [modalPdfUrl, setModalPdfUrl] = useState('')
  const [modalVideos, setModalVideos] = useState<{ id: string; title: string; url: string; platform: string }[]>([])
  const [modalVlTitle, setModalVlTitle] = useState('')
  const [modalVlUrl, setModalVlUrl] = useState('')
  const [modalSaving, setModalSaving] = useState(false)
  // Inline rename
  const [editingChapterId, setEditingChapterId] = useState<string | null>(null)
  const [editingLessonId, setEditingLessonId] = useState<string | null>(null)
  const [renameTitle, setRenameTitle] = useState('')
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchMd, setBatchMd] = useState('')
  const [batchBusy, setBatchBusy] = useState(false)
  const [showImportChapter, setShowImportChapter] = useState(false)
  const [importCourseId, setImportCourseId] = useState('')
  const [importChapters, setImportChapters] = useState<any[]>([])
  const [importChapterId, setImportChapterId] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importCourses, setImportCourses] = useState<any[]>([])

  const openImportChapter = async () => {
    setShowImportChapter(true)
    setImportChapterId('')
    const res = await fetch('/api/courses')
    const json = await res.json()
    setImportCourses(json.courses || [])
  }

  const loadImportChapters = async (cid: string) => {
    setImportCourseId(cid)
    setImportChapterId('')
    if (!cid) { setImportChapters([]); return }
    const r = await fetch(`/api/student/course-data?courseId=${cid}`)
    const j = await r.json()
    setImportChapters(j.chapters || [])
  }

  const handleImportChapter = async () => {
    if (!importChapterId || importBusy) return
    setImportBusy(true)
    const res = await fetch('/api/chapters/copy', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceChapterId: importChapterId, targetCourseId: courseId }),
    })
    const json = await res.json()
    setImportBusy(false)
    setShowImportChapter(false)
    alert(`导入完成：${json.lessons || 0} 个课时，${json.questions || 0} 道题目，${json.knowledgePoints || 0} 个知识点`)
    fetchData()
  }

  const handleBatchImport = async () => {
    if (!batchMd.trim()) return
    setBatchBusy(true)
    const res = await fetch('/api/courses/batch-import', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, markdown: batchMd.trim() }),
    })
    const json = await res.json()
    setBatchBusy(false)
    setShowBatchImport(false)
    setBatchMd('')
    alert(`导入完成：${json.chapters || 0} 个章节，${json.lessons || 0} 个课时`)
    fetchData()
  }

  useEffect(() => {
    if (!authLoading && (!user || (profile && profile.role !== 'teacher' && profile.role !== 'admin'))) {
      router.push('/dashboard')
    }
  }, [user, profile, authLoading, router])

  useEffect(() => {
    if (!profile) return
    fetchData()
    fetchCollaborators()
  }, [profile, courseId])

  const fetchData = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/courses/${courseId}`)
      const json = await res.json()
      if (json.course) {
        setCourse(json.course)
        setCourseForm({
          name: json.course.name || '',
          description: json.course.description || '',
          grade_level: json.course.grade_level || '',
          icon: json.course.icon || '🧪',
        })
      }
      const chs: ChapterWithLessons[] = (json.chapters || []).map((ch: any) => ({
        ...ch,
        lessons: (json.lessons || []).filter((l: any) => l.chapter_id === ch.id).sort((a: any, b: any) => a.sort_order - b.sort_order),
        expanded: true,
      }))
      setChapters(chs)
      setIsCourseOwner(json.isOwner || false)
      setIsCollaborator(json.isCollaborator || false)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const fetchCollaborators = async () => {
    const res = await fetch(`/api/courses/collaborators?courseId=${courseId}`)
    const json = await res.json()
    setCollaborators(json.collaborators || [])
  }

  const loadTeachers = async () => {
    if (availableTeachers.length > 0) { setShowTeacherList(!showTeacherList); return }
    const res = await fetch('/api/courses/collaborators?courseId=' + courseId + '&listTeachers=1')
    const json = await res.json()
    setAvailableTeachers(json.teachers || [])
    setShowTeacherList(true)
  }

  const handleAddCollaborator = async (name?: string) => {
    const input = name || collabInput.trim()
    if (!input) return
    setCollabMsg('')
    setShowTeacherList(false)
    const res = await fetch('/api/courses/collaborators', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ courseId, teacherEmail: input }),
    })
    const json = await res.json()
    if (json.error) { setCollabMsg('❌ ' + json.error) }
    else {
      setCollabInput('')
      fetchCollaborators()
    }
  }

  const openKpModal = (kp: any, lessonId: string) => {
    setModalKp(kp); setModalLessonId(lessonId)
    setModalTitle(kp.title || '')
    const desc = kp.description || ''
    const m = desc.match(/\[pdf(?::([^\]]*))?\]([\s\S]*?)\[\/pdf\]/)
    setModalPdfTitle(m ? (m[1] || '') : '')
    setModalPdfUrl(m ? (m[2] || '') : '')
    setModalDesc(m ? desc.replace(/\[pdf[\s\S]*?\[\/pdf\]/, '').trim() : desc)
    const vs = (kpData[lessonId]?.videoLinks || []).filter((vl: any) => vl.knowledge_point_id === kp.id)
    setModalVideos(vs.map((v: any) => ({ id: v.id, title: v.title, url: v.url, platform: v.platform || 'other' })))
  }
  const handleModalSave = async () => {
    if (!modalKp) return; setModalSaving(true)
    let pdfTag = ''
    if (modalPdfUrl.trim()) pdfTag = '[pdf:' + (modalPdfTitle || 'PDF 资料') + ']' + modalPdfUrl.trim() + '[/pdf]'
    const desc = pdfTag ? (modalDesc.trim() + '\n' + pdfTag) : modalDesc.trim()
    await fetch(`/api/knowledge-points?id=${modalKp.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: modalTitle, description: desc || null }),
    })
    const evs = (kpData[modalLessonId]?.videoLinks || []).filter((vl: any) => vl.knowledge_point_id === modalKp.id)
    for (const v of evs) await fetch(`/api/video-links?id=${v.id}`, { method: 'DELETE' }).catch(() => {})
    for (const v of modalVideos) {
      await fetch('/api/video-links', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ knowledge_point_id: modalKp.id, title: v.title || '视频链接', url: v.url, platform: v.platform || 'other' }),
      }).catch(() => {})
    }
    setModalKp(null); setModalSaving(false)
    const res = await fetch(`/api/knowledge-points?lessonId=${modalLessonId}`)
    const json = await res.json()
    setKpData({ ...kpData, [modalLessonId]: { kps: json.kps || [], videoLinks: json.videoLinks || [] } })
  }
  const addModalVideo = () => {
    if (!modalVlUrl.trim()) return
    setModalVideos([...modalVideos, { id: '', title: modalVlTitle || '视频链接', url: modalVlUrl, platform: modalVlUrl.includes('bilibili') ? 'bilibili' : 'other' }])
    setModalVlTitle(''); setModalVlUrl('')
  }

  const startRenameChapter = (ch: Chapter) => {
    setEditingChapterId(ch.id); setRenameTitle(ch.title)
  }
  const saveRenameChapter = async () => {
    if (!editingChapterId || !renameTitle.trim()) return
    await fetch(`/api/chapters?id=${editingChapterId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renameTitle.trim() }),
    })
    setEditingChapterId(null); fetchData()
  }

  const startRenameLesson = (l: Lesson) => {
    setEditingLessonId(l.id); setRenameTitle(l.title)
  }
  const saveRenameLesson = async () => {
    if (!editingLessonId || !renameTitle.trim()) return
    await fetch(`/api/lessons?id=${editingLessonId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: renameTitle.trim() }),
    })
    setEditingLessonId(null); fetchData()
  }

  const handleRemoveCollaborator = async (teacherId: string) => {
    await fetch(`/api/courses/collaborators?courseId=${courseId}&teacherId=${teacherId}`, { method: 'DELETE' })
    fetchCollaborators()
  }

  const handleSaveCourse = async () => {
    if (!courseForm.name.trim()) return
    setBusy(true)
    await fetch(`/api/courses/${courseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: courseForm.name.trim(),
        description: courseForm.description.trim() || null,
        grade_level: courseForm.grade_level.trim() || null,
        icon: courseForm.icon || '🧪',
      }),
    })
    setEditCourse(false)
    setBusy(false)
    fetchData()
  }

  const handleAddChapter = async () => {
    if (!newChapterTitle.trim()) return
    setBusy(true)
    await fetch('/api/chapters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ course_id: courseId, title: newChapterTitle.trim(), sort_order: chapters.length }),
    })
    setNewChapterTitle('')
    setBusy(false)
    fetchData()
  }

  const handleDeleteChapter = async (id: string) => {
    if (!confirm('确定删除此章节及其所有课时和题目？')) return
    await fetch(`/api/chapters?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const handleMoveChapter = async (chapterId: string, direction: 'up' | 'down') => {
    const idx = chapters.findIndex(c => c.id === chapterId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === chapters.length - 1) return

    const otherIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = chapters[idx]
    const b = chapters[otherIdx]

    // Swap sort_order
    await Promise.all([
      fetch(`/api/chapters?id=${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: b.sort_order }),
      }),
      fetch(`/api/chapters?id=${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: a.sort_order }),
      }),
    ])
    fetchData()
  }

  const handleAddLesson = async (chapterId: string) => {
    const title = (newLessonTitle[chapterId] || '').trim()
    if (!title) return
    setBusy(true)
    const ch = chapters.find(c => c.id === chapterId)
    await fetch('/api/lessons', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chapter_id: chapterId, title, sort_order: ch ? ch.lessons.length : 0 }),
    })
    setNewLessonTitle({ ...newLessonTitle, [chapterId]: '' })
    setBusy(false)
    fetchData()
  }

  const handleDeleteLesson = async (id: string) => {
    if (!confirm('确定删除此课时？')) return
    await fetch(`/api/lessons?id=${id}`, { method: 'DELETE' })
    fetchData()
  }

  const handleMoveLesson = async (lessonId: string, chapterId: string, direction: 'up' | 'down') => {
    const ch = chapters.find(c => c.id === chapterId)
    if (!ch) return
    const lessons = [...ch.lessons].sort((a, b) => a.sort_order - b.sort_order)
    const idx = lessons.findIndex(l => l.id === lessonId)
    if (idx === -1) return
    if (direction === 'up' && idx === 0) return
    if (direction === 'down' && idx === lessons.length - 1) return

    const otherIdx = direction === 'up' ? idx - 1 : idx + 1
    const a = lessons[idx]
    const b = lessons[otherIdx]

    await Promise.all([
      fetch(`/api/lessons?id=${a.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: b.sort_order }),
      }),
      fetch(`/api/lessons?id=${b.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sort_order: a.sort_order }),
      }),
    ])
    fetchData()
  }

  const toggleChapter = (chapterId: string) => {
    setChapters(chapters.map(c => c.id === chapterId ? { ...c, expanded: !c.expanded } : c))
  }

  const toggleLessonKP = async (lessonId: string) => {
    if (expandedLesson === lessonId) { setExpandedLesson(null); return }
    setExpandedLesson(lessonId)
    // Fetch KPs and video links
    const res = await fetch(`/api/knowledge-points?lessonId=${lessonId}`)
    const json = await res.json()
    setKpData({ ...kpData, [lessonId]: { kps: json.kps || [], videoLinks: json.videoLinks || [] } })
  }

  const handleAddKP = async (lessonId: string) => {
    const title = (newKpTitle[lessonId] || '').trim()
    if (!title) return
    let desc = (newKpDesc[lessonId] || '').trim()
    const pdfUrl = (newKpPdf[lessonId] || '').trim()
    if (pdfUrl) desc = desc + '\n[pdf]' + pdfUrl + '[/pdf]'
    await fetch('/api/knowledge-points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lesson_id: lessonId, title, description: desc || null }),
    })
    setNewKpTitle({ ...newKpTitle, [lessonId]: '' })
    setNewKpDesc({ ...newKpDesc, [lessonId]: '' })
    setNewKpPdf({ ...newKpPdf, [lessonId]: '' })
    const res = await fetch(`/api/knowledge-points?lessonId=${lessonId}`)
    const json = await res.json()
    setKpData({ ...kpData, [lessonId]: { kps: json.kps || [], videoLinks: json.videoLinks || [] } })
  }

  const handleDeleteKP = async (kpId: string, lessonId: string) => {
    if (!confirm('确定删除此知识点？')) return
    await fetch(`/api/knowledge-points?id=${kpId}`, { method: 'DELETE' })
    const res = await fetch(`/api/knowledge-points?lessonId=${lessonId}`)
    const json = await res.json()
    setKpData({ ...kpData, [lessonId]: { kps: json.kps || [], videoLinks: json.videoLinks || [] } })
  }

  const handleAddVideoLink = async (kpId: string, lessonId: string) => {
    const url = (newVlUrl[`vl_${kpId}`] || '').trim()
    const title = (newVlTitle[`vl_${kpId}`] || '').trim()
    if (!url) return
    await fetch('/api/video-links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ knowledge_point_id: kpId, url, title: title || '视频链接', platform: url.includes('bilibili') ? 'bilibili' : url.includes('youtube') ? 'youtube' : 'other' }),
    })
    setNewVlUrl({ ...newVlUrl, [`vl_${kpId}`]: '' })
    setNewVlTitle({ ...newVlTitle, [`vl_${kpId}`]: '' })
    const res = await fetch(`/api/knowledge-points?lessonId=${lessonId}`)
    const json = await res.json()
    setKpData({ ...kpData, [lessonId]: { kps: json.kps || [], videoLinks: json.videoLinks || [] } })
  }

  const handleDeleteVideoLink = async (vlId: string, lessonId: string) => {
    await fetch(`/api/video-links?id=${vlId}`, { method: 'DELETE' })
    const res = await fetch(`/api/knowledge-points?lessonId=${lessonId}`)
    const json = await res.json()
    setKpData({ ...kpData, [lessonId]: { kps: json.kps || [], videoLinks: json.videoLinks || [] } })
  }

  const handleStartEditKP = (kp: any) => {
    setEditingKpId(kp.id)
    setEditKpTitle(kp.title || '')
    // Split PDF URL from description
    const pdfMatch = (kp.description || '').match(/\[pdf\]([\s\S]*?)\[\/pdf\]/)
    if (pdfMatch) {
      setEditKpDesc((kp.description || '').replace(/\[pdf\][\s\S]*?\[\/pdf\]/, '').trim())
      setEditKpPdf(pdfMatch[1])
    } else {
      setEditKpDesc(kp.description || '')
      setEditKpPdf('')
    }
  }

  const handleSaveKP = async (kpId: string, lessonId: string) => {
    const desc = editKpPdf ? (editKpDesc.trim() + '\n[pdf]' + editKpPdf + '[/pdf]') : editKpDesc.trim()
    await fetch(`/api/knowledge-points?id=${kpId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: editKpTitle, description: desc || null }),
    })
    setEditingKpId(null)
    setEditKpPdf('')
    const res = await fetch(`/api/knowledge-points?lessonId=${lessonId}`)
    const json = await res.json()
    setKpData({ ...kpData, [lessonId]: { kps: json.kps || [], videoLinks: json.videoLinks || [] } })
  }

  const handleKpImagePaste = async (e: React.ClipboardEvent, kpId: string, lessonId: string) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const formData = new FormData()
        formData.append('file', file)
        const res = await fetch('/api/upload-image', { method: 'POST', body: formData })
        const json = await res.json()
        if (json.url) {
          setEditKpDesc(prev => prev + `\n![图片](${json.url})`)
        } else {
          alert(json.error || '图片上传失败')
        }
        break
      }
    }
  }

  const handleKpImageUpload = async (kpId: string, lessonId: string) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/upload-image', { method: 'POST', body: formData })
      const json = await res.json()
      if (json.url) {
        setEditKpDesc(prev => prev + `\n![图片](${json.url})`)
      } else {
        alert(json.error || '图片上传失败')
      }
    }
    input.click()
  }

  if (authLoading || !profile) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 pt-24 pb-20">
        <Link href="/teacher/courses" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4 transition-colors">
          <ArrowLeft className="w-4 h-4" /> 返回课程列表
        </Link>

        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
        ) : !course ? (
          <div className="text-center py-20"><p className="text-muted-foreground">课程不存在</p></div>
        ) : (
          <>
            {/* Course Header */}
            <div className="bg-card rounded-2xl border p-6 mb-6">
              {editCourse ? (
                <div className="space-y-3">
                  <input value={courseForm.name} onChange={e => setCourseForm({ ...courseForm, name: e.target.value })}
                    placeholder="课程名称" className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input value={courseForm.grade_level} onChange={e => setCourseForm({ ...courseForm, grade_level: e.target.value })}
                    placeholder="年级/级别" className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                  <textarea value={courseForm.description} onChange={e => setCourseForm({ ...courseForm, description: e.target.value })}
                    placeholder="描述" rows={2} className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none" />
                  <div className="flex gap-3">
                    <button onClick={handleSaveCourse} disabled={busy}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">保存</button>
                    <button onClick={() => setEditCourse(false)} className="px-4 py-2 bg-accent rounded-lg font-medium">取消</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-14 h-14 bg-gradient-to-br from-emerald-100 to-emerald-200 rounded-2xl flex items-center justify-center text-3xl">{course.icon}</div>
                    <div>
                      <h1 className="text-2xl font-bold">{course.name}</h1>
                      {course.grade_level && <span className="text-sm px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full">{course.grade_level}</span>}
                    </div>
                  </div>
                  {canEdit && <button onClick={() => setEditCourse(true)} className="text-sm text-muted-foreground hover:text-foreground"><Edit3 className="w-4 h-4 inline" /> 编辑</button>}
                </div>
              )}
            </div>

            {/* Collaborators (owner only) */}
            {isCourseOwner && (
              <div className="bg-card rounded-2xl border p-6 mb-6">
                <h2 className="text-lg font-semibold mb-3">协作者管理</h2>
                <div className="flex gap-2 mb-3">
                  <div className="relative flex-1">
                    <button onClick={loadTeachers}
                      className="w-full px-3 py-2 text-sm border rounded-lg outline-none text-left flex items-center justify-between hover:border-emerald-500">
                      <span className={collabInput ? '' : 'text-muted-foreground'}>{collabInput || '选择教师...'}</span>
                      <span className="text-xs text-muted-foreground">▼</span>
                    </button>
                    {showTeacherList && availableTeachers.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-10 max-h-40 overflow-y-auto">
                        {availableTeachers.filter((t: any) =>
                          !collaborators.find((c: any) => c.id === t.id)
                        ).map((t: any) => (
                          <button key={t.id} onClick={() => { setCollabInput(t.display_name); setShowTeacherList(false) }}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50">{t.display_name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={() => handleAddCollaborator()} disabled={!collabInput}
                    className="px-4 py-2 text-sm bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50">添加</button>
                </div>
                {collabMsg && <p className="text-sm mb-2">{collabMsg}</p>}
                {collaborators.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {collaborators.map((c: any) => (
                      <span key={c.id} className="inline-flex items-center gap-1 px-3 py-1 bg-blue-50 text-blue-700 text-sm rounded-full">
                        👤 {c.display_name}
                        <button onClick={() => handleRemoveCollaborator(c.id)} className="ml-1 text-red-400 hover:text-red-600">✕</button>
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">暂无协作者。添加其他教师后，他们也能编辑此课程的章节、课时和题目。</p>
                )}
              </div>
            )}

            {/* Chapters & Lessons */}
            <div className="bg-card rounded-2xl border p-6">
              <h2 className="text-lg font-semibold mb-4">章节与课时 ({chapters.length} 章)</h2>

              {canEdit && (
              <div className="flex gap-3 mb-6">
                <input value={newChapterTitle} onChange={e => setNewChapterTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleAddChapter() }}
                  placeholder="新章节名称" className="flex-1 px-4 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                <button onClick={handleAddChapter} disabled={busy}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50"><Plus className="w-4 h-4" /> 添加</button>
                <button onClick={() => setShowBatchImport(true)}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 text-sm">📄 批量导入</button>
                <button onClick={openImportChapter}
                  className="px-4 py-2 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 text-sm">📥 导入章节</button>
              </div>
              )}

              {chapters.length === 0 ? (
                <p className="text-center py-12 text-muted-foreground">还没有章节</p>
              ) : (
                <div className="space-y-3">
                  {chapters.map((ch, idx) => (
                    <div key={ch.id} className="border rounded-xl overflow-hidden">
                      <div className="flex items-center gap-3 px-4 py-3 bg-accent/50 cursor-pointer hover:bg-accent" onClick={() => toggleChapter(ch.id)}>
                        {ch.expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                        {editingChapterId === ch.id ? (
                          <input value={renameTitle} onChange={e => setRenameTitle(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') saveRenameChapter(); if (e.key === 'Escape') setEditingChapterId(null) }}
                            onBlur={saveRenameChapter}
                            autoFocus className="font-medium flex-1 px-2 py-0.5 border rounded text-sm" />
                        ) : (
                          <span className="font-medium flex-1">{idx + 1}. {ch.title}</span>
                        )}
                        <button onClick={e => { e.stopPropagation(); startRenameChapter(ch) }}
                          className="p-1 hover:bg-gray-200 rounded" title="重命名">
                          <Edit3 className="w-3 h-3 text-gray-400" />
                        </button>
                        <span className="text-xs text-muted-foreground mr-2">{ch.lessons.length} 课时</span>
                        {canEdit && <button onClick={e => { e.stopPropagation(); handleMoveChapter(ch.id, 'up') }}
                          disabled={idx === 0}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30" title="上移">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>}
                        {canEdit && <button onClick={e => { e.stopPropagation(); handleMoveChapter(ch.id, 'down') }}
                          disabled={idx === chapters.length - 1}
                          className="p-1 hover:bg-gray-200 rounded disabled:opacity-30" title="下移">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>}
                        {canEdit && <button onClick={e => { e.stopPropagation(); handleDeleteChapter(ch.id) }}
                          className="p-1 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4 text-red-400" /></button>}
                      </div>
                      {ch.expanded && (
                        <div className="px-4 pb-3 pt-1">
                          {ch.lessons.map((l, lIdx) => (
                            <div key={l.id}>
                              <div className="flex items-center gap-3 pl-7 py-2 border-b last:border-b-0 cursor-pointer hover:bg-gray-50"
                                onClick={() => toggleLessonKP(l.id)}>
                                <span className="text-sm text-muted-foreground w-6">{idx + 1}.{lIdx + 1}</span>
                                {editingLessonId === l.id ? (
                                  <input value={renameTitle} onChange={e => setRenameTitle(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveRenameLesson(); if (e.key === 'Escape') setEditingLessonId(null) }}
                                    onBlur={saveRenameLesson}
                                    autoFocus className="flex-1 px-2 py-0.5 border rounded text-sm" />
                                ) : (
                                  <span className="flex-1 text-sm">{l.title}</span>
                                )}
                                <button onClick={e => { e.stopPropagation(); startRenameLesson(l) }}
                                  className="p-0.5 hover:bg-gray-200 rounded" title="重命名">
                                  <Edit3 className="w-3 h-3 text-gray-400" />
                                </button>
                                <span className="text-xs text-muted-foreground">知识点 ▸</span>
                                {canEdit && <button onClick={e => { e.stopPropagation(); handleMoveLesson(l.id, ch.id, 'up') }}
                                  disabled={lIdx === 0}
                                  className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30" title="上移">
                                  <ArrowUp className="w-3 h-3" />
                                </button>}
                                {canEdit && <button onClick={e => { e.stopPropagation(); handleMoveLesson(l.id, ch.id, 'down') }}
                                  disabled={lIdx === ch.lessons.length - 1}
                                  className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30" title="下移">
                                  <ArrowDown className="w-3 h-3" />
                                </button>}
                                {canEdit && <button onClick={e => { e.stopPropagation(); handleDeleteLesson(l.id) }}
                                  className="p-1 hover:bg-red-50 rounded ml-1"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>}
                              </div>
                              {/* Knowledge Points */}
                              {expandedLesson === l.id && (
                                <div className="ml-14 mr-4 mb-3 mt-2 p-3 bg-gray-50 rounded-lg border">
                                  <div className="text-xs font-medium text-muted-foreground mb-2">知识点管理</div>

                                  {((kpData[l.id]?.kps) || []).map((kp: any) => (
                                    <div key={kp.id} className="mb-2 pl-2 border-l-2 border-blue-300">
                                      <div className="flex items-center gap-2">
                                        {canEdit ? (
                                          <button onClick={() => openKpModal(kp, l.id)}
                                            className="text-sm font-medium hover:text-blue-600 text-left">
                                            {kp.title}
                                          </button>
                                        ) : (
                                          <span className="text-sm font-medium">{kp.title}</span>
                                        )}
                                        {canEdit && <button onClick={() => handleDeleteKP(kp.id, l.id)}
                                          className="text-red-400 hover:text-red-600 text-xs">✕</button>}
                                      </div>
                                    </div>
                                  ))}
                                  {/* Add KP */}
                                  {canEdit && <div className="flex gap-2 mt-2 pt-2 border-t">
                                    <input
                                      value={newKpTitle[l.id] || ''}
                                      onChange={e => setNewKpTitle({ ...newKpTitle, [l.id]: e.target.value })}
                                      onKeyDown={e => { if (e.key === 'Enter') handleAddKP(l.id) }}
                                      placeholder="新知识点名称"
                                      className="flex-1 px-2 py-1 text-xs border rounded"
                                    />
                                    <button onClick={() => handleAddKP(l.id)}
                                      className="px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600">+</button>
                                  </div>}
                                </div>
                              )}
                            </div>
                          ))}
                          {canEdit && (
                          <div className="flex gap-2 mt-3 pl-7">
                            <input value={newLessonTitle[ch.id] || ''}
                              onChange={e => setNewLessonTitle({ ...newLessonTitle, [ch.id]: e.target.value })}
                              onKeyDown={e => { if (e.key === 'Enter') handleAddLesson(ch.id) }}
                              placeholder="新课名称" className="flex-1 px-3 py-1.5 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                            <button onClick={() => handleAddLesson(ch.id)} disabled={busy}
                              className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50">+ 课时</button>
                          </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>

      {/* Import Chapter Modal */}
      {showImportChapter && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowImportChapter(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-3">📥 从其他课程导入章节</h3>
            <div className="space-y-3">
              <select value={importCourseId} onChange={e => loadImportChapters(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                <option value="">选择源课程</option>
                {importCourses.filter((c: any) => c.id !== courseId).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              {importChapters.length > 0 && (
                <select value={importChapterId} onChange={e => setImportChapterId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500">
                  <option value="">选择要导入的章节</option>
                  {importChapters.map((ch: any) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}
                </select>
              )}
            </div>
            <div className="flex gap-3 mt-4">
              <button onClick={handleImportChapter} disabled={!importChapterId || importBusy}
                className="flex-1 py-2.5 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 disabled:opacity-50">
                {importBusy ? '导入中...' : '开始导入'}
              </button>
              <button onClick={() => setShowImportChapter(false)} className="px-6 py-2.5 bg-gray-200 rounded-lg">取消</button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Import Modal */}
      {showBatchImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowBatchImport(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">批量导入章节和课时</h3>
            <p className="text-sm text-muted-foreground mb-3">按 Markdown 格式粘贴：# 章节名，## 课时名</p>
            <textarea value={batchMd} onChange={e => setBatchMd(e.target.value)}
              rows={10} placeholder={`# 酸碱中和\n## 指示剂\n## 滴定管的使用\n# 离子检验\n## 氯离子\n## 硫酸根离子`}
              className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm resize-none" />
            <div className="flex gap-3 mt-4">
              <button onClick={handleBatchImport} disabled={batchBusy || !batchMd.trim()}
                className="flex-1 py-2.5 bg-purple-500 text-white rounded-lg font-medium hover:bg-purple-600 disabled:opacity-50">
                {batchBusy ? '导入中...' : '开始导入'}
              </button>
              <button onClick={() => setShowBatchImport(false)} className="px-6 py-2.5 bg-gray-200 rounded-lg">取消</button>
            </div>
          </div>
        </div>
      )}

      {modalKp && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-12 overflow-y-auto" onClick={() => setModalKp(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 mb-12" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3 border-b">
              <h3 className="font-semibold">编辑知识点</h3>
              <div className="flex gap-2">
                <button onClick={handleModalSave} disabled={modalSaving}
                  className="flex items-center gap-1 px-4 py-1.5 bg-emerald-500 text-white rounded-lg text-sm font-medium hover:bg-emerald-600 disabled:opacity-50">
                  {modalSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />} 完成
                </button>
                <button onClick={() => setModalKp(null)} className="px-4 py-1.5 bg-gray-200 rounded-lg text-sm font-medium hover:bg-gray-300">取消</button>
              </div>
            </div>
            <div className="flex divide-x max-h-[75vh] overflow-y-auto">
              <div className="flex-1 p-6 space-y-4 min-w-0">
                <div><label className="block text-sm font-medium mb-1">知识点名称</label>
                  <input value={modalTitle} onChange={e => setModalTitle(e.target.value)} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" /></div>
                <div><label className="block text-sm font-medium mb-1">详细描述（Markdown / Ctrl+V 贴图）</label>
                  <div className="relative"><textarea value={modalDesc} onChange={e => setModalDesc(e.target.value)}
                    onPaste={async (e) => { const items = e.clipboardData?.items; if (!items) return; for (const item of Array.from(items)) { if (item.type.startsWith('image/')) { e.preventDefault(); const file = item.getAsFile(); if (!file) continue; const fd = new FormData(); fd.append('file', file); const r = await fetch('/api/upload-image', { method: 'POST', body: fd }); const j = await r.json(); if (j.url) setModalDesc(p => p + '\n![图片](' + j.url + ')'); break } } }}
                    rows={12} className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-mono text-sm" placeholder="Markdown / Ctrl+V 贴图 / 换行分段" />
                    <button onClick={() => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = async () => { const f = i.files?.[0]; if (!f) return; const fd = new FormData(); fd.append('file', f); const r = await fetch('/api/upload-image', { method: 'POST', body: fd }); const j = await r.json(); if (j.url) setModalDesc(p => p + '\n![图片](' + j.url + ')') }; i.click() }}
                      className="absolute bottom-2 right-2 p-1.5 bg-gray-100 rounded hover:bg-gray-200" title="上传图片"><Image className="w-4 h-4 text-gray-500" /></button></div></div>
                <div><label className="block text-sm font-medium mb-1">PDF 链接</label>
                  <div className="flex gap-2"><input value={modalPdfTitle} onChange={e => setModalPdfTitle(e.target.value)} placeholder="标题（如：课程讲义）" className="flex-1 px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
                  <input value={modalPdfUrl} onChange={e => setModalPdfUrl(e.target.value)} placeholder="https://example.com/file.pdf" className="flex-[2] px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" /></div></div>
                <div><label className="block text-sm font-medium mb-1">视频链接</label>
                  {modalVideos.map((v, i) => (<div key={i} className="flex items-center gap-2 mb-1 text-sm"><span className="text-muted-foreground truncate w-24">{v.title}</span><span className="text-blue-600 truncate flex-1">{v.url}</span><button onClick={() => setModalVideos(modalVideos.filter((_, j) => j !== i))} className="text-red-400">✕</button></div>))}
                  <div className="flex gap-2 mt-2"><input value={modalVlTitle} onChange={e => setModalVlTitle(e.target.value)} placeholder="标题" className="w-24 px-2 py-1 text-sm border rounded" />
                  <input value={modalVlUrl} onChange={e => setModalVlUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addModalVideo() }} placeholder="B站/YouTube链接" className="flex-1 px-2 py-1 text-sm border rounded" />
                  <button onClick={addModalVideo} className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600">+</button></div></div>
              </div>
              <div className="flex-1 p-6 bg-gray-50 min-w-0"><h4 className="text-sm font-medium text-muted-foreground mb-3">学生端预览</h4>
                <div className="bg-white border rounded-xl p-4"><h3 className="font-semibold text-lg mb-3">{modalTitle || '(未命名)'}</h3>
                  {modalDesc ? <div className="text-sm leading-relaxed"><KatexHtml text={modalDesc} /></div> : <p className="text-sm text-muted-foreground">暂无描述</p>}
                  {modalPdfUrl && <div className="mt-3"><KatexHtml text={`[pdf:${modalPdfTitle || 'PDF 资料'}]${modalPdfUrl}[/pdf]`} /></div>}
                </div>
                {modalVideos.length > 0 && (<div className="bg-white border rounded-xl p-4 mt-3"><h4 className="text-sm font-medium mb-2">🎬 视频</h4>
                  {modalVideos.map((v, i) => (<a key={i} href={v.url} target="_blank" className="block text-sm text-blue-600 hover:underline mb-1">▶ {v.title || v.url}</a>))}</div>)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
