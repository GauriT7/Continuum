import { getSupabaseForRequest } from './_lib/supabase.js'

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')

  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  try {
    const { supabase, token } = getSupabaseForRequest(req)

    const { data: userResult, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userResult?.user) {
      return res.status(401).json({ ok: false, error: 'Invalid or expired session' })
    }

    if (req.method === 'GET') {
      let query = supabase
        .from('tasks')
        .select('id, clinic_id, patient_id, journey_id, title, description, assigned_role, status, due_at, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(100)

      if (req.query?.patient_id) query = query.eq('patient_id', req.query.patient_id)
      if (req.query?.status) query = query.eq('status', req.query.status)

      const { data, error } = await query
      if (error) return res.status(400).json({ ok: false, error: error.message })
      return res.status(200).json({ ok: true, tasks: data })
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
      const { clinic_id, patient_id, journey_id, title, description, assigned_role, due_at } = body

      if (!clinic_id || !patient_id || !title || typeof title !== 'string' || !title.trim()) {
        return res.status(400).json({
          ok: false,
          error: 'clinic_id, patient_id and a non-empty title are required'
        })
      }

      const payload = {
        clinic_id,
        patient_id,
        journey_id: journey_id || null,
        title: title.trim(),
        description: description || null,
        assigned_role: assigned_role || null,
        due_at: due_at || null
      }

      const { data, error } = await supabase
        .from('tasks')
        .insert(payload)
        .select('id, clinic_id, patient_id, journey_id, title, description, assigned_role, status, due_at, created_at')
        .single()

      if (error) return res.status(400).json({ ok: false, error: error.message })
      return res.status(201).json({ ok: true, task: data })
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
    const { id, status } = body
    const allowed = ['pending', 'in_progress', 'completed', 'cancelled']

    if (!id || !allowed.includes(status)) {
      return res.status(400).json({ ok: false, error: 'A task id and valid status are required' })
    }

    const { data, error } = await supabase
      .from('tasks')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status, updated_at')
      .single()

    if (error) return res.status(400).json({ ok: false, error: error.message })
    return res.status(200).json({ ok: true, task: data })
  } catch (error) {
    const status = error.status || 500
    return res.status(status).json({ ok: false, error: error.message || 'Unexpected server error' })
  }
}
