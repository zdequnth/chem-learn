import { createAdminClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const admin = createAdminClient()
  const test1 = await admin.from('courses').select('id').limit(1)
  const test2 = await admin.auth.getSession()
  return NextResponse.json({
    test1Data: test1.data,
    test1Error: test1.error ? (test1.error.message || JSON.stringify(test1.error)) : null,
    test2HasSession: !!test2.data?.session,
  })
}
