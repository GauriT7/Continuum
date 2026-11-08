-- Continuum LiveKit browser voice invitations.
-- Apply this additive migration in Supabase SQL Editor before using LiveKit calls.
-- Invitation tokens are stored only as SHA-256 hashes. The service role manages rows.
create extension if not exists pgcrypto;

create table if not exists public.livekit_voice_invites (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  token_hash text not null unique,
  room_name text not null unique,
  agent_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  message text not null,
  status text not null default 'created' check (status in ('created','connecting','completed','expired','failed')),
  expires_at timestamptz not null,
  recipient_consent_confirmed boolean not null default false,
  recipient_consent_confirmed_by uuid references auth.users(id),
  recipient_consent_confirmed_at timestamptz,
  guardian_confirmed boolean not null default false,
  joined_at timestamptz,
  dispatch_started_at timestamptz,
  livekit_dispatch_id text,
  completed_at timestamptz,
  duration_seconds integer,
  failure_reason text,
  created_at timestamptz not null default now()
);
create index if not exists livekit_voice_invites_clinic_created_idx on public.livekit_voice_invites(clinic_id, created_at desc);
create index if not exists livekit_voice_invites_expiry_idx on public.livekit_voice_invites(status, expires_at);
alter table public.livekit_voice_invites enable row level security;
revoke all on public.livekit_voice_invites from anon, authenticated;
grant select, insert, update, delete on public.livekit_voice_invites to service_role;
comment on table public.livekit_voice_invites is 'Expiring browser voice invitations; raw invitation tokens are never stored.';
