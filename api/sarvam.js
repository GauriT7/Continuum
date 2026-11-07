import { getSupabaseForRequest } from './_lib/supabase.js'

const SARVAM = 'https://api.sarvam.ai'
const replyError = (res, status, error) => res.status(status).json({ ok: false, error })

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return replyError(res, 405, 'Method not allowed')
  }

  try {
    const { supabase, token } = getSupabaseForRequest(req)
    const { data: auth, error: authError } = await supabase.auth.getUser(token)
    if (authError || !auth?.user) return replyError(res, 401, 'Please sign in again.')

    const key = process.env.SARVAM_API_KEY
    if (!key) return replyError(res, 503, 'Sarvam is not configured yet. Add SARVAM_API_KEY in Vercel.')
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {})
    const action = body.action

    if (action === 'translate') {
      const input = String(body.input || '').slice(0, 1000)
      if (!input) return replyError(res, 400, 'Enter text to translate.')
      const response = await fetch(`${SARVAM}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
        body: JSON.stringify({
          input,
          source_language_code: body.source_language_code || 'auto',
          target_language_code: body.target_language_code || 'mr-IN',
          model: 'mayura:v1',
          mode: body.mode || 'formal'
        })
      })
      const data = await response.json()
      if (!response.ok) return replyError(res, response.status, data?.error?.message || data?.message || 'Translation failed.')
      return res.status(200).json({ ok: true, translated_text: data.translated_text, source_language_code: data.source_language_code })
    }

    
if (action === 'tts') {
  const text = String(body.text || '').slice(0, 2400)
  if (!text) return replyError(res, 400, 'Enter approved text to speak.')

  const language = body.language_code || 'mr-IN'

const defaultSpeakers = {
  'hi-IN': 'ritu_hi_customer',
  'mr-IN': 'ritu_mr_narration',
  'en-IN': 'aditi',
  'ta-IN': 'vijay',
  'te-IN': 'kavitha'
}

const speaker = defaultSpeakers[language] || 'ritu_mr_narration'

  const response = await fetch(`${SARVAM}/text-to-speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': key
    },
    body: JSON.stringify({
      text,
      model: 'bulbul:v4-flash',
      language_code: language,
      speaker,
      output_audio_codec: 'mp3'
    })
  })

  const data = await response.json()

  if (!response.ok) {
    return replyError(res, response.status, data?.error?.message || data?.message || 'Speech generation failed.')
  }

  return res.status(200).json({
    ok: true,
    audio_base64: data.audios?.[0],
    mime_type: 'audio/mpeg'
  })
}


    if (action === 'stt') {
      const base64 = String(body.audio_base64 || '')
      if (!base64) return replyError(res, 400, 'Choose an audio recording first.')
      if (base64.length > 3_500_000) return replyError(res, 413, 'Audio is too large for this quick transcription route. Use a shorter voice note.')
      const buffer = Buffer.from(base64.replace(/^data:.*?;base64,/, ''), 'base64')
      const mime = body.mime_type || 'audio/mp4'
      const form = new FormData()
      form.append('file', new Blob([buffer], { type: mime }), body.file_name || 'voice-note.m4a')
      form.append('model', 'saaras:v4')
      form.append('mode', ['transcribe','translate','verbatim','translit','codemix'].includes(body.mode) ? body.mode : 'codemix')
      const response = await fetch(`${SARVAM}/speech-to-text`, {
        method: 'POST', headers: { 'api-subscription-key': key }, body: form
      })
      const data = await response.json()
      if (!response.ok) return replyError(res, response.status, data?.error?.message || data?.message || 'Transcription failed.')
      return res.status(200).json({ ok: true, transcript: data.transcript, language_code: data.language_code || null })
    }

    if (action === 'assistant') {
      const prompt = String(body.prompt || '').trim().slice(0, 3000)
      if (!prompt) return replyError(res, 400, 'Enter an administrative workflow request.')
      const response = await fetch(`${SARVAM}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-subscription-key': key },
        body: JSON.stringify({
          model: 'sarvam-105b',
          temperature: 0.2,
          max_tokens: 700,
          messages: [
            { role: 'system', content: 'You are Continuum, an administrative maternal and reproductive healthcare workflow assistant. You may help organise tasks, draft non-clinical messages, summarise administrative status and extract names, dates, appointment logistics and document handoff tasks. Never diagnose, interpret clinical findings, recommend tests, treatment, medication, urgency or clinical next steps. If asked for clinical guidance, state that a clinician must decide. Do not claim to send messages or change records. Return concise suggestions for human review.' },
            { role: 'user', content: prompt }
          ]
        })
      })
      const data = await response.json()
      if (!response.ok) return replyError(res, response.status, data?.error?.message || data?.message || 'Assistant request failed.')
      return res.status(200).json({ ok: true, reply: data.choices?.[0]?.message?.content || 'No suggestion returned.' })
    }

    if (action === 'doc-submit') {
      const { storage_path, file_name, mime_type, operation } = body
      if (!storage_path || !file_name) return replyError(res, 400, 'Upload a document before processing.')
      if (!['parse','classify','extract','split'].includes(operation)) return replyError(res, 400, 'Choose a valid document operation.')
      const { data: signed, error: signedError } = await supabase.storage.from('continuum-documents').createSignedUrl(storage_path, 60)
      if (signedError || !signed?.signedUrl) return replyError(res, 400, signedError?.message || 'Could not access uploaded document.')
      const fileResponse = await fetch(signed.signedUrl)
      if (!fileResponse.ok) return replyError(res, 400, 'Could not retrieve the uploaded document.')
      const bytes = await fileResponse.arrayBuffer()
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: mime_type || 'application/pdf' }), file_name)
      form.append('language', body.language || 'en-IN')
      if (operation === 'parse') form.append('output_format', 'md')
      if (operation === 'extract') {
        const schema = {
          type: 'object',
          properties: {
            document_date: { type: 'string', description: 'Date printed on the document, if present.' },
            patient_name: { type: 'string', description: 'Patient name printed on the document, if present.' },
            issuing_facility: { type: 'string', description: 'Name of issuing facility or laboratory, if present.' },
            document_type: { type: 'string', description: 'Administrative document category, such as lab report, referral letter, discharge summary, identity form, or other.' }
          }
        }
        form.append('schema', JSON.stringify(schema))
        form.append('output_format', 'json')
      }
      if (operation === 'classify') {
        form.append('categories', 'lab report, referral letter, discharge summary, identity document, appointment document, other')
      }
      const response = await fetch(`${SARVAM}/doc-ai/v1/job/${operation}`, {
        method: 'POST', headers: { 'api-subscription-key': key }, body: form
      })
      const data = await response.json()
      if (!response.ok) return replyError(res, response.status, data?.error?.message || data?.message || 'Document AI submission failed.')
      return res.status(200).json({ ok: true, job_id: data.job_id, status: data.status, operation })
    }

    if (action === 'doc-status') {
      if (!body.job_id) return replyError(res, 400, 'Missing document AI job ID.')
      const response = await fetch(`${SARVAM}/doc-ai/v1/job/${encodeURIComponent(body.job_id)}/status`, {
        headers: { 'api-subscription-key': key }
      })
      const data = await response.json()
      if (!response.ok) return replyError(res, response.status, data?.error?.message || 'Could not retrieve job status.')
      return res.status(200).json({ ok: true, result: data })
    }

    if (action === 'doc-results') {
      if (!body.job_id) return replyError(res, 400, 'Missing document AI job ID.')
      const response = await fetch(`${SARVAM}/doc-ai/v1/job/${encodeURIComponent(body.job_id)}/results`, {
        headers: { 'api-subscription-key': key }
      })
      const data = await response.json()
      if (!response.ok) return replyError(res, response.status, data?.error?.message || 'Could not retrieve document results.')
      return res.status(200).json({ ok: true, result: data })
    }

    return replyError(res, 400, 'Unknown Sarvam action.')
  } catch (error) {
    return replyError(res, error.status || 500, error.message || 'Unexpected Sarvam error.')
  }
}
