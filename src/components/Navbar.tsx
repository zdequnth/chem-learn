'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { BookOpen, BarChart3, LogOut, User, Settings } from 'lucide-react'
import { useState } from 'react'
import { useLang, t } from '@/lib/i18n'

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const { lang, setLang } = useLang()

  const isTeacher = profile?.role === 'teacher' || profile?.role === 'admin'

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-md border-b shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5 shrink-0">
              <div className="w-9 h-9 bg-gradient-to-br from-purple-400 to-indigo-600 rounded-lg flex items-center justify-center text-lg">🔑</div>
              <span className="text-lg font-bold hidden sm:block">SelfPass</span>
            </Link>
            <div className="hidden md:flex items-center gap-1">
              <Link href="/dashboard" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('dashboard', lang)}</Link>
              {!isTeacher && <Link href="/wrong-book" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('wrongBook', lang)}</Link>}
              {isTeacher && (<>
                <Link href="/teacher/courses" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('courseMgmt', lang)}</Link>
                <Link href="/teacher/questions" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('questionBank', lang)}</Link>
                <Link href="/teacher/classes" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('classes', lang)}</Link>
                <Link href="/admin/users" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('userMgmt', lang)}</Link>
              </>)}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
              title={lang === 'zh' ? 'Switch to English' : '切换到中文'}>🌐 {lang === 'zh' ? 'EN' : '中文'}</button>
            <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)} className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-accent transition-colors">
              <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">{profile?.display_name?.charAt(0) || '?'}</div>
              <span className="text-sm font-medium hidden sm:block">{profile?.display_name || (lang === 'zh' ? '用户' : 'User')}</span>
            </button>
            {menuOpen && (<>
              <div className="fixed inset-0" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-card rounded-xl shadow-lg border py-1 z-50">
                <div className="px-4 py-2 border-b">
                  <div className="text-sm font-medium">{profile?.display_name}</div>
                  <div className="text-xs text-muted-foreground">{isTeacher ? t('teacher', lang) : t('student', lang)}</div>
                </div>
                <button onClick={() => { router.push('/settings'); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"><Settings className="w-4 h-4" /> {t('settings', lang)}</button>
                <button onClick={() => { signOut(); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"><LogOut className="w-4 h-4" /> {t('signOut', lang)}</button>
              </div>
            </>)}
            </div>
          </div>
        </div>
      </div>
    </nav>
  )
}
