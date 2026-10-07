import type { CourseKind } from './types'

// Three course types, three colours. Tailwind v4's JIT cannot see class names
// that are built by concatenating strings, so every value here must be a
// complete literal.
export interface KindTheme {
  label: string        // 过关课程
  emoji: string        // 🧪
  blurb: string        // one-line description for the picker
  iconTile: string     // the big rounded emoji tile on a course card
  pill: string         // the small type badge
  solid: string        // selected state of the type picker
  button: string       // secondary action button / link
  banner: string       // full-width banner on the course detail page
  text: string         // accent text colour
  chip: string         // analystics / list chips
}

export const KIND_THEME: Record<CourseKind, KindTheme> = {
  gate: {
    label: '过关课程',
    emoji: '🧪',
    blurb: '上新课时用：一章节、一课时地过关',
    iconTile: 'bg-gradient-to-br from-emerald-100 to-emerald-200',
    pill: 'bg-emerald-50 text-emerald-700',
    solid: 'bg-emerald-500 border-emerald-500 text-white',
    button: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
    banner: 'bg-emerald-50 border-emerald-200 text-emerald-800',
    text: 'text-emerald-700',
    chip: 'bg-emerald-50 text-emerald-700',
  },
  vocab: {
    label: '背单词课程',
    emoji: '📖',
    blurb: '按课时背专业词汇，卡片 + 发音 + 测验',
    iconTile: 'bg-gradient-to-br from-amber-100 to-amber-200',
    pill: 'bg-amber-100 text-amber-800',
    solid: 'bg-amber-500 border-amber-500 text-white',
    button: 'bg-amber-50 text-amber-700 hover:bg-amber-100',
    banner: 'bg-amber-50 border-amber-200 text-amber-800',
    text: 'text-amber-700',
    chip: 'bg-amber-50 text-amber-700',
  },
  mock: {
    label: '模拟考课程',
    emoji: '📝',
    blurb: '考前一两个月冲刺：限时做完整套题',
    iconTile: 'bg-gradient-to-br from-violet-100 to-violet-200',
    pill: 'bg-violet-100 text-violet-800',
    solid: 'bg-violet-500 border-violet-500 text-white',
    button: 'bg-violet-50 text-violet-700 hover:bg-violet-100',
    banner: 'bg-violet-50 border-violet-200 text-violet-800',
    text: 'text-violet-700',
    chip: 'bg-violet-50 text-violet-700',
  },
}

export function kindTheme(kind?: string | null): KindTheme {
  return KIND_THEME[(kind as CourseKind) ?? 'gate'] ?? KIND_THEME.gate
}
