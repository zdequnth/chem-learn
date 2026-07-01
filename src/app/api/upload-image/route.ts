import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

    // Convert to base64 data URL (stored directly in DB for simplicity)
    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const base64 = `data:${file.type};base64,${buffer.toString('base64')}`

    // Limit size to ~500KB for DB storage
    if (base64.length > 700000) {
      return NextResponse.json({ error: '图片过大，请用小于500KB的图片' }, { status: 400 })
    }

    return NextResponse.json({ url: base64 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
