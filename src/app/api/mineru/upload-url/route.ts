import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { createSignedUploadUrl } from '@/lib/storage'
import { bilingualError } from '@/app/api/_lib/error-message'
import { randomUUID } from 'crypto'

// Mint a URL for the browser to PUT the PDF to. The file never passes through
// this function — see storage.ts for why that matters.
export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in（请先登录）' }, { status: 401 })

  const path = `mineru-tmp/${randomUUID()}.pdf`
  const { url, error } = await createSignedUploadUrl(path)
  if (!url) return NextResponse.json({ error: error ? bilingualError(error) : 'Failed to generate signed upload URL（签名上传地址生成失败）' }, { status: 500 })
  return NextResponse.json({ path, uploadUrl: url })
}
