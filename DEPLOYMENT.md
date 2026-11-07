# Continuum deployment runbook

## Production architecture

- **Source of truth:** this repository (`GauriT7/Continuum`).
- **Full-stack host:** Vercel, connected to this repository and the `main` branch.
- **Build:** `npm install` then `npm run build`.
- **Output directory:** `dist`.
- **Server functions:** every file under `api/` is a Vercel Node.js function. Keep the frontend and API on the same Vercel origin so existing `/api/...` requests remain same-origin.
- **Static showcase:** `archivegauri.in/continuum/` is a static guest preview only. GitHub Pages cannot execute Node API routes. Do not copy the `api/` folder into the archive and expect it to run.

## Vercel project settings

Import or confirm the existing project uses:
- Repository: `GauriT7/Continuum`
- Production branch: `main`
- Framework preset: Vite
- Root directory: `.`
- Build command: `npm run build`
- Output directory: `dist`
- Install command: `npm install`

The repository's `api/` directory should remain at the project root. Do not set a static-only output mode.

## Environment variables

Add values in **Vercel → Project → Settings → Environment Variables**. Set them for Production and Preview as appropriate, then redeploy after changing them.

### Required for staff login and core data

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase URL embedded in the browser client |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key embedded in the browser client |
| `SUPABASE_URL` | Same Supabase project URL for server functions |
| `SUPABASE_ANON_KEY` | Matching anon/publishable key for authenticated server requests |

The two URL values and the two anon-key values must each refer to the **same Supabase project**. Do not put a service-role key in a `VITE_*` variable or browser code.

### Sarvam AI

| Variable | Purpose |
|---|---|
| `SARVAM_API_KEY` | Server-side Sarvam API access |

The key stays server-side. Do not expose it in a Vite variable.

### Staff-device push notifications

| Variable | Purpose |
|---|---|
| `VAPID_PUBLIC_KEY` | Web Push public key |
| `VAPID_PRIVATE_KEY` | Web Push private key |
| `VAPID_SUBJECT` | Contact URI, e.g. `mailto:ops@example.com` |

Generate a matching key pair using `npx web-push generate-vapid-keys`. Keep the private key only in Vercel environment variables. The `push_subscriptions` table migration must be applied before registering devices.

### Voice outreach (keep disabled until approved)

The voice routes require the matching Sarvam Voice Agent / telephony configuration and secrets documented in `.env.example` and `VOICE-AGENT-SETUP.md`. Keep `VOICE_DISPATCH_ENABLED=false` and `VOICE_INSTANT_CALLS_ENABLED=false` until the agent, Exotel connection, signed webhook, consent/guardian checks, clinic calling windows, holiday block dates and acceptance tests are verified. A scheduled call record is not proof that a phone call was placed.

### ABDM

The current `/api/abdm` endpoint is a readiness indicator only. Sandbox credentials do not activate HIU/HIP exchange. Do not represent ABDM record retrieval as live.

## Database setup

1. Open the Supabase SQL Editor for the project used by the app.
2. Inspect the existing schema and RLS policies before running migrations.
3. Apply the voice migration only if its tables do not already exist and the base clinic/patient tables match.
4. Apply `supabase-integrations-migration.sql` after reviewing its dependencies.
5. Review and run `supabase-voice-agent-instant-migration.sql` only if the instant voice-agent feature is being enabled.
6. Review `supabase-cron-setup.sql` separately; it requires the relevant Supabase extensions and Vault secrets.
7. Create/verify a clinic, a clinic membership for the test staff user, and a test patient using fictional data.

Do not run all SQL files blindly or twice without checking the current schema. Keep real patient data out of demo testing.

## Release verification checklist

- [ ] Vercel deployment is Ready and built from the latest `main` commit.
- [ ] `/api/health` returns HTTP 200.
- [ ] Staff sign-in succeeds with a test account.
- [ ] Clinic membership and RLS allow only the correct clinic's records.
- [ ] Patient, journey, task and appointment create/read/update flows persist after refresh.
- [ ] Document upload uses a private Supabase Storage bucket and signed-in access.
- [ ] Sarvam translation, speech and document functions work with a test input.
- [ ] Push registration and test notification work on an installed device.
- [ ] Voice remains in simulation until every safety gate is verified.
- [ ] ABDM remains labelled as not live until formal onboarding and exchange callbacks are implemented.

## Safety

Continuum is a maternal-health coordination tool, not a substitute for clinical judgement. Use fictional data during deployment testing. Do not send diagnoses, pregnancy details, report contents or other sensitive health information in push payloads. Do not place automated calls without recorded consent and the required safeguards.
