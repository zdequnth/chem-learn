import { supabaseAdmin } from '@/lib/admin'
import { NextResponse } from 'next/server'

export async function GET() {
  const { data } = await supabaseAdmin('profiles', {
    query: '?id=eq.35191d5b-aa3c-4d28-9242-a153fea9aea0&select=id,role,display_name',
  })
  return NextResponse.json(data)
}
