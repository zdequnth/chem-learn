'use client'

import { useMemo, useState } from 'react'
import { tr, type Lang } from '@/lib/i18n'
import { FORMULA_SUBJECTS, subjectByKey } from '@/lib/formula-sheets'
import PeriodicTable from './PeriodicTable'

type Section = 'periodic' | 'constants' | 'equations' | 'ions'

export default function FormulaSheet({ lang }: { lang: Lang }) {
  const [subjectKey, setSubjectKey] = useState(FORMULA_SUBJECTS[0].key)
  const subject = subjectByKey(subjectKey)
  const [section, setSection] = useState<Section>(subject.periodic ? 'periodic' : 'constants')

  const sections = useMemo(() => {
    const list: { key: Section; label: string }[] = []
    if (subject.periodic) list.push({ key: 'periodic', label: tr(lang, '元素周期表', 'Periodic table') })
    if (subject.constants.length) list.push({ key: 'constants', label: tr(lang, '常数', 'Constants') })
    if (subject.equations.length) list.push({ key: 'equations', label: tr(lang, '常用公式', 'Equations') })
    if (subject.ions.length) list.push({ key: 'ions', label: tr(lang, '常见离子', 'Common ions') })
    return list
  }, [subject, lang])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {FORMULA_SUBJECTS.length > 1 && (
        <div className="flex gap-1 border-b px-3 pt-2">
          {FORMULA_SUBJECTS.map(s => (
            <button
              key={s.key}
              type="button"
              onClick={() => {
                setSubjectKey(s.key)
                setSection(s.periodic ? 'periodic' : 'constants')
              }}
              className={`rounded-t-lg px-3 py-1.5 text-xs font-medium ${
                s.key === subjectKey ? 'bg-slate-100 text-slate-900' : 'text-muted-foreground hover:bg-gray-50'
              }`}
            >
              {s.label[lang]}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1 border-b px-3 py-2">
        {sections.map(s => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSection(s.key)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
              section === s.key
                ? 'bg-slate-800 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {section === 'periodic' && subject.periodic && (
          <PeriodicTable lang={lang} />
        )}

        {section === 'constants' && (
          <table className="w-full border-collapse text-[11px]">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="border-b py-1.5 pr-2 font-medium">{tr(lang, '量', 'Quantity')}</th>
                <th className="border-b py-1.5 font-medium">{tr(lang, '数值', 'Value')}</th>
              </tr>
            </thead>
            <tbody>
              {subject.constants.map(c => (
                <tr key={c.label.en} className="align-top">
                  <td className="border-b border-slate-100 py-1.5 pr-2">{c.label[lang]}</td>
                  <td className="border-b border-slate-100 py-1.5 font-mono">{c.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {section === 'equations' && (
          <div className="space-y-1.5">
            {subject.equations.map(e => (
              <div key={e.label.en} className="rounded-lg border bg-muted/20 px-2.5 py-2">
                <div className="text-[10px] text-muted-foreground">{e.label[lang]}</div>
                <div className="mt-0.5 overflow-x-auto whitespace-nowrap font-mono text-[12px] text-slate-900">
                  {e.formula}
                </div>
              </div>
            ))}
          </div>
        )}

        {section === 'ions' && (
          <div className="grid grid-cols-2 gap-1.5">
            {subject.ions.map(ion => (
              <div key={ion.formula} className="flex items-baseline justify-between rounded-lg border px-2.5 py-1.5">
                <span className="font-mono text-[12px] font-medium">{ion.formula}</span>
                <span className="text-[10px] text-muted-foreground">{ion.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
