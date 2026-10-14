import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { loadMockCourse, isAdminUser } from '@/lib/mock-source'
import { createSignedDownloadUrl } from '@/lib/storage'
import { mineruSubmit } from '@/lib/mineru'

export const maxDuration = 60

// POST { courseId, path } → { taskId }
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { courseId, path } = await request.json()
  if (!courseId) return NextResponse.json({ error: '缺少courseId' }, { status: 400 })
  if (typeof path !== 'string' || !path.startsWith('mineru-tmp/') || path.includes('..')) {
    return NextResponse.json({ error: '文件路径不合法' }, { status: 400 })
  }

  const { error, status } = await loadMockCourse(user.id, courseId, await isAdminUser())
  if (error) return NextResponse.json({ error }, { status: status || 400 })

  // Give MinerU a link to the uploaded PDF. Two hours is many times the longest
  // parse, and the link is dead long before anyone could find it.
  const signed = await createSignedDownloadUrl(path, 7200)
  if (!signed.url) return NextResponse.json({ error: signed.error || '签名下载地址生成失败' }, { status: 500 })

  // data_id is echoed back by MinerU and only allows [A-Za-z0-9_.-].
  const dataId = path.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 128)
  const { taskId, error: merr } = await mineruSubmit(signed.url, dataId)
  if (!taskId) return NextResponse.json({ error: merr || 'MinerU 提交失败' }, { status: 502 })

  return NextResponse.json({ taskId })
}
