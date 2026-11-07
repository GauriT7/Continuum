import callsHandler from './calls.js'
import configHandler from './config.js'
import consentsHandler from './consents.js'
import getCallHandler from './calls/[id].js'
import contextHandler from './context/[id].js'
import webhookHandler from './webhook/[secret].js'

const sendNotFound = (res) => res.status(404).json({ ok: false, error: 'Voice Agent route not found.' })

function matchRoute(req) {
  const pathname = new URL(req.url || '/', 'https://continuum.invalid').pathname
  const parts = pathname.split('/').filter(Boolean).map(part => {
    try { return decodeURIComponent(part) } catch { return part }
  })
  if (parts.length < 2 || parts[0] !== 'api' || parts[1] !== 'voice-agent') return null
  const route = parts.slice(2)

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
