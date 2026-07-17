import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  // Set 郑德群 as admin
  const { error } = await supabaseAdmin('profiles', {
    method: 'PATCH',
    body: { role: 'admin' },
    query: '?id=eq.35191d5b-aa3c-4d28-9242-a153fea9aea0',
  })
  return NextResponse.json({ ok: !error, error: error?.message || null })
}
