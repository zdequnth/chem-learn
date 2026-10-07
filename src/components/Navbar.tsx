'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/providers'
import { BookOpen, BarChart3, LogOut, User, Settings, BookMarked, FileText, Menu } from 'lucide-react'
import { useState } from 'react'
import { useLang, t } from '@/lib/i18n'

const NEUTRAL = 'text-muted-foreground hover:text-foreground hover:bg-accent'

interface NavEntry {
  href?: string
  label?: string
  cls: string
  group?: { href: string; label: string }[]
  linkCls?: string
}

// The same list drives the desktop row and the phone panel, so the two can never
// drift apart. The three teaching modes each keep their course colour.
function NAV_ITEMS(isTeacher: boolean, lang: 'zh' | 'en'): NavEntry[] {
  if (isTeacher) {
    return [
      { href: '/teacher/courses', label: t('courseMgmt', lang), cls: NEUTRAL },
      // 通关题库 + 学情分析 are both about gate mode, so they share one green pill.
      {
        cls: 'flex items-center gap-0.5 rounded-xl bg-emerald-50 border border-emerald-200 px-1 py-0.5',
        linkCls: 'text-emerald-700 hover:bg-emerald-100',
        group: [
          { href: '/teacher/questions', label: t('gateQuestionBank', lang) },
          { href: '/teacher/analytics', label: t('analytics', lang) },
        ],
      },
      { href: '/teacher/vocab', label: t('vocabMgmt', lang), cls: 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100' },
      { href: '/teacher/mock', label: t('mockMgmt', lang), cls: 'text-violet-800 bg-violet-50 border border-violet-200 hover:bg-violet-100' },
      { href: '/teacher/classes', label: t('classes', lang), cls: NEUTRAL },
      { href: '/admin/users', label: t('userMgmt', lang), cls: NEUTRAL },
    ]
  }
  return [
    { href: '/dashboard', label: t('dashboard', lang), cls: NEUTRAL },
    { href: '/wrong-book', label: t('wrongBook', lang), cls: NEUTRAL },
    { href: '/vocab', label: t('vocab', lang), cls: 'text-amber-800 bg-amber-50 border border-amber-200 hover:bg-amber-100' },
    { href: '/mock', label: t('mockExam', lang), cls: 'text-violet-800 bg-violet-50 border border-violet-200 hover:bg-violet-100' },
  ]
}

export default function Navbar() {
  const { user, profile, signOut } = useAuth()
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
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
            {/* One definition, rendered twice: inline on desktop, and inside the
                hamburger panel on phones (the links used to be hidden on small
                screens with nothing to replace them). */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS(isTeacher, lang).map((it, i) => it.group
                ? (
                  <span key={i} className={it.cls}>
                    {it.group.map(g => <Link key={g.href} href={g.href} className={`px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${it.linkCls}`}>{g.label}</Link>)}
                  </span>
                )
                : <Link key={i} href={it.href!} className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${it.cls}`}>{it.label}</Link>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors"
              title={lang === 'zh' ? 'Switch to English' : '切换到中文'}>🌐 {lang === 'zh' ? 'EN' : '中文'}</button>
            {/* Phones get the nav links here. Rendered as an absolute panel so the
                bar keeps its height and no page's top padding has to change. */}
            <div className="relative md:hidden">
              <button onClick={() => setNavOpen(v => !v)} aria-label="菜单"
                className="p-2 rounded-lg hover:bg-accent transition-colors">
                <Menu className="w-5 h-5" />
              </button>
              {navOpen && (<>
                <div className="fixed inset-0" onClick={() => setNavOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-60 bg-card rounded-xl shadow-lg border p-2 z-50 flex flex-col gap-1">
                  {NAV_ITEMS(isTeacher, lang).map((it, i) => it.group
                    ? (
                      <div key={i} className="flex flex-col gap-1 rounded-xl bg-emerald-50 border border-emerald-200 p-1">
                        {it.group.map(g => (
                          <Link key={g.href} href={g.href} onClick={() => setNavOpen(false)}
                            className="px-3 py-2 rounded-lg text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors">{g.label}</Link>
                        ))}
                      </div>
                    )
                    : <Link key={i} href={it.href!} onClick={() => setNavOpen(false)}
                        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${it.cls}`}>{it.label}</Link>
                  )}
                </div>
              </>)}
            </div>
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
                {/* The course-mode links now live in the hamburger panel, so this
                    menu is just the account. */}
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
