import { createClient } from '@supabase/supabase-js'

export function getSupabaseForRequest(req) {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim()
  // The anon key is public by design. Vercel Preview may have only the VITE_
  // alias configured for the browser bundle, so reuse it as a server fallback.
  // Never use a service-role/secret key for this user-scoped client.
  const anonKey = (process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '').trim()

  if (!url || !anonKey) {
    throw new Error('Missing Supabase environment variables.')
  }

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error()
    }
  } catch {
    throw new Error('SUPABASE_URL is not a valid project URL.')
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7)
    : null

  if (!token) {
    const error = new Error('Missing bearer token')
    error.status = 401
    throw error
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    },
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  })

  return { supabase, token }
}
