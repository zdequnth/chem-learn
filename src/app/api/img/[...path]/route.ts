import { NextResponse } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BUCKET = 'images'

// Images are stored in Supabase Storage, but students' browsers cannot reach
// supabase.co from this network (it is only reachable through a proxy here), so
// an <img src="https://<ref>.supabase.co/..."> would simply be broken for them.
// Serving the bytes through our own domain fixes that, and because the path is
// content-addressed (a new name per upload) it can be cached forever.
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const key = (path || []).join('/')
  // Only ever read out of our own bucket — block traversal and absolute keys so
  // this cannot be turned into an open proxy.
  if (!key || key.includes('..') || key.startsWith('/') || key.includes(':')) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${key}`, {
    headers: { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}` },
  })
  if (!res.ok || !res.body) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': res.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  })
}
