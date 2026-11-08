-- Continuum voice integration unification (additive, safe to apply to an existing project).
-- Run in Supabase SQL Editor after backing up / reviewing the target schema.
-- Does not enable live dispatch or alter existing patient consent records.

alter table public.voice_contact_preferences
  add column if not exists contact_is_parent_guardian boolean not null default false;

alter table public.voice_calls
  add column if not exists attempt_count integer not null default 0;

-- Keep older purpose values valid for existing rows while accepting the five
-- purpose identifiers used by the current Continuum VoiceOutreach UI/API.
alter table public.voice_calls
  drop constraint if exists voice_calls_purpose_check;

alter table public.voice_calls
  add constraint voice_calls_purpose_check
  check (purpose in (
    'appointment_reminder',
    'document_followup',
    'admin_followup',
    'postpartum_visit',
    'newborn_visit',
    'immunisation_appointment',
    'appointment_confirmation',
    'documents_pending',
    'reschedule_request',
    'postpartum_followup',
    'callback_request'
  ));

-- Clamp negative or null historical attempt counters to zero.
update public.voice_calls
set attempt_count = greatest(coalesce(attempt_count, 0), 0)
where attempt_count is null or attempt_count < 0;

comment on column public.voice_contact_preferences.contact_is_parent_guardian
  is 'Staff-confirmed indication that the saved number belongs to the parent/legal guardian when the patient is a minor.';
comment on column public.voice_calls.attempt_count
  is 'Number of provider call-completion events received for this scheduled campaign call.';
