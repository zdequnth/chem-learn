'use client'

import { useState } from 'react'
import type { Lang } from '@/lib/i18n'
import {
  CATEGORY_LABEL, CATEGORY_STYLE, ELEMENTS, ELEMENT_BY_Z,
  type Element,
} from '@/lib/periodic-table'

export default function PeriodicTable({ lang }: { lang: Lang }) {
  const [selected, setSelected] = useState<Element>(ELEMENT_BY_Z.get(1)!)

  const t = (zh: string, en: string) => (lang === 'zh' ? zh : en)

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div
          className="grid gap-[2px]"
          style={{
            gridTemplateColumns: 'repeat(18, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(10, 30px)',
            minWidth: 560,
          }}
        >
          {ELEMENTS.map(el => (
            <button
              key={el.z}
              type="button"
              title={`${el.sym} · ${el.name} · ${el.mass}`}
              aria-label={`${el.sym} ${el.name}`}
              aria-pressed={selected.z === el.z}
              onClick={() => setSelected(el)}
              style={{ gridColumn: el.group, gridRow: el.row }}
              className={`flex flex-col items-center justify-center rounded border leading-none transition-transform hover:scale-105 ${CATEGORY_STYLE[el.category]} ${
                selected.z === el.z ? 'ring-2 ring-slate-700 ring-offset-1' : ''
              }`}
            >
              <span className="text-[7px] opacity-70">{el.z}</span>
              <span className="text-[11px] font-bold">{el.sym}</span>
            </button>
          ))}

          {/* f-block markers in the main table */}
          <div style={{ gridColumn: 3, gridRow: 6 }} className="pointer-events-none flex items-center justify-center rounded border border-dashed border-slate-300 text-[8px] text-slate-500">
            57–71
          </div>
          <div style={{ gridColumn: 3, gridRow: 7 }} className="pointer-events-none flex items-center justify-center rounded border border-dashed border-slate-300 text-[8px] text-slate-500">
            89–103
          </div>
          <div style={{ gridColumn: '1 / span 2', gridRow: 9 }} className="pointer-events-none flex items-center justify-end pr-1 text-[9px] text-slate-500">
            {t('镧系', 'La–Lu')}
          </div>
          <div style={{ gridColumn: '1 / span 2', gridRow: 10 }} className="pointer-events-none flex items-center justify-end pr-1 text-[9px] text-slate-500">
            {t('锕系', 'Ac–Lr')}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px] text-muted-foreground">
        {(Object.keys(CATEGORY_LABEL) as (keyof typeof CATEGORY_LABEL)[]).map(key => (
          <span key={key} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${CATEGORY_STYLE[key]}`} />
            {CATEGORY_LABEL[key][lang]}
          </span>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/30 p-2.5 text-xs">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold">{selected.sym}</span>
          <span className="font-medium">{selected.name}</span>
          <span className="text-muted-foreground">Z = {selected.z}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-muted-foreground">
          <span>{t('相对原子质量', 'Relative atomic mass')}: <b className="text-foreground">{selected.mass}</b></span>
          <span>{t('类别', 'Category')}: <b className="text-foreground">{CATEGORY_LABEL[selected.category][lang]}</b></span>
        </div>
      </div>
    </div>
  )
}
