import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveKitConfig, hashInviteToken, createInviteToken, formatAppointmentDateTime, buildAppointmentReminder, buildLiveKitMetadata, resolvePublicBaseUrl } from '../src/server/voice-agent/livekit-runtime.js';

test('LiveKit configuration stays unready when secrets are missing', () => {
  const config = getLiveKitConfig({});
  assert.equal(config.ready, false);
  assert.ok(config.missing.includes('LIVEKIT_URL'));
  assert.ok(config.missing.includes('LIVEKIT_API_SECRET'));
});
test('LiveKit URLs are normalized for server and browser SDKs', () => {
  const config = getLiveKitConfig({ LIVEKIT_URL: 'wss://example.livekit.cloud', LIVEKIT_API_KEY: 'key', LIVEKIT_API_SECRET: 'secret', LIVEKIT_AGENT_NAME: 'continuum-appointment-reminder' });
  assert.equal(config.ready, true);
  assert.equal(config.httpUrl, 'https://example.livekit.cloud');
  assert.equal(config.clientUrl, 'wss://example.livekit.cloud');
});
test('invitation token is random and only represented by a hash at rest', () => {
  const first = createInviteToken();
  const second = createInviteToken();
  assert.notEqual(first, second);
  assert.equal(hashInviteToken(first).length, 64);
  assert.notEqual(hashInviteToken(first), first);
});
test('appointment reminder uses clinic local time and weekday', () => {
  const date = '2026-11-10T10:30:00.000Z';
  const value = formatAppointmentDateTime(date);
  assert.equal(value.weekday, 'Tuesday');
  assert.equal(value.time, '4 PM');
  assert.equal(buildAppointmentReminder(date), 'Your appointment is scheduled for 4 PM on Tuesday.');
});
test('agent metadata uses the Agent Builder field names', () => {
  const metadata = buildLiveKitMetadata({ patientName: 'Ananya Mehta', clinicName: 'Continuum Demo Clinic', message: 'Your appointment is scheduled for 4 PM on Tuesday.', appointmentAt: '2026-11-10T10:30:00.000Z', callReference: 'DEMO-001' });
  assert.equal(metadata.patient_name, 'Ananya Mehta');
  assert.equal(metadata.message_to_read, 'Your appointment is scheduled for 4 PM on Tuesday.');
  assert.equal(metadata.appointment_datetime, 'Tuesday, 4 PM');
  assert.equal(metadata.call_reference, 'DEMO-001');
});


test('configured public origin takes precedence over a deployment preview host', () => {
  assert.equal(resolvePublicBaseUrl({
    configuredOrigin: 'https://continuum.example/',
    forwardedHost: 'continuum-git-feature-preview.vercel.app',
    host: 'continuum-git-feature-preview.vercel.app'
  }), 'https://continuum.example');
});
test('public origin falls back to the first forwarded host when no canonical origin is configured', () => {
  assert.equal(resolvePublicBaseUrl({
    forwardedHost: 'continuum.vercel.app, internal-proxy.local',
    host: 'internal-proxy.local'
  }), 'https://continuum.vercel.app');
});
test('invalid configured origins do not override a valid request host', () => {
  assert.equal(resolvePublicBaseUrl({
    configuredOrigin: 'https://continuum.example/path',
    forwardedHost: 'continuum.vercel.app'
  }), 'https://continuum.vercel.app');
});
