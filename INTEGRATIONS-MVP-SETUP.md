# Continuum MVP integrations

This change adds a signed-in-user web-push path, an Integrations tab, document-source provenance for patient-authorised imports, and safer defaults for voice outreach.

## Added
- Web Push registration and a generic test notification for the authenticated Continuum account.
- PWA manifest and service worker. On iPhone, install through Safari's Share → Add to Home Screen flow before requesting notification permission.
- Apple Health/HealthKit boundary and Apple Watch notification-forwarding guidance.
- ABDM/ABHA readiness status, official registry links, document provenance and consent-reference schema.
- Existing Sarvam AI tools remain in Operations Centre: Saaras STT, Bulbul TTS, Mayura translation, Sarvam-105B assistant, and Document AI parse/classify/extract/split.
- Demo roster capped at three people when CONTINUUM_DEMO_MODE=true.
- Voice call purpose names aligned with the supplied Continuum Care Coordinator specification.

## Deploy steps
1. If the voice tables have not already been created, review and apply `supabase-voice-migration.sql` first. Then review and apply `supabase-integrations-migration.sql` in the Supabase SQL Editor. Confirm the existing table IDs, check constraints and RLS policies against your Supabase schema before execution.
2. Copy `.env.example` as a checklist and add the real values in Vercel Project Settings. Generate VAPID keys locally with `npx web-push generate-vapid-keys`; never commit the generated private key.
3. Set `CONTINUUM_DEMO_MODE=true` only in the demo deployment.
4. Configure `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, `VOICE_WEBHOOK_SECRET`, `SARVAM_API_KEY`, `SARVAM_VOICE_API_KEY`, `SARVAM_ORG_ID`, `SARVAM_WORKSPACE_ID` and `SARVAM_CAMPAIGN_ID` only after the matching resources exist. Keep `VOICE_DISPATCH_ENABLED=false` until the prompt, campaign, Exotel connection, webhook authentication, calling window, holiday calendar, attempt rules and all 22 supplied test cases are verified.
5. Vercel Cron is intentionally not configured in `vercel.json`. For minute-level dispatch, enable Supabase `pg_cron`, `pg_net` and Vault, then follow `supabase-cron-setup.sql`. Use the same long random `CRON_SECRET` in Vercel and Supabase Vault.
6. Populate `voice_call_block_dates` for each clinic's public/national holidays. The migration deliberately does not guess or auto-import a holiday calendar.
7. Run `npm install`, `npm run build`, apply the migrations and deploy to a preview environment first.

## Device notifications
Push is currently scoped to the signed-in staff account. It does not yet send patient-specific reminders. Patient delivery needs a verified patient portal identity, independent push consent and role-aware task/reminder fan-out. Use generic payloads only; never put diagnoses, report details, pregnancy stage or other sensitive health details in notification text.

HealthKit is not exposed to a React web app. Reading Health app or Apple Watch measurements needs a native iOS companion, the HealthKit entitlement and per-data-type permission. Web Push can reach the phone; iOS may forward notifications to a paired Apple Watch according to its settings.

## ABDM / ABHA
The API endpoint only reports whether sandbox variables are present. It does not create an ABHA identity, request consent, query an HIU/HIP or fetch records. Production ABDM exchange requires formal onboarding, consent lifecycle and callback flows, security/audit work and approvals. No ABHA number is stored by this change. For the prototype, upload patient-authorised ABHA-linked exports or U-WIN documents to the private Document Inbox, record their source, and have staff verify Sarvam-extracted administrative metadata.

## Voice safety boundary
This app code does not create a Sarvam agent or Exotel campaign. Voice dispatch is disabled by default. The uploaded agent spec contains 22 acceptance tests and unresolved launch decisions; do not enable dispatch until those are implemented and signed off. In particular, do not place calls without recorded consent, a known patient age/guardian status, purpose-specific context, clinic callback SLA, approved call window and tested opt-out propagation.
