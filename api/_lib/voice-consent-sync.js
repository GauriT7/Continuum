const DEFAULT_LANGUAGE = 'en-IN';

export async function syncAgentConsentToCampaign(db, {
  patient,
  phone,
  status,
  source,
  recordedBy,
  guardianConfirmed = false,
}) {
  const { data: existing, error: lookupError } = await db
    .from('voice_contact_preferences')
    .select('language_code,safe_start_time,safe_end_time')
    .eq('patient_id', patient.id)
    .maybeSingle();
  if (lookupError) throw lookupError;

  const now = new Date().toISOString();
  const { error } = await db.from('voice_contact_preferences').upsert({
    clinic_id: patient.clinic_id,
    patient_id: patient.id,
    phone_e164: phone,
    language_code: existing?.language_code || DEFAULT_LANGUAGE,
    consent_status: status === 'granted' ? 'granted' : 'revoked',
    consent_at: status === 'granted' ? now : null,
    consent_recorded_by: recordedBy,
    safe_start_time: existing?.safe_start_time || '09:00',
    safe_end_time: existing?.safe_end_time || '18:00',
    contact_is_parent_guardian: guardianConfirmed === true,
    timezone: 'Asia/Kolkata',
    updated_at: now,
  }, { onConflict: 'patient_id' });
  if (error) throw error;
}

export async function syncCampaignConsentToAgent(db, {
  patient,
  phone,
  status,
  source = 'digital_form',
  recordedBy,
  guardianConfirmed = false,
}) {
  const { data: existing, error: lookupError } = await db
    .from('voice_agent_consents')
    .select('id,opted_out,wrong_number,consent_source')
    .eq('patient_id', patient.id)
    .eq('phone_e164', phone)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (status === 'granted' && (existing?.opted_out || existing?.wrong_number)) {
    const error = new Error(existing.opted_out
      ? 'This recipient has opted out. Staff cannot override this preference.'
      : 'This phone number is blocked as incorrect. Verify the patient contact before recording consent.');
    error.code = existing.opted_out ? 'opted_out' : 'wrong_number';
    throw error;
  }

  const now = new Date().toISOString();
  const { error } = await db.from('voice_agent_consents').upsert({
    clinic_id: patient.clinic_id,
    patient_id: patient.id,
    phone_e164: phone,
    consent_status: status === 'granted' ? 'granted' : 'revoked',
    consent_source: existing?.consent_source || source,
    consent_recorded_by: recordedBy,
    consent_recorded_at: now,
    guardian_confirmed: guardianConfirmed === true,
    opted_out: existing?.opted_out === true,
    opted_out_at: existing?.opted_out_at || null,
    wrong_number: existing?.wrong_number === true,
    wrong_number_at: existing?.wrong_number_at || null,
    updated_at: now,
  }, { onConflict: 'patient_id,phone_e164' });
  if (error) throw error;
}
