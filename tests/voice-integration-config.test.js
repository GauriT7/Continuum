import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getSarvamApiKey,
  getInstantVoiceMissingSettings,
  getCampaignVoiceMissingSettings,
} from '../api/_lib/sarvam-config.js';
import {
  isWithinIstCallingWindow,
  nextAllowedIstCallingTime,
} from '../api/_lib/voice-safety.js';

test('existing SARVAM_API_KEY is accepted as a server-side compatibility alias', () => {
  assert.equal(getSarvamApiKey({SARVAM_API_KEY:' legacy-key '}),'legacy-key');
  assert.equal(getSarvamApiKey({SARVAM_API_KEY:'old',SARVAM_VOICE_API_KEY:'new'}),'new');
});

test('instant calling remains unready until deployment and telephony are explicitly verified', () => {
  const env = {
    SARVAM_API_KEY:'key',
    SARVAM_ORG_ID:'org',
    SARVAM_WORKSPACE_ID:'workspace',
    SARVAM_APP_ID:'app',
    SARVAM_APP_VERSION:'1',
    SARVAM_CONNECTION_ID:'connection',
    SARVAM_AGENT_PHONE_NUMBER:'+911234567890',
    VOICE_AGENT_WEBHOOK_SECRET:'secret',
    PUBLIC_BASE_URL:'https://continuum.example',
  };
  const missing = getInstantVoiceMissingSettings(env);
  assert.ok(missing.includes('SARVAM_APP_DEPLOYED'));
  assert.ok(missing.includes('SARVAM_CONNECTION_VERIFIED'));
  env.SARVAM_APP_DEPLOYED='true';
  env.SARVAM_CONNECTION_VERIFIED='true';
  assert.deepEqual(getInstantVoiceMissingSettings(env),[]);
});

test('campaign dispatch remains unready until webhook and scheduler are confirmed', () => {
  const env = {
    CRON_SECRET:'cron',
    VOICE_WEBHOOK_SECRET:'webhook',
    SARVAM_API_KEY:'key',
    SARVAM_ORG_ID:'org',
    SARVAM_WORKSPACE_ID:'workspace',
    SARVAM_CAMPAIGN_ID:'campaign',
  };
  const missing = getCampaignVoiceMissingSettings(env);
  assert.ok(missing.includes('SARVAM_CAMPAIGN_WEBHOOK_CONFIGURED'));
  assert.ok(missing.includes('VOICE_DISPATCH_SCHEDULER_CONFIGURED'));
  env.SARVAM_CAMPAIGN_WEBHOOK_CONFIGURED='true';
  env.VOICE_DISPATCH_SCHEDULER_CONFIGURED='true';
  assert.deepEqual(getCampaignVoiceMissingSettings(env),[]);
});

test('India calling window honours global hours, patient hours, Sundays and holidays', () => {
  assert.equal(isWithinIstCallingWindow(new Date('2026-11-09T04:30:00.000Z'),'09:00','18:00'),true);
  assert.equal(isWithinIstCallingWindow(new Date('2026-11-09T12:30:00.000Z'),'09:00','18:00'),false);
  assert.equal(isWithinIstCallingWindow(new Date('2026-11-08T04:30:00.000Z'),'09:00','18:00'),false);
  assert.equal(isWithinIstCallingWindow(new Date('2026-11-09T04:30:00.000Z'),'09:00','18:00',['2026-11-09']),false);
});

test('scheduler defers to the next permitted India calling window', () => {
  const next = nextAllowedIstCallingTime(
    new Date('2026-11-09T15:30:00.000Z'),
    '09:00',
    '18:00',
  );
  assert.equal(next.toISOString(),'2026-11-10T03:30:00.000Z');
});
