import webpush from 'web-push'
import { getSupabaseForRequest } from './_lib/supabase.js'

const fail = (res, status, error) => res.status(status).json({ ok: false, error })
const bodyOf = req => typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  try {
    const { supabase, token } = getSupabaseForRequest(req)
    const { data: auth, error: authError } = await supabase.auth.getUser(token)
    if (authError || !auth?.user) return fail(res, 401, 'Please sign in again.')
    const userId = auth.user.id

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('push_subscriptions')
        .select('id,device_label,created_at').eq('user_id', userId)
      if (error) return fail(res, 400, error.message)
      return res.status(200).json({
        ok: true,
        configured: Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT),
        publicKey: process.env.VAPID_PUBLIC_KEY || null,
        subscriptions: data?.length || 0,
        devices: data || []
      })
    }

    const body = bodyOf(req)
    if (req.method === 'POST' && body.action === 'subscribe') {
      const sub = body.subscription
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return fail(res, 400, 'A valid browser push subscription is required.')
      }
      let endpoint
      try { endpoint = new URL(sub.endpoint) } catch { return fail(res, 400, 'Invalid push endpoint.') }
      if (endpoint.protocol !== 'https:' || !endpoint.hostname) return fail(res, 400, 'Invalid push endpoint.')
      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: userId,
        endpoint: endpoint.toString(),
        subscription: { endpoint: endpoint.toString(), keys: sub.keys },
        device_label: String(body.device_label || 'This device').slice(0, 160),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,endpoint' })
      if (error) return fail(res, 400, error.message)
      return res.status(200).json({ ok: true })
    }

    if (req.method === 'POST' && ['test', 'appointment-reminder'].includes(body.action)) {
      if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) {
        return fail(res, 503, 'Push is not configured. Add VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT in Vercel.')
      }
      webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY)
      const { data: rows, error } = await supabase.from('push_subscriptions')
        .select('id,endpoint,subscription').eq('user_id', userId)
      if (error) return fail(res, 400, error.message)
      if (!rows?.length) return fail(res, 404, 'No devices are registered for this account.')
      if (body.action === 'appointment-reminder') {
        if (!body.appointment_id) return fail(res, 400, 'Choose an appointment first.')
        const { data: memberships, error: membershipError } = await supabase
          .from('clinic_members').select('clinic_id').eq('user_id', userId).limit(10)
        if (membershipError) return fail(res, 400, membershipError.message)
        const clinicIds = (memberships || []).map(row => row.clinic_id)
        if (!clinicIds.length) return fail(res, 403, 'Your account is not linked to a clinic.')
        const { data: appointment, error: appointmentError } = await supabase
          .from('appointments').select('id').eq('id', body.appointment_id)
          .in('clinic_id', clinicIds).maybeSingle()
        if (appointmentError) return fail(res, 400, appointmentError.message)
        if (!appointment) return fail(res, 404, 'Appointment not found in your clinic.')
      }

      const payload = JSON.stringify(body.action === 'appointment-reminder'
        ? {
            title: 'Continuum appointment reminder',
            body: 'An appointment reminder is ready. Open Continuum to review your schedule.',
            url: '/'
          }
        : {
            title: 'Continuum',
            body: 'Your notification connection is working.',
            url: '/'
          })
      const results = await Promise.allSettled(rows.map(row =>
        webpush.sendNotification(row.subscription, payload, { TTL: 60 })
      ))
      const expiredIds = []
      let delivered = 0
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') delivered += 1
        else if ([404, 410].includes(result.reason?.statusCode)) expiredIds.push(rows[index].id)
      })
      if (expiredIds.length) {
        await supabase.from('push_subscriptions').delete().in('id', expiredIds).eq('user_id', userId)
      }
      if (!delivered) return fail(res, 502, 'The push provider rejected all registered devices. Re-enable notifications on the device.')
      return res.status(200).json({ ok: true, delivered, expired: expiredIds.length, notification: body.action })
    }

    if (req.method === 'DELETE') {
      const endpoint = String(body.endpoint || '')
      if (!endpoint.startsWith('https://')) return fail(res, 400, 'A valid device endpoint is required.')
      const { error } = await supabase.from('push_subscriptions')
        .delete().eq('user_id', userId).eq('endpoint', endpoint)
      if (error) return fail(res, 400, error.message)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'GET, POST, DELETE')
    return fail(res, 405, 'Method not allowed.')
  } catch (error) {
    return fail(res, error.status || 500, error.message || 'Unexpected push notification error.')
  }
}
