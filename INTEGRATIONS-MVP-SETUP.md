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
1. Apply \`supabase-integrations-migration.sql\` in the Supabase SQL Editor after reviewing it against the current schema.
2. Add \`VAPID_PUBLIC_KEY\`, \`VAPID_PRIVATE_KEY\` and \`VAPID_SUBJECT\` to Vercel. Generate a pair locally with \`npx web-push generate-vapid-keys\`.
3. Set \`CONTINUUM_DEMO_MODE=true\` only in the demo deployment.
4. Keep \`VOICE_DISPATCH_ENABLED\` unset or \`false\` until the prompt, campaign, Exotel connection, webhook signature/secret, calling window, holiday calendar, attempt rules and all 22 supplied test cases are verified.
5. Run \`npm install\`, \`npm run build\`, apply migrations and deploy to a preview environment first.

## Device notifications
Push is currently scoped to the signed-in staff account. It does not yet send patient-specific reminders. Patient delivery needs a verified patient portal identity, independent push consent and role-aware task/reminder fan-out. Use generic payloads only; never put diagnoses, report details, pregnancy stage or other sensitive health details in notification text.

HealthKit is not exposed to a React web app. Reading Health app or Apple Watch measurements needs a native iOS companion, the HealthKit entitlement and per-data-type permission. Web Push can reach the phone; iOS may forward notifications to a paired Apple Watch according to its settings.

## ABDM / ABHA
The API endpoint only reports whether sandbox variables are present. It does not create an ABHA identity, request consent, query an HIU/HIP or fetch records. Production ABDM exchange requires formal onboarding, consent lifecycle and callback flows, security/audit work and approvals. No ABHA number is stored by this change. For the prototype, upload patient-authorised ABHA-linked exports or U-WIN documents to the private Document Inbox, record their source, and have staff verify Sarvam-extracted administrative metadata.

## Voice safety boundary
This app code does not create a Sarvam agent or Exotel campaign. Voice dispatch is disabled by default. The uploaded agent spec contains 22 acceptance tests and unresolved launch decisions; do not enable dispatch until those are implemented and signed off. In particular, do not place calls without recorded consent, a known patient age/guardian status, purpose-specific context, clinic callback SLA, approved call window and tested opt-out propagation.
