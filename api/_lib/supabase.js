import { createClient } from '@supabase/supabase-js'

export function getSupabaseForRequest(req) {
  const url = process.env.SUPABASE_URL
  const anonKey = process.env.SUPABASE_ANON_KEY

  if (!url || !anonKey) {
    throw new Error('Server configuration missing: SUPABASE_URL or SUPABASE_ANON_KEY')
  }

  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    const error = new Error('Missing bearer token')
    error.status = 401
    throw error
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  })

  return { supabase, token }
}
