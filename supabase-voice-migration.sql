-- Continuum Voice & Outreach MVP. Review IDs and RLS against the active Supabase schema.
create extension if not exists pgcrypto;

create table if not exists public.voice_contact_preferences (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null unique references public.patients(id) on delete cascade,
  phone_e164 text not null,
  language_code text not null default 'en-IN',
  consent_status text not null check (consent_status in ('granted','revoked')),
  consent_at timestamptz,
  consent_recorded_by uuid,
  safe_start_time time not null default '09:00',
  safe_end_time time not null default '18:00',
  timezone text not null default 'Asia/Kolkata',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint voice_phone_e164 check (phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$')
);

-- Recreate the E.164 constraint if this script is re-applied after an earlier version.
alter table public.voice_contact_preferences drop constraint if exists voice_phone_e164;
alter table public.voice_contact_preferences add constraint voice_phone_e164
  check (phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$');

create table if not exists public.voice_calls (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  purpose text not null check (purpose in ('appointment_reminder','document_followup','admin_followup','postpartum_visit','newborn_visit','immunisation_appointment')),
  scheduled_at timestamptz not null,
  language_code text not null default 'en-IN',
  context jsonb not null default '{}'::jsonb,
  consent_snapshot boolean not null default false,
  status text not null default 'scheduled' check (status in ('scheduled','dispatching','queued','retrying','completed','no_answer','busy','failed','dispatch_failed','blocked','cancelled')),
  sarvam_cohort_id text,
  dispatched_at timestamptz,
  completed_at timestamptz,
  call_duration numeric,
  call_outcome text,
  callback_requested boolean not null default false,
  failure_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_call_attempts (
  id uuid primary key default gen_random_uuid(),
  voice_call_id uuid not null references public.voice_calls(id) on delete cascade,
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  sarvam_attempt_id text not null unique,
  connectivity_status text,
  completion_status text,
  duration numeric,
  interaction_id text,
  failure_reason text,
  transcript jsonb,
  output_variables jsonb not null default '{}'::jsonb,
  executed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists voice_calls_due_idx on public.voice_calls(status,scheduled_at) where status='scheduled';
create index if not exists voice_calls_clinic_idx on public.voice_calls(clinic_id,scheduled_at desc);
create index if not exists voice_attempts_call_idx on public.voice_call_attempts(voice_call_id,created_at desc);

alter table public.voice_contact_preferences enable row level security;
alter table public.voice_calls enable row level security;
alter table public.voice_call_attempts enable row level security;

drop policy if exists "clinic members read voice preferences" on public.voice_contact_preferences;
create policy "clinic members read voice preferences" on public.voice_contact_preferences for select to authenticated
using (exists (select 1 from public.clinic_members cm join public.patients p on p.id=voice_contact_preferences.patient_id and p.clinic_id=voice_contact_preferences.clinic_id where cm.user_id=auth.uid() and cm.clinic_id=voice_contact_preferences.clinic_id));
drop policy if exists "clinic members manage voice preferences" on public.voice_contact_preferences;
create policy "clinic members manage voice preferences" on public.voice_contact_preferences for all to authenticated
using (exists (select 1 from public.clinic_members cm join public.patients p on p.id=voice_contact_preferences.patient_id and p.clinic_id=voice_contact_preferences.clinic_id where cm.user_id=auth.uid() and cm.clinic_id=voice_contact_preferences.clinic_id))
with check (exists (select 1 from public.clinic_members cm join public.patients p on p.id=voice_contact_preferences.patient_id and p.clinic_id=voice_contact_preferences.clinic_id where cm.user_id=auth.uid() and cm.clinic_id=voice_contact_preferences.clinic_id));

drop policy if exists "clinic members read voice calls" on public.voice_calls;
create policy "clinic members read voice calls" on public.voice_calls for select to authenticated
using (exists (select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_calls.clinic_id));
drop policy if exists "clinic members create voice calls" on public.voice_calls;
create policy "clinic members create voice calls" on public.voice_calls for insert to authenticated
with check (exists (select 1 from public.clinic_members cm join public.patients p on p.id=voice_calls.patient_id and p.clinic_id=voice_calls.clinic_id where cm.user_id=auth.uid() and cm.clinic_id=voice_calls.clinic_id));
drop policy if exists "clinic members cancel scheduled voice calls" on public.voice_calls;
create policy "clinic members cancel scheduled voice calls" on public.voice_calls for update to authenticated
using (status='scheduled' and exists (select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_calls.clinic_id))
with check (status='cancelled' and exists (select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_calls.clinic_id));

drop policy if exists "clinic members read voice attempts" on public.voice_call_attempts;
create policy "clinic members read voice attempts" on public.voice_call_attempts for select to authenticated
using (exists (select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_call_attempts.clinic_id));

grant select,insert,update on public.voice_contact_preferences to authenticated;
grant select,insert on public.voice_calls to authenticated;
revoke update on public.voice_calls from authenticated;
grant update(status,updated_at) on public.voice_calls to authenticated;
grant select on public.voice_call_attempts to authenticated;

create or replace function public.claim_due_voice_calls(p_limit integer default 20)
returns table(id uuid,clinic_id uuid,patient_id uuid,purpose text,scheduled_at timestamptz,language_code text,context jsonb)
language plpgsql security definer set search_path=public as $$
begin
  return query
  with due as (
    select vc.id from public.voice_calls vc
    join public.voice_contact_preferences vp on vp.patient_id=vc.patient_id and vp.clinic_id=vc.clinic_id
    where vc.status='scheduled' and vc.scheduled_at<=now()
      and vc.consent_snapshot=true and vp.consent_status='granted'
      and (now() at time zone coalesce(vp.timezone,'Asia/Kolkata'))::time between vp.safe_start_time and vp.safe_end_time
    order by vc.scheduled_at for update of vc skip locked limit greatest(1,least(p_limit,100))
  )
  update public.voice_calls vc set status='dispatching',updated_at=now()
  from due where vc.id=due.id
  returning vc.id,vc.clinic_id,vc.patient_id,vc.purpose,vc.scheduled_at,vc.language_code,vc.context;
end;
$$;
revoke all on function public.claim_due_voice_calls(integer) from public,anon,authenticated;
grant execute on function public.claim_due_voice_calls(integer) to service_role;
