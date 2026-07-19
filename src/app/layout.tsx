import type { Metadata } from 'next'
import './globals.css'
import 'katex/dist/katex.min.css'
import { AuthProvider } from './providers'
import { LangProvider } from '@/lib/i18n'

export const metadata: Metadata = {
  title: 'SelfPass - 自主通关学习平台',
  description: '游戏化精熟学习，一步一阶，自主通关',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        <LangProvider>
          <AuthProvider>{children}</AuthProvider>
        </LangProvider>
      </body>
    </html>
  )
}
