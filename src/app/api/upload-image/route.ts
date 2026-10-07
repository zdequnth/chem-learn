import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { uploadImageBuffer } from '@/lib/storage'

// The upload itself lives in src/lib/storage.ts so the mock-paper import can
// reuse it for images pulled from a PDF parser's CDN.
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: '没有收到文件' }, { status: 400 })

    const { url, error } = await uploadImageBuffer(Buffer.from(await file.arrayBuffer()), file.type)
    if (error || !url) return NextResponse.json({ error }, { status: 400 })
    return NextResponse.json({ url })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
