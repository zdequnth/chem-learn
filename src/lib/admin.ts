const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function supabaseAdmin(table: string, options: {
  method?: string; body?: any; query?: string
}) {
  const { method = 'GET', body, query = '' } = options
  const url = `${SUPABASE_URL}/rest/v1/${table}${query}`
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'apikey': SERVICE_KEY,
    'Content-Type': 'application/json',
  }
  if (method === 'PATCH' || method === 'POST') {
    headers['Prefer'] = 'return=representation'
  }

  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) {
    const text = await res.text()
    return { error: { message: text }, data: null }
  }
  // DELETE succeeds with a 204 and an empty body; calling res.json() on it would
  // throw and break the whole request. Treat any empty body as "no data".
  if (res.status === 204) return { data: null, error: null }
  const text = await res.text()
  if (!text) return { data: null, error: null }
  try {
    return { data: JSON.parse(text), error: null }
  } catch {
    return { data: null, error: null }
  }
}
