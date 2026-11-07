export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).json({
    ok: true,
    service: 'Continuum API',
    status: 'online',
    timestamp: new Date().toISOString()
  })
}
