# Continuum LiveKit browser voice integration

## What it does
The LiveKit path creates a time-limited invitation associated with an existing scheduled appointment. The recipient opens the invitation on an iPhone, Android or desktop browser, grants microphone permission, and joins a WebRTC room with the deployed Agent Builder agent.

This is a browser-to-browser internet voice session. It does not dial an ordinary telephone number and does not send an SMS or email. Staff must copy/share the invitation through an already approved channel.

## Required Vercel server-side variables
- LIVEKIT_URL — LiveKit project WebSocket URL (wss://…) or HTTPS server URL.
- LIVEKIT_API_KEY — project API key.
- LIVEKIT_API_SECRET — matching project API secret. Server-side only; never expose with a VITE_ prefix.
- LIVEKIT_AGENT_NAME — exact Agent Builder dispatch name (default: continuum-appointment-reminder).

Existing required Supabase settings are reused: SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.

## Supabase migration
Review and apply supabase-livekit-voice-migration.sql in the correct Supabase project. The API requires the livekit_voice_invites table. It is separate from the Sarvam call tables and legacy campaign calls.

## Staff workflow
1. Staff opens Care Desk → Operations Centre → Voice & Outreach.
2. Selects a scheduled appointment.
3. Confirms the recipient has agreed to receive and join the browser voice invitation. For patients under 18, staff also confirms parent/guardian agreement.
4. Continuum generates the exact appointment reminder and a random invitation token.
5. The invitation token is returned once to the staff UI. The database stores only its SHA-256 hash.
6. Staff copies/shares the link. The link expires after 30 minutes.

## Patient workflow
1. Patient opens /voice/join?token=… over HTTPS.
2. Patient explicitly taps Join call.
3. The public API validates the invitation and dispatches the configured LiveKit agent with the six Agent Builder metadata keys.
4. The API issues a short-lived participant token scoped to that room.
5. The patient grants microphone access and speaks to the agent.
6. When the patient ends the call, the page marks the invitation completed and requests best-effort room cleanup.

## Security and limitations
- LiveKit API credentials remain on the server.
- Invitation tokens are high-entropy random values; only SHA-256 hashes are stored.
- Invitations expire after 30 minutes.
- Participant access tokens are room-scoped and expire after 20 minutes.
- The invitation creator must be an authenticated member of the clinic.
- Appointment and patient records are looked up server-side and clinic-scoped.
- The staff UI requires explicit confirmation that the recipient agreed to join. Parent/guardian confirmation is required when the patient is under 18.
- The API does not dial phone numbers, send invitations by SMS/email, record audio, or produce a verified transcript/outcome. The first version records invitation and session completion, not an appointment decision.
- The AI agent must remain administrative only. No diagnosis, prescribing, triage, appointment cancellation or clinical interpretation is permitted.
- Use synthetic records for panel demonstrations.
