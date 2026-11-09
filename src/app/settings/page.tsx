'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { createClient } from '@/lib/supabase/client'
import Navbar from '@/components/Navbar'
import { Loader2, User } from 'lucide-react'
import { useLang, t, tr } from '@/lib/i18n'

export default function SettingsPage() {
  const router = useRouter()
  const { user, profile, loading: authLoading, refreshProfile } = useAuth()
  const supabase = createClient()
  const { lang } = useLang()

  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!authLoading && !user) { router.push('/login') }
  }, [user, authLoading, router])

  useEffect(() => {
    if (profile) setName(profile.display_name || '')
  }, [profile])

  const handleSave = async () => {
    if (!profile || !name.trim()) return
    setSaving(true)
    setMessage('')
    const { error } = await supabase.from('profiles').update({ display_name: name.trim() }).eq('id', profile.id)
    if (error) {
      setMessage(tr(lang, '保存失败：', 'Save failed: ') + error.message)
    } else {
      setMessage(tr(lang, '保存成功！', 'Saved!'))
      await refreshProfile()
    }
    setSaving(false)
  }

  if (authLoading || !user) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-8 h-8 text-emerald-500 animate-spin" /></div>
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-20">
        <h1 className="text-2xl font-bold mb-8">{tr(lang, '个人设置', 'Personal Settings')}</h1>

        <div className="bg-card rounded-2xl border p-6 space-y-4">
          <div className="flex items-center gap-4 pb-4 border-b">
            <div className="w-16 h-16 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-full flex items-center justify-center text-white text-2xl font-bold">
              {profile?.display_name?.charAt(0) || '?'}
            </div>
            <div>
              <div className="font-semibold text-lg">{profile?.display_name}</div>
              <div className="text-sm text-muted-foreground">{user.email}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {profile?.role === 'teacher' ? t('teacher', lang) : profile?.role === 'admin' ? t('admin', lang) : t('student', lang)}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">{tr(lang, '显示名称', 'Display Name')}</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-4 py-2.5 border rounded-lg outline-none focus:ring-2 focus:ring-emerald-500" />
          </div>

          {message && (
            <div className={`p-3 rounded-lg text-sm ${message.includes('成功') || message.includes('Saved') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
              {message}
            </div>
          )}

          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 transition-colors">
            {saving ? tr(lang, '保存中...', 'Saving...') : tr(lang, '保存设置', 'Save Settings')}
          </button>

          {(profile?.role === 'teacher' || profile?.role === 'admin') && (
            <div className="pt-4 border-t">
              <a href="/manual/selfpass-teacher-manual.html" target="_blank" rel="noopener"
                className="text-sm font-medium text-emerald-600 hover:underline">
                {tr(lang, '📘 教师使用说明书（中英双语）', '📘 Teacher Manual (bilingual)')}
              </a>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
