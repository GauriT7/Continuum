import crypto from 'node:crypto';

function httpsOrigin(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  try {
    const parsed = new URL(candidate.includes('://') ? candidate : 'https://' + candidate);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) return '';
    return parsed.origin;
  } catch {
    return '';
  }
}

export function resolvePublicBaseUrl({ configuredOrigin, forwardedHost, host } = {}) {
  // A configured production origin must win over preview/deployment request hosts.
  const configured = httpsOrigin(configuredOrigin);
  if (configured) return configured;

  const requestHost = String(forwardedHost || '').split(',')[0].trim() || String(host || '').trim();
  const safeHost = requestHost.replace(/[^a-zA-Z0-9.:[\]-]/g, '');
  return httpsOrigin(safeHost);
}

export function getLiveKitConfig(env = process.env) {
  const rawUrl = String(env.LIVEKIT_URL || '').trim().replace(/\/+$/, '');
  const apiKey = String(env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET || '').trim();
  const agentName = String(env.LIVEKIT_AGENT_NAME || 'continuum-appointment-reminder').trim();
  const missing = [];
  if (!rawUrl) missing.push('LIVEKIT_URL');
  if (!apiKey) missing.push('LIVEKIT_API_KEY');
  if (!apiSecret) missing.push('LIVEKIT_API_SECRET');
  if (!agentName) missing.push('LIVEKIT_AGENT_NAME');
  let httpUrl = '';
  let clientUrl = '';
  if (rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol === 'wss:') {
        clientUrl = parsed.toString().replace(/\/$/, '');
        parsed.protocol = 'https:';
        httpUrl = parsed.toString().replace(/\/$/, '');
      } else if (parsed.protocol === 'https:') {
        httpUrl = parsed.toString().replace(/\/$/, '');
        parsed.protocol = 'wss:';
        clientUrl = parsed.toString().replace(/\/$/, '');
      } else if (parsed.protocol === 'ws:') {
        clientUrl = parsed.toString().replace(/\/$/, '');
        parsed.protocol = 'http:';
        httpUrl = parsed.toString().replace(/\/$/, '');
      } else if (parsed.protocol === 'http:') {
        httpUrl = parsed.toString().replace(/\/$/, '');
        parsed.protocol = 'ws:';
        clientUrl = parsed.toString().replace(/\/$/, '');
      } else {
        missing.push('LIVEKIT_URL (must use https:// or wss://)');
      }
    } catch {
      missing.push('LIVEKIT_URL (invalid URL)');
    }
  }
  return { ready: missing.length === 0, missing, httpUrl, clientUrl, apiKey, apiSecret, agentName };
}

export function hashInviteToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest('hex');
}
export function createInviteToken() {
  return crypto.randomBytes(32).toString('base64url');
}
export function formatAppointmentDateTime(value, timeZone = 'Asia/Kolkata') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('The appointment date and time is invalid.');
  const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long', timeZone }).format(date);
  const time = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
    .format(date).replace(':00 ', ' ').toUpperCase();
  return { weekday, time, display: weekday + ', ' + time };
}
export function buildAppointmentReminder(value) {
  const formatted = formatAppointmentDateTime(value);
  return 'Your appointment is scheduled for ' + formatted.time + ' on ' + formatted.weekday + '.';
}
export function buildLiveKitMetadata({ patientName, clinicName, message, appointmentAt, callReference }) {
  const formatted = formatAppointmentDateTime(appointmentAt);
  return {
    patient_name: String(patientName || '').slice(0, 120),
    clinic_name: String(clinicName || 'Continuum Partner Clinic').slice(0, 120),
    message_to_read: String(message || '').slice(0, 800),
    appointment_datetime: formatted.display,
    language: 'English',
    call_reference: String(callReference || '').slice(0, 80),
  };
}
