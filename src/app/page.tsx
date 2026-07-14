import Link from 'next/link'

export default function HomePage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-blue-50">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-md border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-xl flex items-center justify-center text-xl">
                🧪
              </div>
              <span className="text-xl font-bold">ChemLearn</span>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium transition-colors">
                登录
              </Link>
              <Link href="/login?signup=true" className="px-5 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-lg font-medium hover:from-emerald-600 hover:to-emerald-700 transition-colors shadow-md">
                立即开始
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 border border-emerald-200 rounded-full text-emerald-700 text-sm font-medium mb-6">
            ✨ AI驱动的智能出题系统
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 leading-tight">
            <span className="bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent">
              化学闯关
            </span>
            <br />
            <span>让学习变得有趣</span>
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            游戏化通关模式 + AI智能出题 + 即时反馈，学生在闯关中掌握化学知识！
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/login?signup=true" className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white rounded-xl font-semibold text-lg hover:from-emerald-600 hover:to-emerald-700 transition-colors shadow-lg shadow-emerald-200">
              开始闯关
            </Link>
            <Link href="#features" className="px-8 py-4 bg-white border rounded-xl font-semibold text-lg hover:border-input transition-colors shadow-sm">
              了解更多
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">学习流程</h2>
          <p className="text-muted-foreground text-lg">游戏化闯关，让化学学习不再枯燥</p>
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
