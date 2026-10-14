import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { uploadImageBuffer, deleteStoredObject } from '@/lib/storage'
import {
  mineruTask, downloadZip, unzipMarkdownAndImages,
  referencedImageNames, rewriteImageRefs, basename, mimeForImage,
} from '@/lib/mineru'

export const maxDuration = 60

// GET ?taskId=&path= → { state } while it runs, { state:'done', markdown } when
// the paper is ready. The client polls this; the download-unzip-upload below is
// the only slow part, and it happens exactly once, on the poll that sees "done".
export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const taskId = searchParams.get('taskId') || ''
  const path = searchParams.get('path') || ''
  if (!taskId) return NextResponse.json({ error: '缺少taskId' }, { status: 400 })
  if (!path.startsWith('mineru-tmp/') || path.includes('..')) {
    return NextResponse.json({ error: '文件路径不合法' }, { status: 400 })
  }

  const task = await mineruTask(taskId)
  if (task.error) return NextResponse.json({ error: task.error }, { status: 502 })

  if (task.state === 'failed') {
    await deleteStoredObject(path)
    return NextResponse.json({ state: 'failed', error: task.errMsg || 'MinerU 解析失败' })
  }
  if (task.state !== 'done' || !task.zipUrl) {
    return NextResponse.json({ state: task.state || 'pending' })
  }

  const zip = await downloadZip(task.zipUrl)
  if (!zip) return NextResponse.json({ error: '结果压缩包下载失败' }, { status: 502 })
  const { markdown, images } = unzipMarkdownAndImages(zip)
  if (!markdown) return NextResponse.json({ error: '解析结果里没有 Markdown' }, { status: 502 })

  // Only the figures the markdown actually references get stored. A result zip
  // can carry decorative images and per-page previews, and uploading those would
  // be pure waste.
  const refs = referencedImageNames(markdown)
  const byBase = new Map(images.map((img) => [basename(img.name), img]))
  const byName = new Map<string, string>()
  for (const ref of refs) {
    const base = basename(ref)
    if (byName.has(base)) continue
    const img = byBase.get(base)
    if (!img) continue
    const up = await uploadImageBuffer(img.buf, mimeForImage(img.name))
    if (!up.url) continue
    // Register every spelling the markdown might use, including the bare name.
    byName.set(base, up.url)
    byName.set(img.name, up.url)
    byName.set('./' + img.name, up.url)
    byName.set(ref, up.url)
  }

  const out = rewriteImageRefs(markdown, byName)
  await deleteStoredObject(path)
  return NextResponse.json({ state: 'done', markdown: out, images: byName.size > 0 ? new Set(byName.values()).size : 0 })
}
