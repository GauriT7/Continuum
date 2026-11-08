import { AccessToken, LiveKitAPI } from 'livekit-server-sdk';
import crypto from 'node:crypto';
import { requireVoiceStaff, adminDb, fail, bodyOf } from '../../../../api/_lib/voice-agent.js';
import { calculateAge } from '../runtime.js';
import {
  getLiveKitConfig, hashInviteToken, createInviteToken,
  buildAppointmentReminder, buildLiveKitMetadata
} from '../livekit-runtime.js';

const TABLE = 'livekit_voice_invites';
const INVITE_MINUTES = 30;

function livekitApi(config) {
  return new LiveKitAPI({ host: config.httpUrl, apiKey: config.apiKey, secret: config.apiSecret });
}
function baseUrl(req) {
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  const host = forwardedHost.replace(/[^a-zA-Z0-9.:-]/g, '');
  if (host) return 'https://' + host;
  return String(process.env.PUBLIC_BASE_URL || '').trim().replace(/\/+$/, '');
}


async function listInvites(req, res) {
  const { clinicIds, db } = await requireVoiceStaff(req);
  const { data: invites, error } = await db.from(TABLE).select('id,clinic_id,patient_id,appointment_id,status,metadata,expires_at,created_at,joined_at,completed_at,duration_seconds')
    .in('clinic_id', clinicIds).order('created_at', { ascending: false }).limit(20);
  if (error) return fail(res, 400, 'Could not load voice invitation history.');
  const patientIds = [...new Set((invites || []).map(row => row.patient_id))];
  const { data: people, error: peopleError } = patientIds.length
    ? await db.from('patients').select('id,full_name').in('id', patientIds)
    : { data: [], error: null };
  if (peopleError) return fail(res, 400, 'Could not load patient labels for voice history.');
  const names = new Map((people || []).map(person => [person.id, person.full_name]));
  return res.status(200).json({
    ok: true,
    calls: (invites || []).map(row => ({
      id: row.id, patient_name: names.get(row.patient_id) || 'Patient',
      clinic_name: row.metadata?.clinic_name || 'Continuum Partner Clinic',
      appointment_datetime: row.metadata?.appointment_datetime || '',
      status: row.status, created_at: row.created_at, joined_at: row.joined_at,
      completed_at: row.completed_at, duration_seconds: row.duration_seconds || null,
      expires_at: row.expires_at,
    })),
  });
}

async function createInvite(req, res) {
  const { user, clinicIds, db } = await requireVoiceStaff(req);
  const body = bodyOf(req);
  const config = getLiveKitConfig();
  if (!config.ready) return res.status(503).json({ ok: false, code: 'livekit_not_configured', error: 'LiveKit is not fully configured on the server.', missing_settings: config.missing });
  if (body.recipient_consent_confirmed !== true) return fail(res, 400, 'Confirm that the recipient has agreed to receive and join this voice invitation.', 'recipient_consent_required');

  const appointmentId = String(body.appointment_id || '').trim();
  if (!appointmentId) return fail(res, 400, 'Choose an appointment first.');
  const { data: appointment, error: appointmentError } = await db.from('appointments')
    .select('id,clinic_id,patient_id,scheduled_at,appointment_type,status')
    .eq('id', appointmentId).in('clinic_id', clinicIds).maybeSingle();
  if (appointmentError) return fail(res, 400, appointmentError.message);
  if (!appointment) return fail(res, 404, 'Appointment not found in your clinic.');
  if (appointment.status && appointment.status !== 'scheduled') return fail(res, 409, 'Only a currently scheduled appointment can receive a reminder invitation.');

  const { data: patient, error: patientError } = await db.from('patients')
    .select('id,clinic_id,full_name,date_of_birth')
    .eq('id', appointment.patient_id).eq('clinic_id', appointment.clinic_id).maybeSingle();
  if (patientError) return fail(res, 400, patientError.message);
  if (!patient) return fail(res, 404, 'The appointment patient could not be found.');
  const age = calculateAge(patient.date_of_birth);
  if (age === null) return fail(res, 409, 'A valid date of birth is required before a voice invitation can be created.', 'date_of_birth_required');
  if (age < 18 && body.guardian_confirmed !== true) return fail(res, 403, 'A parent or legal guardian must agree to the voice invitation for a minor.', 'guardian_confirmation_required');

  const { data: clinic, error: clinicError } = await db.from('clinics').select('id,name').eq('id', appointment.clinic_id).maybeSingle();
  if (clinicError) return fail(res, 400, clinicError.message);
  let message;
  let metadata;
  const inviteId = crypto.randomUUID();
  try {
    message = buildAppointmentReminder(appointment.scheduled_at);
    metadata = buildLiveKitMetadata({
      patientName: patient.full_name,
      clinicName: clinic?.name || process.env.CLINIC_NAME || 'Continuum Partner Clinic',
      message,
      appointmentAt: appointment.scheduled_at,
      callReference: inviteId,
    });
  } catch (error) {
    return fail(res, 422, error.message || 'Could not format the appointment reminder.');
  }

  const inviteToken = createInviteToken();
  const roomName = 'continuum-' + inviteId.replace(/-/g, '');
  const expiresAt = new Date(Date.now() + INVITE_MINUTES * 60 * 1000).toISOString();
  const { error: insertError } = await db.from(TABLE).insert({
    id: inviteId, clinic_id: appointment.clinic_id, patient_id: patient.id,
    appointment_id: appointment.id, created_by: user.id,
    token_hash: hashInviteToken(inviteToken), room_name: roomName,
    agent_name: config.agentName, metadata, message, status: 'created',
    expires_at: expiresAt, recipient_consent_confirmed: true,
    recipient_consent_confirmed_by: user.id,
    recipient_consent_confirmed_at: new Date().toISOString(),
    guardian_confirmed: age < 18,
  });
  if (insertError) return fail(res, 500, 'Could not save the voice invitation. Apply the LiveKit voice migration and retry.');
  const origin = baseUrl(req);
  if (!origin) return fail(res, 500, 'Could not determine the invitation URL. Configure PUBLIC_BASE_URL.');
  return res.status(201).json({
    ok: true, invite_id: inviteId,
    invitation_url: origin + '/voice/join?token=' + encodeURIComponent(inviteToken),
    expires_at: expiresAt, expires_in_minutes: INVITE_MINUTES,
    patient_name: patient.full_name, clinic_name: metadata.clinic_name,
    appointment_datetime: metadata.appointment_datetime, message,
  });
}

async function joinInvite(req, res) {
  const body = bodyOf(req);
  const rawToken = String(body.token || '');
  if (rawToken.length < 40 || rawToken.length > 120) return fail(res, 400, 'This invitation link is invalid.', 'invalid_invitation');
  const config = getLiveKitConfig();
  if (!config.ready) return res.status(503).json({ ok: false, error: 'LiveKit is not fully configured.', missing_settings: config.missing });
  const db = adminDb();
  const { data: invite, error } = await db.from(TABLE).select('*').eq('token_hash', hashInviteToken(rawToken)).maybeSingle();
  if (error) return fail(res, 500, 'Could not validate the invitation.');
  if (!invite) return fail(res, 404, 'This invitation is invalid or has already been removed.', 'invalid_invitation');
  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    await db.from(TABLE).update({ status: 'expired' }).eq('id', invite.id).eq('status', 'created');
    return res.status(410).json({ ok: false, error: 'This invitation has expired. Please ask your clinic for a new link.', code: 'invitation_expired' });
  }
  if (['completed','expired','failed'].includes(invite.status)) return res.status(410).json({ ok: false, error: 'This invitation is no longer active. Please ask your clinic for a new link.' });

  if (invite.status === 'created') {
    const now = new Date().toISOString();
    const { data: claimed, error: claimError } = await db.from(TABLE).update({ status: 'connecting', joined_at: now })
      .eq('id', invite.id).eq('status', 'created').select('id').maybeSingle();
    if (claimError) return fail(res, 500, 'Could not start the voice session.');
    if (claimed) {
      try {
        const dispatch = await livekitApi(config).agentDispatch.createDispatch(invite.room_name, invite.agent_name, {
          metadata: JSON.stringify(invite.metadata || {}),
        });
        await db.from(TABLE).update({ livekit_dispatch_id: dispatch.id || null, dispatch_started_at: now }).eq('id', invite.id);
      } catch (dispatchError) {
        await db.from(TABLE).update({ status: 'failed', failure_reason: String(dispatchError.message || 'LiveKit dispatch failed').slice(0, 300) }).eq('id', invite.id);
        return res.status(502).json({ ok: false, error: 'The voice assistant could not join this room. Please ask the clinic to create a new invitation.', code: 'agent_dispatch_failed' });
      }
    }
  }

  const accessToken = new AccessToken(config.apiKey, config.apiSecret, {
    identity: 'patient-' + invite.id.slice(0, 8), name: 'Continuum patient', ttl: '20m',
  });
  accessToken.addGrant({
    roomJoin: true, room: invite.room_name,
    canPublish: true, canSubscribe: true,
    canPublishData: false, canUpdateOwnMetadata: false,
  });
  return res.status(200).json({
    ok: true, livekit_url: config.clientUrl, token: await accessToken.toJwt(),
    room_name: invite.room_name,
    clinic_name: invite.metadata?.clinic_name || 'Continuum Partner Clinic',
    patient_name: invite.metadata?.patient_name || 'Patient',
    appointment_datetime: invite.metadata?.appointment_datetime || '',
    message: invite.message, expires_at: invite.expires_at,
  });
}

async function completeInvite(req, res) {
  const rawToken = String(bodyOf(req).token || '');
  if (rawToken.length < 40 || rawToken.length > 120) return fail(res, 400, 'Invalid invitation.');
  const db = adminDb();
  const { data: invite, error } = await db.from(TABLE).select('id,room_name,status,joined_at')
    .eq('token_hash', hashInviteToken(rawToken)).maybeSingle();
  if (error) return fail(res, 500, 'Could not load the call record.');
  if (!invite) return fail(res, 404, 'Call invitation not found.');
  if (invite.status === 'completed') return res.status(200).json({ ok: true, already_completed: true });
  const now = new Date();
  const startedAt = invite.joined_at ? new Date(invite.joined_at).getTime() : now.getTime();
  const durationSeconds = Math.max(0, Math.min(3600, Math.round((now.getTime() - startedAt) / 1000)));
  const { error: updateError } = await db.from(TABLE).update({
    status: 'completed', completed_at: now.toISOString(), duration_seconds: durationSeconds,
  }).eq('id', invite.id);
  if (updateError) return fail(res, 500, 'The call ended, but its completion could not be saved.');
  try {
    const config = getLiveKitConfig();
    if (config.ready) await livekitApi(config).room.deleteRoom(invite.room_name);
  } catch {
    // The call is already marked complete. Room cleanup is best effort.
  }
  return res.status(200).json({ ok: true, duration_seconds: durationSeconds });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query?.livekitAction || '');
  if (req.method === 'GET' && action === 'invites') {
    try { return await listInvites(req, res); }
    catch (error) { return fail(res, error.status || 500, error.message || 'Could not load voice call history.'); }
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, 'Method not allowed.');
  }
  try {
    if (action === 'invites') return await createInvite(req, res);
    if (action === 'join') return await joinInvite(req, res);
    if (action === 'complete') return await completeInvite(req, res);
    return fail(res, 404, 'LiveKit route not found.');
  } catch (error) {
    return fail(res, error.status || 500, error.message || 'LiveKit voice request failed.');
  }
}
