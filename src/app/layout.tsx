import type { Metadata } from 'next'
import './globals.css'
import 'katex/dist/katex.min.css'
import { AuthProvider } from './providers'
import { RecoveryRedirect } from './recovery-redirect'

export const metadata: Metadata = {
  title: 'ChemLearn - 化学闯关学习平台',
  description: '游戏化通关式化学学习平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        <RecoveryRedirect />
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
