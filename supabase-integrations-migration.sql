-- Continuum integrations and voice-policy extension.
-- No ABHA number or health-record contents are stored by this migration.

create extension if not exists pgcrypto;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  subscription jsonb not null,
  device_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "users read own push subscriptions" on public.push_subscriptions;
create policy "users read own push subscriptions" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "users create own push subscriptions" on public.push_subscriptions;
create policy "users create own push subscriptions" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "users update own push subscriptions" on public.push_subscriptions;
create policy "users update own push subscriptions" on public.push_subscriptions
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "users delete own push subscriptions" on public.push_subscriptions;
create policy "users delete own push subscriptions" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Document provenance for manually uploaded, patient-authorised ABDM and U-WIN exports.
alter table public.documents
  add column if not exists source_system text not null default 'manual_upload',
  add column if not exists external_record_reference text,
  add column if not exists external_consent_reference text;
alter table public.documents drop constraint if exists documents_source_system_check;
alter table public.documents add constraint documents_source_system_check
  check (source_system in ('manual_upload','abdm_export','uwin_export'));

-- Consent audit references only; do not put health-record contents in this table.
create table if not exists public.abdm_consent_audit (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  consent_reference text not null,
  consent_status text not null check (consent_status in ('requested','granted','denied','revoked','expired')),
  purpose text not null,
  hiu_id text,
  hip_id text,
  requested_by uuid,
  event_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists abdm_consent_patient_idx
  on public.abdm_consent_audit(clinic_id, patient_id, created_at desc);
alter table public.abdm_consent_audit enable row level security;
drop policy if exists "clinic members read ABDM consent audit" on public.abdm_consent_audit;
create policy "clinic members read ABDM consent audit" on public.abdm_consent_audit
  for select to authenticated using (exists (
    select 1 from public.clinic_members cm
    where cm.user_id = auth.uid() and cm.clinic_id = abdm_consent_audit.clinic_id
  ));
grant select on public.abdm_consent_audit to authenticated;

-- Voice agent v0.1: record an explicit patient/guardian contact role and preserve unknown consent.
alter table public.voice_contact_preferences
  add column if not exists contact_is_parent_guardian boolean not null default false;
alter table public.voice_contact_preferences
  drop constraint if exists voice_contact_preferences_consent_status_check;
alter table public.voice_contact_preferences
  add constraint voice_contact_preferences_consent_status_check
  check (consent_status in ('not_recorded','granted','revoked'));

-- Existing demo purposes are mapped to the five approved administrative call purposes.
alter table public.voice_calls drop constraint if exists voice_calls_purpose_check;
update public.voice_calls set purpose = case purpose
  when 'appointment_reminder' then 'appointment_confirmation'
  when 'document_followup' then 'documents_pending'
  when 'admin_followup' then 'callback_request'
  when 'postpartum_visit' then 'postpartum_followup'
  when 'newborn_visit' then 'postpartum_followup'
  when 'immunisation_appointment' then 'appointment_confirmation'
  else purpose
end
where purpose in (
  'appointment_reminder','document_followup','admin_followup',
  'postpartum_visit','newborn_visit','immunisation_appointment'
);
alter table public.voice_calls add constraint voice_calls_purpose_check
  check (purpose in (
    'appointment_confirmation',
    'documents_pending',
    'reschedule_request',
    'postpartum_followup',
    'callback_request'
  ));

-- Two attempts maximum for one call request; the retry is scheduled 48 hours later.
alter table public.voice_calls
  add column if not exists attempt_count integer not null default 0;

-- Clinic staff must maintain national/public holiday dates here before voice dispatch is enabled.
create table if not exists public.voice_call_block_dates (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  blocked_date date not null,
  reason text not null default 'Clinic holiday',
  created_at timestamptz not null default now(),
  unique(clinic_id, blocked_date)
);
alter table public.voice_call_block_dates enable row level security;
drop policy if exists "clinic members read voice call block dates" on public.voice_call_block_dates;
create policy "clinic members read voice call block dates" on public.voice_call_block_dates
  for select to authenticated using (exists (
    select 1 from public.clinic_members cm
    where cm.user_id = auth.uid() and cm.clinic_id = voice_call_block_dates.clinic_id
  ));
grant select on public.voice_call_block_dates to authenticated;

-- Dispatch only on Monday-Saturday, 09:00-20:00 IST, inside the patient's narrower
-- saved window, outside clinic-maintained holiday dates, and for at most two attempts.
create or replace function public.claim_due_voice_calls(p_limit integer default 20)
returns table(
  id uuid, clinic_id uuid, patient_id uuid, purpose text,
  scheduled_at timestamptz, language_code text, context jsonb
)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with due as (
    select vc.id
    from public.voice_calls vc
    join public.voice_contact_preferences vp on vp.patient_id=vc.patient_id
    where vc.status='scheduled'
      and vc.scheduled_at<=now()
      and vc.consent_snapshot=true
      and vp.consent_status='granted'
      and coalesce(vc.attempt_count,0)<2
      and extract(isodow from (now() at time zone coalesce(vp.timezone,'Asia/Kolkata'))) between 1 and 6
      and (now() at time zone coalesce(vp.timezone,'Asia/Kolkata'))::time
        >= greatest(vp.safe_start_time, time '09:00')
      and (now() at time zone coalesce(vp.timezone,'Asia/Kolkata'))::time
        < least(vp.safe_end_time, time '20:00')
      and not exists (
        select 1 from public.voice_call_block_dates bd
        where bd.clinic_id=vc.clinic_id
          and bd.blocked_date=(now() at time zone coalesce(vp.timezone,'Asia/Kolkata'))::date
      )
    order by vc.scheduled_at
    for update of vc skip locked
    limit greatest(1,least(p_limit,100))
  )
  update public.voice_calls vc
    set status='dispatching',
        attempt_count=coalesce(vc.attempt_count,0)+1,
        updated_at=now()
  from due
  where vc.id=due.id
  returning vc.id,vc.clinic_id,vc.patient_id,vc.purpose,vc.scheduled_at,vc.language_code,vc.context;
end;
$$;
revoke all on function public.claim_due_voice_calls(integer) from public,anon,authenticated;
grant execute on function public.claim_due_voice_calls(integer) to service_role;
