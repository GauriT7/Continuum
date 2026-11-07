-- Instant Sarvam Voice Agent records. Kept separate from legacy campaign voice_calls.
create extension if not exists pgcrypto;
create table if not exists public.voice_agent_consents(
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references public.clinics(id) on delete cascade,
 patient_id uuid not null references public.patients(id) on delete cascade,
 phone_e164 text not null,
 consent_status text not null check(consent_status in('granted','revoked')),
 consent_source text not null check(consent_source in('verbal_in_clinic','written_form','digital_form','phone_confirmation')),
 consent_recorded_by uuid not null,
 consent_recorded_at timestamptz not null default now(),
 guardian_confirmed boolean not null default false,
 opted_out boolean not null default false,
 opted_out_at timestamptz,
 wrong_number boolean not null default false,
 wrong_number_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint voice_agent_phone_e164 check(phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$'),
 unique(patient_id,phone_e164)
);
create index if not exists voice_agent_consents_clinic_patient_idx on public.voice_agent_consents(clinic_id,patient_id,created_at desc);

create table if not exists public.voice_agent_calls(
 id uuid primary key default gen_random_uuid(),
 clinic_id uuid not null references public.clinics(id) on delete cascade,
 patient_id uuid not null references public.patients(id) on delete cascade,
 created_by uuid not null,
 mode text not null check(mode in('simulated','live')),
 status text not null check(status in('simulated','pending','initiating','completed','no_answer','busy','failed','blocked')),
 language text not null check(language in('en-IN','hi-IN','mr-IN')),
 phone_e164 text not null,
 recipient_name text not null,
 clinic_name text not null,
 message text not null,
 message_sha256 text not null,
 appointment_datetime text,
 clinic_contact_number text,
 consent_snapshot jsonb not null default '{}'::jsonb,
 warnings jsonb not null default '[]'::jsonb,
 result jsonb,
 attempt_id text unique,
 interaction_id text,
 provider_status text,
 idempotency_key text unique,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 completed_at timestamptz,
 constraint voice_agent_calls_phone_e164 check(phone_e164 ~ E'^\\+[1-9][0-9]{7,14}$')
);
create index if not exists voice_agent_calls_clinic_created_idx on public.voice_agent_calls(clinic_id,created_at desc);
create index if not exists voice_agent_calls_patient_created_idx on public.voice_agent_calls(patient_id,created_at desc);
create unique index if not exists voice_agent_one_active_live_call_idx on public.voice_agent_calls(patient_id) where mode='live' and status in('pending','initiating');

create table if not exists public.voice_agent_webhook_events(
 attempt_id text not null,
 provider_status text not null,
 received_at timestamptz not null default now(),
 primary key(attempt_id,provider_status)
);

alter table public.voice_agent_consents enable row level security;
alter table public.voice_agent_calls enable row level security;
alter table public.voice_agent_webhook_events enable row level security;

drop policy if exists "clinic staff read instant voice consents" on public.voice_agent_consents;
create policy "clinic staff read instant voice consents" on public.voice_agent_consents for select to authenticated
using(exists(select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_agent_consents.clinic_id));
drop policy if exists "clinic staff insert instant voice consents" on public.voice_agent_consents;
create policy "clinic staff insert instant voice consents" on public.voice_agent_consents for insert to authenticated
with check(consent_recorded_by=auth.uid() and exists(select 1 from public.clinic_members cm join public.patients p on p.id=voice_agent_consents.patient_id and p.clinic_id=voice_agent_consents.clinic_id where cm.user_id=auth.uid() and cm.clinic_id=voice_agent_consents.clinic_id));
drop policy if exists "clinic staff update instant voice consents" on public.voice_agent_consents;
create policy "clinic staff update instant voice consents" on public.voice_agent_consents for update to authenticated
using(exists(select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_agent_consents.clinic_id))
with check(exists(select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_agent_consents.clinic_id));

drop policy if exists "clinic staff read instant voice calls" on public.voice_agent_calls;
create policy "clinic staff read instant voice calls" on public.voice_agent_calls for select to authenticated
using(exists(select 1 from public.clinic_members cm where cm.user_id=auth.uid() and cm.clinic_id=voice_agent_calls.clinic_id));
drop policy if exists "clinic staff insert instant voice calls" on public.voice_agent_calls;
create policy "clinic staff insert instant voice calls" on public.voice_agent_calls for insert to authenticated
with check(created_by=auth.uid() and exists(select 1 from public.clinic_members cm join public.patients p on p.id=voice_agent_calls.patient_id and p.clinic_id=voice_agent_calls.clinic_id where cm.user_id=auth.uid() and cm.clinic_id=voice_agent_calls.clinic_id));
drop policy if exists "clinic staff read instant voice webhook events" on public.voice_agent_webhook_events;
create policy "clinic staff read instant voice webhook events" on public.voice_agent_webhook_events for select to authenticated using(false);

grant select on public.voice_agent_consents to authenticated;
grant select on public.voice_agent_calls to authenticated;
revoke all on public.voice_agent_webhook_events from anon,authenticated;
grant select,insert,update,delete on public.voice_agent_webhook_events to service_role;
comment on table public.voice_agent_calls is 'Single-recipient Sarvam instant outbound calls, separate from the existing campaign workflow.';
comment on table public.voice_agent_consents is 'Explicit automated-call consent; a phone number alone is not consent.';
