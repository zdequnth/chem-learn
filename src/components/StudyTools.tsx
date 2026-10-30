'use client'

import { useEffect, useState } from 'react'
import { BookOpen, Calculator, X } from 'lucide-react'
import { useAuth } from '@/app/providers'
import { useLang } from '@/lib/i18n'
import FormulaSheet from './FormulaSheet'
import ScientificCalculator from './ScientificCalculator'

type Panel = 'formula' | 'calculator'

const PANEL_BOTTOM = 'calc(6.5rem + env(safe-area-inset-bottom))'

export default function StudyTools() {
  const { user, loading } = useAuth()
  const { lang } = useLang()
  const [panel, setPanel] = useState<Panel | null>(null)

  useEffect(() => {
    if (!panel) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panel])

  if (loading || !user) return null

  const label = (zh: string, en: string) => (lang === 'zh' ? zh : en)

  return (
    <>
      <div
        className="fixed right-3 z-40 flex flex-col items-end gap-2 print:hidden"
        style={{ bottom: 'calc(1rem + env(safe-area-inset-bottom))' }}
      >
        <button
          type="button"
          aria-expanded={panel === 'formula'}
          aria-label={label('公式表', 'Formula sheet')}
          onClick={() => setPanel(p => (p === 'formula' ? null : 'formula'))}
          className={`flex items-center gap-1.5 rounded-full border bg-white px-3 py-2 text-xs font-medium shadow-lg transition-colors hover:bg-slate-50 ${
            panel === 'formula' ? 'ring-2 ring-slate-300' : ''
          }`}
        >
          <BookOpen className="h-4 w-4 text-slate-700" />
          <span className="hidden sm:inline">{label('公式表', 'Formulas')}</span>
        </button>

        <button
          type="button"
          aria-expanded={panel === 'calculator'}
          aria-label={label('计算器', 'Calculator')}
          onClick={() => setPanel(p => (p === 'calculator' ? null : 'calculator'))}
          className={`flex items-center gap-1.5 rounded-full border bg-white px-3 py-2 text-xs font-medium shadow-lg transition-colors hover:bg-slate-50 ${
            panel === 'calculator' ? 'ring-2 ring-slate-300' : ''
          }`}
        >
          <Calculator className="h-4 w-4 text-slate-700" />
          <span className="hidden sm:inline">{label('计算器', 'Calculator')}</span>
        </button>
      </div>

      {panel === 'formula' && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={label('公式表', 'Formula sheet')}
          className="fixed right-3 z-40 flex flex-col overflow-hidden rounded-2xl border bg-white shadow-2xl print:hidden"
          style={{ bottom: PANEL_BOTTOM, width: 'min(600px, calc(100vw - 1.5rem))', maxHeight: 'min(78vh, 760px)' }}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">{label('公式表', 'Formula sheet')}</div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label={label('关闭', 'Close')}
              className="rounded-lg p-1 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <FormulaSheet lang={lang} />
          </div>
        </div>
      )}

      {panel === 'calculator' && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={label('计算器', 'Calculator')}
          className="fixed right-3 z-40 overflow-hidden rounded-2xl border bg-white shadow-2xl print:hidden"
          style={{ bottom: PANEL_BOTTOM, width: 'min(340px, calc(100vw - 1.5rem))' }}
        >
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="text-sm font-semibold">{label('计算器', 'Calculator')}</div>
            <button
              type="button"
              onClick={() => setPanel(null)}
              aria-label={label('关闭', 'Close')}
              className="rounded-lg p-1 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ScientificCalculator lang={lang} />
        </div>
      )}
    </>
  )
}
