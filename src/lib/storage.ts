// Images live in the public Supabase Storage bucket `images` and are served to
// browsers through our own domain (/api/img/...) because students cannot reach
// supabase.co from this network.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const BUCKET = 'images'

// Raster formats only — SVG can carry scripts and these are served publicly.
export const IMAGE_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}
export const MAX_IMAGE_BYTES = 1024 * 1024 // 1 MB

function randomName(ext: string) {
  return `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
}

/**
 * Store bytes and return a URL on our own domain. Anything over the limit is
 * shrunk to fit rather than rejected: neither the teacher pasting a screenshot
 * nor a PDF parser's full-resolution crop can do anything about the size, and a
 * slightly smaller diagram beats a missing one.
 */
export async function uploadImageBuffer(buf: Buffer, contentType: string): Promise<{ url?: string; error?: string }> {
  if (!IMAGE_EXT[contentType]) return { error: '只支持 PNG / JPG / WebP / GIF 图片' }
  if (buf.length > MAX_IMAGE_BYTES) {
    const shrunk = await shrinkImage(buf, contentType)
    if (!shrunk) return { error: `图片需小于 1MB，当前 ${Math.round(buf.length / 1024)}KB，自动压缩也压不下来` }
    buf = shrunk.buf
    contentType = shrunk.contentType
  }
  const ext = IMAGE_EXT[contentType]

  const name = randomName(ext)
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': contentType },
    body: new Uint8Array(buf),
  })
  if (!res.ok) return { error: '上传失败：' + (await res.text()).slice(0, 200) }
  return { url: `/api/img/${name}` }
}

/**
 * Copy a remote image (e.g. the CDN link a PDF parser handed back) into our own
 * storage. Without this the image would render for the teacher but break for
 * students, who cannot reach third-party hosts from this network.
 */
export async function importRemoteImage(url: string): Promise<{ url?: string; error?: string }> {
  try {
    const res = await fetch(url)
    if (!res.ok) return { error: `取图失败 HTTP ${res.status}` }
    const type = (res.headers.get('content-type') || '').split(';')[0].trim()
    return await uploadImageBuffer(Buffer.from(await res.arrayBuffer()), type)
  } catch (e: any) {
    return { error: '取图出错：' + (e?.message || e) }
  }
}

/**
 * Step an oversized image down until it fits. Tries smaller dimensions and
 * lower JPEG quality in turn; PNG input keeps a transparent palette as long as
 * it fits, then falls back to JPEG on white.
 */
async function shrinkImage(
  buf: Buffer,
  contentType: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  const sharp = (await import('sharp')).default
  const keepPng = contentType === 'image/png'
  for (const width of [1800, 1400, 1100, 800, 600]) {
    const resized = () => sharp(buf).resize({ width, withoutEnlargement: true })
    if (keepPng) {
      const png = await resized().png({ compressionLevel: 9, palette: true }).toBuffer()
      if (png.length <= MAX_IMAGE_BYTES) return { buf: png, contentType: 'image/png' }
    }
    for (const quality of [82, 70, 58]) {
      const jpg = await resized().flatten({ background: '#ffffff' }).jpeg({ quality }).toBuffer()
      if (jpg.length <= MAX_IMAGE_BYTES) return { buf: jpg, contentType: 'image/jpeg' }
    }
  }
  return null
}

/** True for images already on our domain (nothing to import). */
export function isLocalImage(url: string | null | undefined): boolean {
  return !!url && url.startsWith('/api/img/')
}
