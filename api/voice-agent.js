import callsHandler from '../src/server/voice-agent/routes/calls.js'
import configHandler from '../src/server/voice-agent/routes/config.js'
import consentsHandler from '../src/server/voice-agent/routes/consents.js'
import getCallHandler from '../src/server/voice-agent/routes/call-by-id.js'
import contextHandler from '../src/server/voice-agent/routes/context.js'
import webhookHandler from '../src/server/voice-agent/routes/webhook.js'

export const config = { maxDuration: 30 }

const sendNotFound = (res) => res.status(404).json({ ok: false, error: 'Voice Agent route not found.' })

function matchRoute(req) {
  // vercel.json rewrites /api/voice-agent/* to this one function and
  // forwards the captured wildcard in the "path" query parameter.
  const rawPath = req.query?.path
  if (typeof rawPath !== 'string' && !Array.isArray(rawPath)) return null
  const routePath = Array.isArray(rawPath) ? rawPath.join('/') : rawPath
  const route = routePath.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part) } catch { return part }
  })

  if (route.length === 1 && route[0] === 'calls') return { handler: callsHandler }
  if (route.length === 1 && route[0] === 'config') return { handler: configHandler }
  if (route.length === 1 && route[0] === 'consents') return { handler: consentsHandler }
  if (route.length === 2 && route[0] === 'calls') {
    req.query = { ...(req.query || {}), id: route[1] }
    return { handler: getCallHandler }
  }
  if (route.length === 2 && route[0] === 'context') {
    req.query = { ...(req.query || {}), id: route[1] }
    return { handler: contextHandler }
  }
  if (route.length === 2 && route[0] === 'webhook') {
    req.query = { ...(req.query || {}), secret: route[1] }
    return { handler: webhookHandler }
  }
  return null
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store')
  const matched = matchRoute(req)
  if (!matched) return sendNotFound(res)
  return matched.handler(req, res)
}
