'use client'

// Lightweight, dependency-free feedback animation for the gate test.
// Renders a full-screen, non-interactive overlay of CSS-animated particles and
// unmounts as soon as the next question appears. Respects prefers-reduced-motion
// (see the .fx-* rules in globals.css).

const CONFETTI = ['#10b981', '#34d399', '#f59e0b', '#60a5fa', '#a78bfa', '#f472b6']

function burst(count: number, minDist: number, maxDist: number) {
  const items: { angle: number; d: number }[] = []
  for (let i = 0; i < count; i++) {
    items.push({
      angle: (360 / count) * i + (Math.random() * 16 - 8),
      d: minDist + Math.random() * (maxDist - minDist),
    })
  }
  return items
}

export default function AnswerFx({ kind, variant }: { kind: 'correct' | 'wrong'; variant: number }) {
  if (kind === 'correct') {
    if (variant % 2 === 0) {
      // confetti burst
      return (
        <div className="fx-layer" aria-hidden>
          {burst(28, 90, 190).map((p, i) => (
            <span
              key={i}
              className="fx-particle"
              style={{
                background: CONFETTI[i % CONFETTI.length],
                '--a': `${p.angle}deg`,
                '--d': `${p.d}px`,
                '--dur': `${700 + Math.random() * 350}ms`,
                '--delay': `${Math.random() * 90}ms`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      )
    }
    // sparkle burst + star
    return (
      <div className="fx-layer" aria-hidden>
        {burst(20, 40, 120).map((p, i) => (
          <span
            key={i}
            className="fx-particle"
            style={{
              background: i % 2 ? '#fbbf24' : '#34d399',
              width: 6, height: 6, borderRadius: '9999px',
              '--a': `${p.angle}deg`,
              '--d': `${p.d}px`,
              '--dur': `${600 + Math.random() * 300}ms`,
            } as React.CSSProperties}
          />
        ))}
        <span className="fx-pop text-5xl">🌟</span>
      </div>
    )
  }

  // wrong — neutral and encouraging (not discouraging)
  if (variant % 2 === 0) {
    return (
      <div className="fx-layer" aria-hidden>
        <span className="fx-pop flex items-center gap-2 text-3xl sm:text-4xl font-semibold text-sky-500/90">
          <span className="text-5xl">☁️</span> 再想想～
        </span>
      </div>
    )
  }
  return (
    <div className="fx-layer" aria-hidden>
      {burst(10, 0, 1).map((_, i) => (
        <span
          key={i}
          className="fx-dot"
          style={{
            background: 'rgba(96,165,250,.7)',
            left: `calc(50% + ${Math.round(Math.random() * 160 - 80)}px)`,
            top: '58%',
            '--dur': `${1100 + Math.random() * 500}ms`,
            '--delay': `${Math.random() * 200}ms`,
          } as React.CSSProperties}
        />
      ))}
      <span className="fx-pop text-3xl font-semibold text-sky-500/90">再试一次 💪</span>
    </div>
  )
}
