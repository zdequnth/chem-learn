import { NextResponse } from 'next/server'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '(not set)'
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  return NextResponse.json({
    supabaseUrl: url,
    hasAnonKey: !!anonKey,
    anonKeyLen: anonKey?.length || 0,
    hasServiceKey: !!serviceKey,
    serviceKeyLen: serviceKey?.length || 0,
    serviceKeyStart: serviceKey ? serviceKey.substring(0, 20) + '...' : '(not set)',
  })
}
