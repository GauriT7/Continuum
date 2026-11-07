# Continuum instant Sarvam Voice Agent — integration guide

## What this adds

The Operations Centre's existing **Voice & Outreach** tab now includes a separate single-recipient **AI Call Agent**. The message field is prefilled from the Bulbul spoken-reminder composer when that text is available.

The new path uses Sarvam's instant outbound API. It does not replace or modify the existing cohort/campaign dispatcher, legacy voice_calls table, or campaign webhook.

## Safety defaults

- VOICE_INSTANT_CALLS_ENABLED=false is the default and must remain false during setup.
- The default UI mode is **Simulation**. It creates a clearly labelled test record and does not contact Sarvam or dial a phone.
- A real call requires a clinic staff session, a patient in that staff member's clinic, a valid saved phone number, explicit recorded automated-call consent, age/guardian checks, exact message approval, calling-window checks, and a final confirmation dialog.
- The API never accepts a phone number from the browser. It re-reads patients.phone server-side.
- Opt-out and wrong-number outcomes block further calls to that patient/number. Staff cannot override an opt-out in this panel.
- No automatic retries are implemented.
- No appointment is booked, cancelled or changed by this agent.
- The existing campaign webhook remains untouched. Instant-call callbacks use /api/voice-agent/webhook/{secret}.

## 1. Review and apply the Supabase migration

File: supabase-voice-agent-instant-migration.sql

Before applying it:
1. Confirm the current Supabase project and take a database backup.
2. Confirm the existing clinics, clinic_members and patients tables use the expected IDs and that the patient phone field is patients.phone.
3. Review the new voice_agent_consents, voice_agent_calls and voice_agent_webhook_events tables and their RLS policies.
4. Apply the migration in Supabase SQL Editor.
5. Verify all three tables exist and RLS is enabled.

The new tables are intentionally separate from the legacy campaign voice_calls records. **This migration has not been run against your production Supabase project.**

## 2. Add Vercel environment variables

Use Vercel → Project → Settings → Environment Variables. Add values for Preview and Production only where appropriate. Never add real secrets to GitHub.

Existing variables reused:
- SUPABASE_URL
- SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only)
- SARVAM_VOICE_API_KEY
- SARVAM_ORG_ID
- SARVAM_WORKSPACE_ID

New or instant-call-specific variables:
- SARVAM_APP_ID
- SARVAM_APP_VERSION — integer, e.g. the published agent version number
- SARVAM_CONNECTION_ID
- SARVAM_AGENT_PHONE_NUMBER — the Sarvam-managed caller ID in E.164
- VOICE_AGENT_WEBHOOK_SECRET — a new, high-entropy secret; do not reuse the legacy campaign webhook secret
- PUBLIC_BASE_URL — the production HTTPS Continuum origin
- VOICE_INSTANT_CALLS_ENABLED=false
- SARVAM_CONTEXT_STRATEGY=agent_variables

Optional:
- VOICE_CONTEXT_HOOK_SECRET — needed only if you switch to SARVAM_CONTEXT_STRATEGY=on_start_hook
- CALLING_HOLIDAYS — comma-separated local clinic/public holiday dates as YYYY-MM-DD
- DEFAULT_CLINIC_CONTACT_NUMBER

Keep the existing VOICE_DISPATCH_ENABLED=false for the cohort campaign worker. It controls a different path.

## 3. Configure Sarvam Voice Agents

Use the standalone Cowork ZIP supplied with this project:
- agent/system-prompt.md
- agent/variables.json

In Sarvam Voice Agents:
1. Create and publish **Continuum Appointment Coordinator**.
2. Paste the system prompt into the agent instruction field.
3. Create the variables exactly as defined in agent/variables.json; bind prompt variables through Sarvam's variable picker.
4. Configure the supported languages: English, Hindi and Marathi.
5. Deploy → Phone Numbers → add a connection. For the initial prototype, use Sarvam-managed telephony ("Rent from Sarvam") after completing the required KYC and provisioning.
6. Record the published app_id, app_version, connection_id and assigned agent phone number in Vercel. Do not paste API keys or secrets into the browser.
7. Configure the agent's post-call webhook to the URL supplied by the instant outbound request. The backend includes a secret path and per-call HMAC metadata.

The per-call message is sent as app_config.agent_variables.message_to_read. The on-start hook is an alternate strategy only; it requires setting the agent's hook endpoint to /api/voice-agent/context/{call_reference} and configuring the x-continuum-hook-secret header in Sarvam. Leave the strategy on agent_variables for the first integration test.

## 4. Verification sequence

Do not switch live calling on until all checks are completed.

1. Deploy the PR with live calling still disabled.
2. Sign in as a clinic staff member and open Care Desk → Operations Centre → Voice & Outreach.
3. Select a **synthetic test patient** whose saved phone number belongs to the tester. Do not use an actual patient record for the first test.
4. Record consent only after the tester has actually agreed to automated test calls. For a minor record, the parent/guardian safeguards apply.
5. Paste a harmless administrative message and run a simulation. Confirm that the call report says **Simulation only** and **Message not delivered**.
6. Confirm an absent consent, revoked consent, wrong number and opted-out record all block the call.
7. Verify the Vercel configuration panel lists no missing settings after Sarvam is configured.
8. Confirm the webhook is publicly reachable over HTTPS. A localhost URL is not reachable by Sarvam.
9. Only after clinic approval, make one real test call to the consenting tester's phone during the permitted window. Verify the exact sentence, chosen language, identity gate, webhook correlation, call report and opt-out handling.
10. Keep VOICE_INSTANT_CALLS_ENABLED=false after the test until the clinic explicitly approves production calling.

The server enforces 09:00–20:00 IST, Monday–Saturday, excluding configured holidays. The end hour is exclusive.

## 5. New server routes

- GET /api/voice-agent/config — authenticated readiness check; returns setting names only, never values.
- GET /api/voice-agent/consents?patient_id=... — returns consent status and saved phone for a patient in the staff member's clinic.
- POST /api/voice-agent/consents — records explicit consent or revokes consent.
- GET /api/voice-agent/calls — clinic-scoped call history.
- POST /api/voice-agent/calls — creates a simulation or one instant outbound call.
- GET /api/voice-agent/calls/{id} — clinic-scoped call report.
- POST /api/voice-agent/webhook/{secret} — Sarvam instant outbound webhook with HMAC correlation and idempotency.
- GET|POST /api/voice-agent/context/{id} — optional authenticated agent on-start context hook.

## 6. What is not enabled or completed

- No Supabase migration has been executed.
- No Vercel environment values have been added by this integration.
- No Sarvam agent, phone number, KYC or webhook has been provisioned by this code change.
- Live outbound calling remains disabled by default.
- The legacy campaign and instant-call systems have separate tables, dispatch controls and webhook paths.
- The feature is not approved for production patient calling until the clinic completes its consent, safety, privacy and operational validation.
