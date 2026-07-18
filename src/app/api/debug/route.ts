import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data: favs, error } = await supabaseAdmin('student_favorites', {
    query: '?limit=5&select=*',
  })
  return NextResponse.json({ favs, err: error?.message || null })
}
