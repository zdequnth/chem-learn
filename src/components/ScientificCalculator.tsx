'use client'

import { useState } from 'react'
import { tr, type Lang } from '@/lib/i18n'

// A small recursive-descent evaluator. No eval(), so pasted text cannot run
// code; unknown characters simply produce "Error".
function tokenize(input: string): string[] {
  const s = input
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
  const tokens: string[] = []
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (/\s/.test(c)) { i++; continue }
    if (/[0-9.]/.test(c)) {
      let j = i
      while (j < s.length && /[0-9.]/.test(s[j])) j++
      tokens.push(s.slice(i, j))
      i = j
      continue
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i
      while (j < s.length && /[a-zA-Z]/.test(s[j])) j++
      tokens.push(s.slice(i, j).toLowerCase())
      i = j
      continue
    }
    if ('+-*/^()'.includes(c)) { tokens.push(c); i++; continue }
    throw new Error('bad character')
  }
  return tokens
}

function evaluate(input: string, deg: boolean): number {
  const tokens = tokenize(input)
  let pos = 0
  const peek = () => tokens[pos]
  const eat = (t?: string) => {
    if (t && tokens[pos] !== t) throw new Error('expected ' + t)
    return tokens[pos++]
  }

  const parsePrimary = (): number => {
    const t = peek()
    if (!t) throw new Error('unexpected end')
    if (t === '(') {
      pos++
      const v = parseExpr()
      eat(')')
      return v
    }
    if (/^[0-9.]+$/.test(t)) {
      pos++
      const n = Number(t)
      if (!Number.isFinite(n)) throw new Error('bad number')
      return n
    }
    if (t === 'pi') { pos++; return Math.PI }
    if (t === 'e') { pos++; return Math.E }
    if (['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'abs'].includes(t)) {
      pos++
      eat('(')
      const v = parseExpr()
      eat(')')
      if (t === 'sin') return Math.sin(deg ? v * Math.PI / 180 : v)
      if (t === 'cos') return Math.cos(deg ? v * Math.PI / 180 : v)
      if (t === 'tan') return Math.tan(deg ? v * Math.PI / 180 : v)
      if (t === 'log') return Math.log10(v)
      if (t === 'ln') return Math.log(v)
      if (t === 'sqrt') return Math.sqrt(v)
      return Math.abs(v)
    }
    throw new Error('unexpected ' + t)
  }

  const parseUnary = (): number => {
    if (peek() === '-') { pos++; return -parseUnary() }
    if (peek() === '+') { pos++; return parseUnary() }
    return parsePrimary()
  }

  const parseFactor = (): number => {
    let base = parseUnary()
    if (peek() === '^') {
      pos++
      base = Math.pow(base, parseFactor())
    }
    return base
  }

  const parseTerm = (): number => {
    let v = parseFactor()
    while (peek() === '*' || peek() === '/') {
      const op = eat()
      const r = parseFactor()
      v = op === '*' ? v * r : v / r
    }
    return v
  }

  const parseExpr = (): number => {
    let v = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const op = eat()
      const r = parseTerm()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  const value = parseExpr()
  if (pos !== tokens.length) throw new Error('leftover tokens')
  if (!Number.isFinite(value)) throw new Error('not finite')
  return value
}

function format(value: number): string {
  if (value === 0) return '0'
  if (Math.abs(value) >= 1e12 || Math.abs(value) < 1e-9) return value.toExponential(6)
  return String(Number(value.toPrecision(12)))
}

const KEYS: { label: string; value: string; kind?: 'op' | 'fn' | 'eq' | 'clear' }[][] = [
  [
    { label: 'AC', value: 'AC', kind: 'clear' },
    { label: '⌫', value: 'BACK' },
    { label: '(', value: '(' },
    { label: ')', value: ')' },
  ],
  [
    { label: 'sin', value: 'sin(' }, { label: 'cos', value: 'cos(' }, { label: 'tan', value: 'tan(' },
    { label: '÷', value: '÷', kind: 'op' },
  ],
  [
    { label: 'log', value: 'log(' }, { label: 'ln', value: 'ln(' }, { label: '√', value: 'sqrt(' },
    { label: '×', value: '×', kind: 'op' },
  ],
  [
    { label: '7', value: '7' }, { label: '8', value: '8' }, { label: '9', value: '9' },
    { label: '−', value: '-', kind: 'op' },
  ],
  [
    { label: '4', value: '4' }, { label: '5', value: '5' }, { label: '6', value: '6' },
    { label: '+', value: '+', kind: 'op' },
  ],
  [
    { label: '1', value: '1' }, { label: '2', value: '2' }, { label: '3', value: '3' },
    { label: '=', value: '=', kind: 'eq' },
  ],
  [
    { label: '0', value: '0' }, { label: '.', value: '.' }, { label: 'x²', value: '^2' },
    { label: 'xʸ', value: '^', kind: 'op' },
  ],
  [
    { label: 'π', value: 'π' }, { label: 'e', value: 'e' }, { label: '±', value: 'SIGN' },
    { label: '%', value: '/100' },
  ],
]

export default function ScientificCalculator({ lang }: { lang: Lang }) {
  const [expr, setExpr] = useState('')
  const [result, setResult] = useState('')
  const [deg, setDeg] = useState(true)
  const [justEvaluated, setJustEvaluated] = useState(false)

  const append = (value: string) => {
    if (value === 'AC') {
      setExpr(''); setResult(''); setJustEvaluated(false); return
    }
    if (value === 'BACK') {
      setExpr(e => e.slice(0, -1)); setResult(''); setJustEvaluated(false); return
    }
    if (value === 'SIGN') {
      setExpr(e => e.startsWith('-(') && e.endsWith(')') ? e.slice(2, -1) : `-(${e || '0'})`)
      setResult(''); setJustEvaluated(false); return
    }
    if (value === '=') {
      try {
        setResult(format(evaluate(expr, deg)))
      } catch {
        setResult(tr(lang, '错误', 'Error'))
      }
      setJustEvaluated(true)
      return
    }
    const isOperator = ['+', '-', '×', '÷', '^'].includes(value)
    setExpr(e => {
      if (justEvaluated) {
        if (isOperator && result && result !== '错误' && result !== 'Error') return result + value
        return value
      }
      return e === '错误' || e === 'Error' ? value : e + value
    })
    setResult('')
    setJustEvaluated(false)
  }

  return (
    <div className="p-3">
      <div className="mb-2 rounded-lg border bg-muted/30 p-2">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{tr(lang, '科学计算器', 'Scientific calculator')}</span>
          <button
            type="button"
            onClick={() => setDeg(d => !d)}
            className="rounded border bg-white px-1.5 py-0.5 text-[10px] font-medium hover:bg-gray-50"
          >
            {deg ? 'DEG' : 'RAD'}
          </button>
        </div>
        <div className="mt-1 min-h-[22px] overflow-x-auto whitespace-nowrap text-right font-mono text-base">
          {expr || '0'}
        </div>
        <div className="min-h-[18px] text-right font-mono text-xs text-emerald-700">
          {result ? `= ${result}` : ''}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {KEYS.flat().map((key, i) => (
          <button
            key={`${key.label}-${i}`}
            type="button"
            onClick={() => append(key.value)}
            className={`h-9 rounded-lg border text-sm font-medium transition-colors ${
              key.kind === 'eq'
                ? 'bg-emerald-500 text-white border-emerald-500 hover:bg-emerald-600'
                : key.kind === 'clear'
                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                  : key.kind === 'op'
                    ? 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    : key.kind === 'fn'
                      ? 'bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100'
                      : 'bg-white hover:bg-gray-50'
            }`}
          >
            {key.label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground">
        {tr(lang, '支持 + − × ÷、括号、幂、sin/cos/tan、log/ln、√、π、e。', 'Supports + − × ÷, brackets, powers, sin/cos/tan, log/ln, √, π and e.')}
      </p>
    </div>
  )
}
