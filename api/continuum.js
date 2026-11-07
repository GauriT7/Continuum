import { getSupabaseForRequest } from './_lib/supabase.js'

const json = (req) => typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
const fail = (res, status, message) => res.status(status).json({ ok: false, error: message })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (!['GET', 'POST', 'PATCH'].includes(req.method)) {
    res.setHeader('Allow', 'GET, POST, PATCH')
    return fail(res, 405, 'Method not allowed')
  }

  try {
    const { supabase, token } = getSupabaseForRequest(req)
    const { data: auth, error: authError } = await supabase.auth.getUser(token)
    if (authError || !auth?.user) return fail(res, 401, 'Please sign in again.')

    const { data: memberships, error: membershipError } = await supabase
      .from('clinic_members')
      .select('clinic_id, role')
      .eq('user_id', auth.user.id)
      .limit(10)

    if (membershipError) return fail(res, 400, membershipError.message)
    if (!memberships?.length) return fail(res, 403, 'Your account is not linked to a clinic.')
    const clinicIds = memberships.map(m => m.clinic_id)
    const clinicId = clinicIds[0]
    const action = req.method === 'GET' ? (req.query?.action || 'bootstrap') : json(req).action
    const body = req.method === 'GET' ? {} : json(req)

    if (req.method === 'GET' && action === 'bootstrap') {
      const [clinicRes, patientsRes, journeysRes, tasksRes, appointmentsRes, documentsRes] = await Promise.all([
        supabase.from('clinics').select('id,name').in('id', clinicIds),
        supabase.from('patients').select('id,clinic_id,full_name,phone,date_of_birth,created_at').in('clinic_id', clinicIds).order('created_at', { ascending: false }).limit(200),
        supabase.from('journeys').select('id,patient_id,journey_type,status').limit(300),        
        supabase.from('tasks').select('id,clinic_id,patient_id,journey_id,title,description,assigned_role,status,due_at,created_at,updated_at').in('clinic_id', clinicIds).order('created_at', { ascending: false }).limit(300),
        supabase.from('appointments').select('id,clinic_id,patient_id,scheduled_at,appointment_type,status,created_at').in('clinic_id', clinicIds).order('scheduled_at', { ascending: true }).limit(200),
        supabase.from('documents').select('id,clinic_id,patient_id,file_name,storage_path,mime_type,document_type,review_status,created_at').in('clinic_id', clinicIds).order('created_at', { ascending: false }).limit(200)
      ])
      const firstError = [clinicRes, patientsRes, journeysRes, tasksRes, appointmentsRes, documentsRes].find(x => x.error)
      if (firstError) return fail(res, 400, firstError.error.message)
      return res.status(200).json({
        ok: true, user: { id: auth.user.id, email: auth.user.email },
        clinics: clinicRes.data, memberships,
        patients: patientsRes.data, journeys: journeysRes.data, tasks: tasksRes.data,
        appointments: appointmentsRes.data, documents: documentsRes.data
      })
    }

    if (req.method === 'POST' && action === 'patient') {
      const name = String(body.full_name || '').trim()
      if (!name) return fail(res, 400, 'Patient name is required.')
      const { data, error } = await supabase.from('patients').insert({
        clinic_id: clinicId, full_name: name,
        phone: body.phone ? String(body.phone).trim() : null,
        date_of_birth: body.date_of_birth || null
      }).select().single()
      if (error) return fail(res, 400, error.message)
      if (body.partner_name?.trim()) {
        const { error: partnerError } = await supabase.from('patient_partners').insert({
          patient_id: data.id, partner_name: body.partner_name.trim()
        })
        if (partnerError) return fail(res, 400, partnerError.message)
      }
      return res.status(201).json({ ok: true, patient: data })
    }

    if (req.method === 'POST' && action === 'journey') {
      if (!body.patient_id || !['fertility','antenatal','postpartum','newborn'].includes(body.journey_type)) {
        return fail(res, 400, 'Choose a patient and valid journey type.')
      }
      const { data: patient, error: patientError } = await supabase.from('patients')
        .select('id,clinic_id').eq('id', body.patient_id).single()
      if (patientError || !clinicIds.includes(patient?.clinic_id)) return fail(res, 403, 'Patient is not in your clinic.')
      const { data, error } = await supabase.from('journeys').insert({
        patient_id: body.patient_id, journey_type: body.journey_type, status: 'active'
      }).select().single()
      if (error) return fail(res, 400, error.message)
      return res.status(201).json({ ok: true, journey: data })
    }

    if (req.method === 'POST' && action === 'task') {
      if (!body.patient_id || !String(body.title || '').trim()) return fail(res, 400, 'Choose a patient and enter a task title.')
      const { data, error } = await supabase.from('tasks').insert({
        clinic_id: clinicId, patient_id: body.patient_id, journey_id: body.journey_id || null,
        title: String(body.title).trim(), description: body.description || null,
        assigned_role: body.assigned_role || null, due_at: body.due_at || null,
        status: 'pending'
      }).select().single()
      if (error) return fail(res, 400, error.message)
      return res.status(201).json({ ok: true, task: data })
    }

    if (req.method === 'PATCH' && action === 'task') {
      const allowed = ['pending','in_progress','completed','cancelled']
      if (!body.id || !allowed.includes(body.status)) return fail(res, 400, 'Invalid task update.')
      const { data, error } = await supabase.from('tasks')
        .update({ status: body.status, updated_at: new Date().toISOString() })
        .eq('id', body.id).in('clinic_id', clinicIds)
        .select().single()
      if (error) return fail(res, 400, error.message)
      return res.status(200).json({ ok: true, task: data })
    }

    if (req.method === 'POST' && action === 'appointment') {
      if (!body.patient_id || !body.scheduled_at) return fail(res, 400, 'Choose a patient and appointment date/time.')
      const { data, error } = await supabase.from('appointments').insert({
        clinic_id: clinicId, patient_id: body.patient_id,
        scheduled_at: body.scheduled_at, appointment_type: body.appointment_type || 'Follow-up',
        status: 'scheduled'
      }).select().single()
      if (error) return fail(res, 400, error.message)
      return res.status(201).json({ ok: true, appointment: data })
    }

    if (req.method === 'PATCH' && action === 'appointment') {
      if (!body.id || !['scheduled','completed','cancelled','rescheduled'].includes(body.status)) return fail(res, 400, 'Invalid appointment update.')
      const { data, error } = await supabase.from('appointments')
        .update({ status: body.status, ...(body.scheduled_at ? { scheduled_at: body.scheduled_at } : {}) })
        .eq('id', body.id).in('clinic_id', clinicIds).select().single()
      if (error) return fail(res, 400, error.message)
      return res.status(200).json({ ok: true, appointment: data })
    }

    if (req.method === 'POST' && action === 'document') {
      if (!body.patient_id || !body.file_name || !body.storage_path) return fail(res, 400, 'Document metadata is incomplete.')
      const { data, error } = await supabase.from('documents').insert({
        clinic_id: clinicId, patient_id: body.patient_id,
        file_name: body.file_name, storage_path: body.storage_path,
        mime_type: body.mime_type || null,
        document_type: body.document_type || null, review_status: 'pending'
      }).select().single()
      if (error) return fail(res, 400, error.message)
      return res.status(201).json({ ok: true, document: data })
    }

    if (req.method === 'PATCH' && action === 'document') {
      if (!body.id || !['pending','reviewed','matched','needs_clarification'].includes(body.review_status)) return fail(res, 400, 'Invalid document review status.')
      const { data, error } = await supabase.from('documents').update({
        review_status: body.review_status,
        ...(body.document_type ? { document_type: body.document_type } : {})
      }).eq('id', body.id).in('clinic_id', clinicIds).select().single()
      if (error) return fail(res, 400, error.message)
      return res.status(200).json({ ok: true, document: data })
    }

    return fail(res, 400, 'Unknown Continuum action.')
  } catch (error) {
    return fail(res, error.status || 500, error.message || 'Unexpected server error.')
  }
}
