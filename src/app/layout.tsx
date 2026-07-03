import type { Metadata } from 'next'
import './globals.css'
import 'katex/dist/katex.min.css'
import { AuthProvider } from './providers'

export const metadata: Metadata = {
  title: 'ChemLearn - 化学闯关学习平台',
  description: '游戏化通关式化学学习平台',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var h = window.location.hash;
            if (h && (h.indexOf('type=recovery')!==-1 || h.indexOf('access_token')!==-1)) {
              if (window.location.pathname.indexOf('/auth/update-password')===-1) {
                window.location.replace('/auth/update-password' + h);
              }
            }
          })();
        `}} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased" suppressHydrationWarning>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  )
}
