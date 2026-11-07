import { getSupabaseForRequest } from './_lib/supabase.js'

const fail = (res, status, error) => res.status(status).json({ ok: false, error })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return fail(res, 405, 'Method not allowed.')
  }
  try {
    const { supabase, token } = getSupabaseForRequest(req)
    const { data: auth, error: authError } = await supabase.auth.getUser(token)
    if (authError || !auth?.user) return fail(res, 401, 'Please sign in again.')
    const { data: member, error } = await supabase.from('clinic_members')
      .select('clinic_id').eq('user_id', auth.user.id).limit(1).maybeSingle()
    if (error) return fail(res, 400, error.message)
    if (!member) return fail(res, 403, 'Your account is not linked to a clinic.')

    const credentialsPresent = Boolean(
      process.env.ABDM_SANDBOX_CLIENT_ID &&
      process.env.ABDM_SANDBOX_CLIENT_SECRET &&
      process.env.ABDM_CM_ID
    )
    return res.status(200).json({
      ok: true,
      configured: credentialsPresent,
      environment: credentialsPresent ? 'sandbox_credentials_present' : 'not_configured',
      production_ready: false,
      message: credentialsPresent
        ? 'Sandbox credentials are present. Consent-manager and HIU/HIP workflows still need implementation, validation and ABDM approval.'
        : 'ABDM sandbox onboarding and credentials are required before records can be requested.',
      data_access: 'No ABHA identity or health records were queried by this endpoint.'
    })
  } catch (error) {
    return fail(res, error.status || 500, error.message || 'Could not check ABDM configuration.')
  }
}
