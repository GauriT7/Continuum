export function getSarvamApiKey(env = process.env) {
  // SARVAM_API_KEY is the existing legacy Vercel variable. Prefer the
  // explicit voice-scoped name, but continue to support the existing key.
  return String(env.SARVAM_VOICE_API_KEY || env.SARVAM_API_KEY || '').trim();
}

export function getInstantVoiceMissingSettings(env = process.env) {
  const baseUrl = String(
    env.PUBLIC_BASE_URL ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}` : '') ||
    (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '')
  ).trim().replace(/\/+$/, '');

  const checks = [
    ['SARVAM_VOICE_API_KEY', getSarvamApiKey(env)],
    ['SARVAM_ORG_ID', env.SARVAM_ORG_ID],
    ['SARVAM_WORKSPACE_ID', env.SARVAM_WORKSPACE_ID],
    ['SARVAM_APP_ID', env.SARVAM_APP_ID],
    ['SARVAM_APP_VERSION', Number.parseInt(env.SARVAM_APP_VERSION || '0', 10) > 0],
    ['SARVAM_CONNECTION_ID', env.SARVAM_CONNECTION_ID],
    ['SARVAM_AGENT_PHONE_NUMBER', env.SARVAM_AGENT_PHONE_NUMBER],
    ['VOICE_AGENT_WEBHOOK_SECRET', env.VOICE_AGENT_WEBHOOK_SECRET],
    ['PUBLIC_BASE_URL', baseUrl],
    ['SARVAM_CONNECTION_VERIFIED', env.SARVAM_CONNECTION_VERIFIED === 'true'],
  ];
  return checks.filter(([, value]) => !value).map(([name]) => name);
}

export function getCampaignVoiceMissingSettings(env = process.env) {
  const checks = [
    ['CRON_SECRET', env.CRON_SECRET],
    ['SUPABASE_URL', env.SUPABASE_URL || env.VITE_SUPABASE_URL],
    ['SUPABASE_SERVICE_ROLE_KEY', env.SUPABASE_SERVICE_ROLE_KEY],
    ['VOICE_WEBHOOK_SECRET', env.VOICE_WEBHOOK_SECRET],
    ['SARVAM_VOICE_API_KEY', getSarvamApiKey(env)],
    ['SARVAM_ORG_ID', env.SARVAM_ORG_ID],
    ['SARVAM_WORKSPACE_ID', env.SARVAM_WORKSPACE_ID],
    ['SARVAM_CAMPAIGN_ID', env.SARVAM_CAMPAIGN_ID],
    ['SARVAM_CAMPAIGN_WEBHOOK_CONFIGURED', env.SARVAM_CAMPAIGN_WEBHOOK_CONFIGURED === 'true'],
    ['VOICE_DISPATCH_SCHEDULER_CONFIGURED', env.VOICE_DISPATCH_SCHEDULER_CONFIGURED === 'true'],
  ];
  return checks.filter(([, value]) => !value).map(([name]) => name);
}
