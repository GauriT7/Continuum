# Continuum voice integration runbook

## Architecture

- GitHub is the source of truth for application code, tests and migrations.
- Vercel hosts the Continuum UI and server-side API routes.
- Supabase stores patient, journey, appointment, document, consent, call and task records.
- Sarvam Voice Agents provides the conversation runtime and outbound telephony integration.

The browser must never receive a Sarvam API key or Supabase service-role key. All provider calls are server-to-server through Vercel.

## Two existing outbound paths

Continuum currently retains two distinct paths pending a future, reviewed database migration:

1. **Instant single-recipient Voice Agent**
   - API: `/api/voice-agent/calls`
   - Consent table: `voice_agent_consents`
   - Call table: `voice_agent_calls`
   - Callback: `POST /api/voice-agent/webhook/{VOICE_AGENT_WEBHOOK_SECRET}`
   - Requires a deployed Sarvam app version and a verified outbound connection.

2. **Scheduled campaign outreach**
   - API: `/api/voice`
   - Dispatch worker: `/api/voice-dispatch`
   - Consent table: `voice_contact_preferences`
   - Call table: `voice_calls`; attempt log: `voice_call_attempts`
   - Callback: `POST /api/voice-webhook?token={VOICE_WEBHOOK_SECRET}`
   - Requires a Sarvam campaign, its configured callback URL and an external scheduler.

Consent changes are mirrored between the two consent tables. The campaign dispatcher now requires a matching, granted `voice_agent_consents` row for the exact patient phone number as well as the campaign preference. The UI's `not_recorded` state is stored as `revoked` in the database because absence of consent is never permission to call. Existing campaign preferences that predate the mirror must be reconfirmed through the preference form before they can dispatch. This is intentionally fail-closed.

## Supabase schema migration

Before deploying these code changes to a database that has not already been updated, run `supabase-voice-integration-unification-migration.sql` in Supabase SQL Editor. It additively supplies the guardian-contact and campaign attempt-count columns and expands the campaign purpose constraint while retaining legacy values. The base `supabase-voice-migration.sql` has also been updated for fresh installations. Do not assume a checked-in SQL file has been applied to the live database; verify the columns and constraint in Supabase after running it.

## Vercel environment variables

Configure values in Vercel Project Settings → Environment Variables. Keep all API keys, service-role keys and webhook/cron secrets as **Secret** values. Never prefix secrets with `VITE_`. The legacy `SARVAM_API_KEY` remains accepted as the voice API key fallback; Sarvam documents an account API subscription key for its API endpoints, with Voice Agent endpoints using the `X-API-Key` header. Keep `SARVAM_VOICE_API_KEY` as the clearer preferred name if you want to distinguish the same credential.

### Supabase

| Variable | Type | Environments |
|---|---|---|
| `SUPABASE_URL` | Config | Production + Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Production + Preview |
| `SUPABASE_ANON_KEY` | Config | Production + Preview, or use the existing `VITE_SUPABASE_ANON_KEY` Preview fallback |
| `VITE_SUPABASE_URL` | Config | Production + Preview |
| `VITE_SUPABASE_ANON_KEY` | Config | Production + Preview |

### Shared Sarvam credential and organisation

| Variable | Type | Notes |
|---|---|---|
| `SARVAM_VOICE_API_KEY` | Secret | Preferred variable name |
| `SARVAM_API_KEY` | Secret | Existing legacy name; supported as a fallback |
| `SARVAM_ORG_ID` | Config | Sarvam organisation ID |
| `SARVAM_WORKSPACE_ID` | Config | Sarvam workspace ID |

The code prefers `SARVAM_VOICE_API_KEY`, then falls back to the existing `SARVAM_API_KEY`. Do not create another key solely to rename it. If using the existing key, make sure Vercel stores it as Secret, not Config.

### Instant Voice Agent

| Variable | Type | Notes |
|---|---|---|
| `SARVAM_APP_ID` | Config | Exact deployed application ID |
| `SARVAM_APP_VERSION` | Config | Positive committed version |
| `SARVAM_CONNECTION_ID` | Config | Verified outbound telephony connection |
| `SARVAM_AGENT_PHONE_NUMBER` | Config | Provider-issued outbound number in E.164 |
| `VOICE_AGENT_WEBHOOK_SECRET` | Secret | Random, high-entropy secret for the webhook path |
| `PUBLIC_BASE_URL` | Config | Stable public Continuum HTTPS origin |
| `SARVAM_APP_DEPLOYED` | Config | Set to `true` only after confirming the exact app/version is deployed in Sarvam |
| `SARVAM_CONNECTION_VERIFIED` | Config | Set to `true` only after confirming the connection and caller number can make outbound calls |
| `VOICE_INSTANT_CALLS_ENABLED` | Config | Keep `false` until the controlled end-to-end test has passed |

The instant calling readiness endpoint also uses Vercel's `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` as a fallback when `PUBLIC_BASE_URL` is omitted. Prefer an explicit stable production URL for callbacks.

### Scheduled Campaign

| Variable | Type | Notes |
|---|---|---|
| `SARVAM_CAMPAIGN_ID` | Config | Existing Sarvam outbound campaign |
| `SUPABASE_URL` | Config | Database endpoint used by dispatcher |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret | Server-only dispatcher database access |
| `VOICE_WEBHOOK_SECRET` | Secret | Token used by `/api/voice-webhook?token=...` |
| `CRON_SECRET` | Secret | Bearer token required by `/api/voice-dispatch` |
| `SARVAM_CAMPAIGN_WEBHOOK_CONFIGURED` | Config | Set to `true` only after the exact callback URL is saved in Sarvam campaign Advanced settings |
| `VOICE_DISPATCH_SCHEDULER_CONFIGURED` | Config | Set to `true` only after an external scheduler is configured and verified |
| `VOICE_DISPATCH_ENABLED` | Config | Keep `false` until campaign + webhook + scheduler tests pass |

There is currently no `crons` entry in `vercel.json`. The repository already includes `supabase-cron-setup.sql`, which uses Supabase `pg_cron`, `pg_net` and Vault to invoke `POST https://<production-domain>/api/voice-dispatch` every minute with `Authorization: Bearer <CRON_SECRET>`. Enable the required Supabase extensions, store the production URL and the exact Vercel `CRON_SECRET` in Vault, then run the SQL once. Verify successful runs in Supabase Cron before setting `VOICE_DISPATCH_SCHEDULER_CONFIGURED=true`. Until this is done, scheduled call records will remain queued/scheduled and will not dispatch automatically.

## Webhook contracts and limitations

### Instant call webhook

Configure the callback URL for each instant outbound request as:

`https://<production-domain>/api/voice-agent/webhook/<VOICE_AGENT_WEBHOOK_SECRET>`

The handler checks the path secret, the matching stored call and provider attempt ID, and an HMAC correlation token placed in the outbound request metadata. This is **not** a provider-signed raw-body webhook signature. Verify Sarvam's actual callback authentication options before accepting untrusted provider traffic at production scale.

### Campaign webhook

Configure the campaign callback URL in the Sarvam campaign's Advanced settings:

`https://<production-domain>/api/voice-webhook?token=<VOICE_WEBHOOK_SECRET>`

The current handler authenticates using the high-entropy path/query token over HTTPS and deduplicates by provider attempt ID. It does **not** validate a provider HMAC signature. Do not claim signed-webhook verification unless the provider contract and code are updated to support it.

The dispatcher does not send a per-cohort callback URL in its request body; it relies on the campaign-level webhook configuration. The manual `SARVAM_CAMPAIGN_WEBHOOK_CONFIGURED` flag is therefore required before readiness can be reported.

## Calling-hours and consent safeguards

- All outbound calling is limited to Monday–Saturday, 09:00–20:00 IST, excluding configured `CALLING_HOLIDAYS`.
- Campaign calling must also fall within each patient's saved `safe_start_time` and `safe_end_time`.
- The schedule API rejects out-of-window appointments.
- If a dispatch worker runs outside a recipient's saved window, it returns the call to `scheduled` and defers it to the next permitted window.
- Scheduled dispatch requires a valid DOB, explicit matching consent for the exact saved phone, and guardian confirmation for minors.
- Opt-outs and wrong-number events are mirrored between consent stores and block pending future campaigns.
- Emergency/clinical escalation must never be recorded as successful routine reminder delivery.
- Simulated calls create records only; they do not run the Sarvam conversation and do not dial a phone.

## Activation sequence

1. Verify exact Sarvam Voice Agents application ID and committed version.
2. Deploy that version in Sarvam and verify its published deployment state.
3. Attach and verify an outbound telephony connection and E.164 caller number.
4. Add the instant-path variables in Vercel, with live calling still disabled.
5. Configure the instant callback and verify a non-production or staff-controlled test event.
6. Configure campaign ID, campaign Advanced webhook and external scheduler.
7. Reconfirm any legacy campaign consent through the UI so it is mirrored to the instant consent table.
8. Run automated tests and a controlled consenting staff-number test; verify call outcome, callback task, transcript handling, opt-out and duplicate event behaviour.
9. Only then enable the corresponding dispatch flag. Keep the two flags independent.

## Claims we can and cannot make

A successful Vercel build only verifies code deployment. It does not prove that a Sarvam agent is deployed, that a number is attached, that a call was placed, or that a webhook was delivered. Report these as separate verification milestones.
