import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'images'
const MAX_BYTES = 1024 * 1024 // 1 MB

// Raster formats only — SVG can carry scripts, and these images are served from
// a public bucket.
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// Images live in Supabase Storage, not in the database. Keeping them out of
// `image_url`/`explanation` means page payloads stay small (a base64 blob used
// to be re-sent on every request, uncached) and the 500 MB database quota is
// left to actual content. Callers only ever see `{ url }`, so nothing else
// changes.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '没有收到文件' }, { status: 400 })

    const ext = EXT[file.type]
    if (!ext) return NextResponse.json({ error: '只支持 PNG / JPG / WebP / GIF 图片' }, { status: 400 })
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: `图片需小于 1MB，当前 ${Math.round(file.size / 1024)}KB` }, { status: 400 })
    }

    const name = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'apikey': SERVICE_KEY,
        'Content-Type': file.type,
      },
      body: Buffer.from(await file.arrayBuffer()),
    })
    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json({ error: '上传失败：' + text.slice(0, 200) }, { status: 500 })
    }

    // Hand back a path on our own domain, not the raw Storage URL — see
    // /api/img/[...path] for why (students cannot reach supabase.co directly).
    // The bucket is implied by /api/img, so the path must NOT repeat it: the
    // route joins what follows /api/img into a key inside BUCKET, and a
    // duplicated "images/" turned every upload into a 404.
    return NextResponse.json({ url: `/api/img/${name}` })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
