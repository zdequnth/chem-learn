'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { BookOpen, BarChart3, LogOut, User, Settings, BookMarked, FileText } from 'lucide-react'
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
              {!isTeacher && <Link href="/vocab" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('vocab', lang)}</Link>}
              {!isTeacher && <Link href="/mock" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('mockExam', lang)}</Link>}
              {isTeacher && (<>
                <Link href="/teacher/courses" className="px-3 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">{t('courseMgmt', lang)}</Link>
                {/* The two gate-mode pages sit together in the gate colour, so the
                    nav reads as "one group per way of teaching" rather than as a
                    flat list of seven unrelated links. */}
                <span className="flex items-center gap-0.5 rounded-xl bg-emerald-50 border border-emerald-200 px-1 py-0.5">
                  <Link href="/teacher/questions" className="px-2.5 py-1.5 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">{t('gateQuestionBank', lang)}</Link>
                  <Link href="/teacher/analytics" className="px-2.5 py-1.5 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">{t('analytics', lang)}</Link>
                </span>
                <Link href="/teacher/vocab" className="px-3 py-1.5 rounded-lg text-sm font-medium text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">{t('vocabMgmt', lang)}</Link>
                <Link href="/teacher/mock" className="px-3 py-1.5 rounded-lg text-sm font-medium text-violet-800 bg-violet-50 border border-violet-200 hover:bg-violet-100 transition-colors">{t('mockMgmt', lang)}</Link>
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
                {!isTeacher && <button onClick={() => { router.push('/vocab'); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors md:hidden"><BookMarked className="w-4 h-4" /> {t('vocab', lang)}</button>}
                {!isTeacher && <button onClick={() => { router.push('/mock'); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors md:hidden"><FileText className="w-4 h-4" /> {t('mockExam', lang)}</button>}
                {isTeacher && <button onClick={() => { router.push('/teacher/vocab'); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-amber-800 hover:bg-amber-50 transition-colors md:hidden"><BookMarked className="w-4 h-4" /> {t('vocabMgmt', lang)}</button>}
                {isTeacher && <button onClick={() => { router.push('/teacher/mock'); setMenuOpen(false) }} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-violet-800 hover:bg-violet-50 transition-colors md:hidden"><FileText className="w-4 h-4" /> {t('mockMgmt', lang)}</button>}
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
