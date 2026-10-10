'use client'

import Link from 'next/link'
import { useLang, t } from '@/lib/i18n'

const subjects = [
  { key: 'Chinese', name: 'Chinese', icon: '📖', color: 'from-red-400 to-red-600', bg: 'bg-red-50 border-red-200' },
  { key: 'Math', name: 'Math', icon: '📐', color: 'from-blue-400 to-blue-600', bg: 'bg-blue-50 border-blue-200' },
  { key: 'English', name: 'English', icon: '🌍', color: 'from-indigo-400 to-indigo-600', bg: 'bg-indigo-50 border-indigo-200' },
  { key: 'Second foreign Language', name: '2nd Language', icon: '🗣️', color: 'from-teal-400 to-teal-600', bg: 'bg-teal-50 border-teal-200' },
  { key: 'Physics', name: 'Physics', icon: '⚛️', color: 'from-amber-400 to-amber-600', bg: 'bg-amber-50 border-amber-200' },
  { key: 'Chemistry', name: 'Chemistry', icon: '🧪', color: 'from-emerald-400 to-emerald-600', bg: 'bg-emerald-50 border-emerald-200' },
  { key: 'Biology', name: 'Biology', icon: '🧬', color: 'from-green-400 to-green-600', bg: 'bg-green-50 border-green-200' },
  { key: 'Humanities', name: 'Humanities', icon: '📜', color: 'from-violet-400 to-violet-600', bg: 'bg-violet-50 border-violet-200' },
]

export default function HomePage() {
  const { lang, setLang } = useLang()
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-600 rounded-xl flex items-center justify-center text-xl">🔑</div>
              <span className="text-xl font-bold">SelfPass</span>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
                className="px-2 py-1 text-xs border rounded hover:bg-accent transition-colors">🌐 {lang === 'zh' ? 'EN' : '中文'}</button>
              <Link href="/login" className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium transition-colors">{t('login', lang)}</Link>
              <Link href="/login?signup=true" className="px-5 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-indigo-700 transition-colors shadow-md">{t('startNow', lang)}</Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 border border-purple-200 rounded-full text-purple-700 text-sm font-medium mb-6">
            {lang === 'zh' ? '🔑 AI驱动的智能学习系统' : '🔑 AI-Powered Learning System'}
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              SelfPass
            </span>
            <br />
            <span className="text-3xl md:text-4xl">{lang === 'zh' ? '自主通关，让学习每一步都扎实' : 'Master each step, build real confidence'}</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            {lang === 'zh' ? '游戏化通关模式 + AI智能出题 + 即时反馈，涵盖语文、数学、英语、物理、化学、生物、二外、人文八大领域' : 'Game-based mastery + AI-powered questions + instant feedback across 8 subjects'}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login?signup=true" className="px-8 py-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold text-lg hover:from-purple-600 hover:to-indigo-700 transition-colors shadow-lg shadow-purple-200">
              {lang === 'zh' ? '开始闯关' : 'Start Now'}
            </Link>
            <Link href="#subjects" className="px-8 py-4 bg-white border rounded-xl font-semibold text-lg hover:border-input transition-colors shadow-sm">
              {lang === 'zh' ? '选择学科' : 'Choose Subject'}
            </Link>
          </div>
        </div>
      </section>

      {/* The three course types. Above the subject grid because this is how the
          platform is organised — the subject is just where you start.
          These state the IDEA behind each mode rather than its mechanics. */}
      <section id="modes" className="py-14 px-4 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">三种课程，对应学习的三个阶段</h2>
          <p className="text-muted-foreground">同一个平台，三套不同的练法</p>
        </div>
        {/* Podium: the gate course stands in the middle and taller, the other two
            flank it a step lower. Mobile keeps source order, so the core course
            still comes first there. */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
          {[
            {
              icon: '🧪', name: '通关课程', tag: '核心', when: '上新课',
              shell: 'bg-emerald-50 border-emerald-300 md:order-2',
              height: 'md:min-h-[300px] md:py-10',
              title: 'text-emerald-900 font-bold', lead: 'text-emerald-900 font-semibold',
              leadText: '不掌握，不前进。',
              desc: '学完一个知识点、确认真正掌握，才解锁下一个。把"似懂非懂"挡在门外，不让基础漏洞一路累积。',
              feature: true,
            },
            {
              icon: '📖', name: '背单词课程', tag: '', when: '日常积累',
              shell: 'bg-amber-50 border-amber-200 md:order-1',
              height: 'md:min-h-[250px]',
              title: 'text-amber-800 font-semibold', lead: 'font-medium',
              leadText: '先过词汇关。',
              desc: '用英文授课的学科，专业词汇才是真正的门槛。把每一课的词汇练到能听、能写、能用。',
            },
            {
              icon: '📝', name: '模拟考课程', tag: '', when: '考前冲刺',
              shell: 'bg-violet-50 border-violet-200 md:order-3',
              height: 'md:min-h-[250px]',
              title: 'text-violet-800 font-semibold', lead: 'font-medium',
              leadText: '用整套题检验自己。',
              desc: '平时刷题测不出真实水平。限时做完整套题，交卷后每道错题都能定位回它属于哪一课。',
            },
          ].map(m => (
            <div key={m.name}
              className={`rounded-2xl border p-6 transition-all duration-200 flex flex-col ${m.shell} ${m.height} ${
                m.feature ? 'shadow-md hover:shadow-xl hover:-translate-y-1' : 'hover:shadow-md'}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={m.feature ? 'text-4xl' : 'text-3xl'}>{m.icon}</span>
                {m.tag && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-white font-medium">核心</span>
                )}
              </div>
              <div className={`text-lg ${m.title}`}>{m.name}</div>
              <div className="text-xs text-muted-foreground mb-3">{m.when}</div>
              {/* sits at the bottom so the three cards read as one podium row */}
              <div className="mt-auto">
                <p className={`text-sm mb-1.5 ${m.lead}`}>{m.leadText}</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{m.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Philosophy — the reason the gate courses are shaped the way they are, so
          it comes before the subject grid and the flow. */}
      <section className="py-20 px-4 bg-gradient-to-r from-emerald-50 via-white to-emerald-50">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-sm font-medium text-emerald-600 mb-3 tracking-wide uppercase">教学理念</div>
          <h2 className="text-2xl font-bold mb-6">通关课程——布鲁姆精熟学习理论</h2>
          <p className="text-lg text-muted-foreground leading-relaxed mb-8">
            必须完全掌握当前知识点、达标通过后，才能解锁下一课时。
            不允许盲目跳进度，杜绝似懂非懂、基础漏洞不断累积。
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="text-2xl mb-2">🎯</div>
              <h4 className="font-semibold mb-1 text-foreground">精准达标</h4>
              <p>连续答对 7 题或正确率 ≥ 90% 方可通过，确保真正掌握</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="text-2xl mb-2">🔒</div>
              <h4 className="font-semibold mb-1 text-foreground">阶梯解锁</h4>
              <p>通过当前课时才能解锁下一课，杜绝跨步跳进度</p>
            </div>
            <div className="bg-white rounded-xl p-6 shadow-sm border">
              <div className="text-2xl mb-2">📊</div>
              <h4 className="font-semibold mb-1 text-foreground">漏洞清零</h4>
              <p>答错自动记入错题本，针对性复习直到完全掌握</p>
            </div>
          </div>
        </div>
      </section>


      {/* The whole journey: accumulate vocabulary, master the course lesson by
          lesson, then hold it together under exam conditions. The middle two
          boxes are one stage — 知识树 and 关卡测试 both belong to the gate course —
          so they share a background and a tag. */}
      <section id="flow" className="py-20 px-4 max-w-5xl mx-auto">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold mb-4">学习流程</h2>
          <p className="text-muted-foreground text-lg">先背单词打底，再一关关过课，最后整套模拟考检验</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: '📖', title: '背单词', tag: '背单词课程', tagCls: 'bg-amber-100 text-amber-800', box: 'bg-amber-50 border-amber-200',
              desc: '按课时背专业词汇，卡片 + 发音 + 测验，日常积累打底' },
            { icon: '📚', title: '知识树', tag: '通关课程', tagCls: 'bg-emerald-100 text-emerald-800', box: 'bg-emerald-50 border-emerald-200',
              desc: '查看知识点清单和视频链接，系统学习每个概念' },
            { icon: '🎯', title: '关卡测试', tag: '通关课程', tagCls: 'bg-emerald-100 text-emerald-800', box: 'bg-emerald-50 border-emerald-200',
              desc: '连续答对7题或正确率≥90%即通关，答错3题锁定10分钟' },
            { icon: '📝', title: '模拟考', tag: '模拟考课程', tagCls: 'bg-violet-100 text-violet-800', box: 'bg-violet-50 border-violet-200',
              desc: '考前一两个月冲刺：限时做完整套题，看真实水平' },
          ].map((f) => (
            <div key={f.title} className={`rounded-2xl p-6 border shadow-sm text-center flex flex-col ${f.box}`}>
              <div className="text-4xl mb-3">{f.icon}</div>
              <span className={`self-center text-[11px] px-2 py-0.5 rounded-full font-medium mb-2 ${f.tagCls}`}>{f.tag}</span>
              <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          中间两块同属<b>通关课程</b>：先在知识树里学，再到关卡测试里过关，过了才解锁下一课。
        </p>
      </section>
      {/* Subjects Grid */}
      <section id="subjects" className="py-12 px-4 max-w-5xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-2xl font-bold mb-2">选择学科</h2>
          <p className="text-muted-foreground">涵盖八大领域，找到你的学习方向</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {subjects.map(s => (
            <Link key={s.key} href={`/login?signup=true`}
              className={`${s.bg} border rounded-2xl p-6 text-center hover:shadow-lg hover:-translate-y-1 transition-all group`}>
              <div className="text-4xl mb-3">{s.icon}</div>
              <h3 className={`font-semibold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.name}</h3>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
