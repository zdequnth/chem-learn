import Link from 'next/link'

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
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-indigo-50">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-400 to-indigo-600 rounded-xl flex items-center justify-center text-xl">
                🔑
              </div>
              <span className="text-xl font-bold">SelfPass</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium transition-colors">
                登录
              </Link>
              <Link href="/login?signup=true" className="px-5 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-lg font-medium hover:from-purple-600 hover:to-indigo-700 transition-colors shadow-md">
                立即开始
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-16 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 border border-purple-200 rounded-full text-purple-700 text-sm font-medium mb-6">
            🔑 AI驱动的智能学习系统
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
              SelfPass
            </span>
            <br />
            <span className="text-3xl md:text-4xl">自主通关，让学习每一步都扎实</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            游戏化通关模式 + AI智能出题 + 即时反馈，涵盖语文、数学、英语、物理、化学、生物、二外、人文八大领域
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login?signup=true" className="px-8 py-4 bg-gradient-to-r from-purple-500 to-indigo-600 text-white rounded-xl font-semibold text-lg hover:from-purple-600 hover:to-indigo-700 transition-colors shadow-lg shadow-purple-200">
              开始闯关
            </Link>
            <Link href="#subjects" className="px-8 py-4 bg-white border rounded-xl font-semibold text-lg hover:border-input transition-colors shadow-sm">
              选择学科
            </Link>
          </div>
        </div>
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

      {/* Features */}
      <section id="features" className="py-20 px-4 max-w-3xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">学习流程</h2>
          <p className="text-muted-foreground text-lg">游戏化闯关，让学习不再枯燥</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {[
            { icon: '📚', title: '知识树', desc: '查看知识点清单和视频链接，系统学习每个概念' },
            { icon: '🎯', title: '关卡测试', desc: '连续答对7题或正确率≥90%即通关，答错3题锁定10分钟' },
          ].map((f, i) => (
            <div key={i} className="bg-card rounded-2xl p-8 shadow-sm border text-center">
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{f.title}</h3>
              <p className="text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Philosophy */}
      <section className="py-20 px-4 bg-gradient-to-r from-emerald-50 via-white to-emerald-50">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-sm font-medium text-emerald-600 mb-3 tracking-wide uppercase">教学理念</div>
          <h2 className="text-2xl font-bold mb-6">布鲁姆精熟学习理论</h2>
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

    </div>
  )
}
