// MinerU cloud parsing (standard API). Given a URL to a PDF it returns a zip of
// full.md plus one image file per extracted figure — the real text layer and the
// real figure crops, which is exactly what the browser-screenshot route has to
// guess at. The work is async: submit, poll, download.
import { unzipSync } from 'fflate'

const BASE = 'https://mineru.net/api/v4'

const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

export function mimeForImage(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || ''
  return MIME_BY_EXT[ext] || 'image/png'
}

// Business endpoints answer {code:0,data,msg}; the gateway answers
// {success:false,msgCode,msg}. Both shapes carry the failure, so both are read.
const ERR_ZH: Record<string, string> = {
  A0202: 'MinerU token 无效。请到 mineru.net/apiManage/token 重新生成，更新 .env.local 和 Vercel 的 MINERU_API_KEY，再 Redeploy',
  A0211: 'MinerU token 已过期（有效期 90 天，不能续期）。请到 mineru.net/apiManage/token 重新生成，更新 .env.local 和 Vercel 的 MINERU_API_KEY，再 Redeploy',
  '-500': 'MinerU 参数错误',
  '-60005': 'PDF 太大（上限 200MB）',
  '-60006': 'PDF 页数太多（上限 200 页）',
  '-60008': 'MinerU 取不到这份文件（下载地址不可达）',
  '-60010': 'MinerU 解析失败',
  '-60018': 'MinerU 今日免费额度已用完（1000 页/天），明天再试，或改用「本地转图片」',
  '-60022': 'MinerU 网页读取失败（被限流）',
}

function envelope(body: any): { data?: any; error?: string } {
  if (!body || typeof body !== 'object') return { error: 'MinerU 返回了空响应' }
  if (body.success === false) {
    const code = String(body.msgCode ?? '')
    return { error: ERR_ZH[code] || `MinerU 认证失败：${body.msg || code || '未知原因'}` }
  }
  if (typeof body.code === 'number' && body.code !== 0) {
    const code = String(body.code)
    return { error: ERR_ZH[code] || `MinerU 出错：${body.msg || code}` }
  }
  return { data: body.data }
}

function apiKey(): string | null {
  return process.env.MINERU_API_KEY || null
}

/** Hand MinerU a URL to parse. Returns the task id to poll. */
export async function mineruSubmit(fileUrl: string, dataId: string): Promise<{ taskId?: string; error?: string }> {
  const key = apiKey()
  if (!key) return { error: '未配置 MINERU_API_KEY（请在 MinerU 账号里生成 token 并填进环境变量）' }
  try {
    const res = await fetch(`${BASE}/extract/task`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: fileUrl,
        model_version: 'vlm',
        is_ocr: true,
        enable_formula: true,
        enable_table: true,
        language: 'ch',
        data_id: dataId,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    // Parse before the status check: a bad token answers HTTP 401 with a body
    // that says exactly that, and "token 无效" beats "HTTP 401".
    const e = envelope(await res.json().catch(() => null))
    if (e.error) return { error: e.error }
    if (!res.ok) return { error: `MinerU 提交失败 HTTP ${res.status}` }
    const taskId = e.data?.task_id
    if (typeof taskId !== 'string' || !taskId) return { error: 'MinerU 提交后没有返回 task_id' }
    return { taskId }
  } catch (err: any) {
    return { error: 'MinerU 提交出错：' + (err?.message || err) }
  }
}

/** Poll one task. `state` is pending / running / converting / done / failed. */
export async function mineruTask(taskId: string): Promise<{ state?: string; zipUrl?: string; errMsg?: string; error?: string }> {
  const key = apiKey()
  if (!key) return { error: '未配置 MINERU_API_KEY' }
  try {
    const res = await fetch(`${BASE}/extract/task/${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(30_000),
    })
    const e = envelope(await res.json().catch(() => null))
    if (e.error) return { error: e.error }
    if (!res.ok) return { error: `MinerU 查询失败 HTTP ${res.status}` }
    const d = e.data || {}
    return {
      state: d.state ? String(d.state) : undefined,
      zipUrl: typeof d.full_zip_url === 'string' ? d.full_zip_url : undefined,
      errMsg: typeof d.err_msg === 'string' ? d.err_msg : undefined,
    }
  } catch (err: any) {
    return { error: 'MinerU 查询出错：' + (err?.message || err) }
  }
}

export async function downloadZip(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(50_000) })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch {
    return null
  }
}

/** full.md + the figure files out of MinerU's result zip. */
export function unzipMarkdownAndImages(buf: Buffer): { markdown: string; images: { name: string; buf: Buffer }[] } {
  const files = unzipSync(new Uint8Array(buf))
  const dec = new TextDecoder('utf-8')
  let markdown = ''
  const images: { name: string; buf: Buffer }[] = []
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue
    const lower = name.toLowerCase()
    if (lower.endsWith('.md')) {
      // The zip may hold several .md files; full.md is the one that matters.
      if (!markdown || /(^|\/)full\.md$/.test(lower)) markdown = dec.decode(data)
    } else if (/\.(png|jpe?g|webp|gif)$/.test(lower)) {
      images.push({ name, buf: Buffer.from(data) })
    }
  }
  return { markdown, images }
}

/** The image targets the markdown actually points at, e.g. "images/abc.jpg". */
export function referencedImageNames(markdown: string): Set<string> {
  const names = new Set<string>()
  const re = /!\[[^\]]*\]\(\s*([^)\s]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown))) names.add(m[1])
  return names
}

export function basename(name: string): string {
  return name.replace(/\/+$/, '').split('/').pop() || name
}

/**
 * Swap each ![](images/x.jpg) for the URL the figure now lives at. Matches on
 * the bare filename, so ./images/x.jpg and images/x.jpg both resolve. An image
 * with no stored URL is left as-is rather than blanked — the question survives.
 */
export function rewriteImageRefs(markdown: string, byName: Map<string, string>): string {
  return markdown.replace(/(!\[[^\]]*\]\()\s*([^)\s]+)([^)]*\))/g, (whole: string, open: string, target: string, rest: string) => {
    const url = byName.get(target) || byName.get(target.replace(/^\.?\//, '')) || byName.get(basename(target))
    return url ? `${open}${url}${rest}` : whole
  })
}
