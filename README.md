# Continuum — Care, connected.

A fresh, role-based redesign for the MaatriLoop / Elara concept.

## Workspaces
- **My Journey** — patient/couple experience with an approachable checklist, journey timeline, appointments and documents.
- **Care Desk** — clinic operations overview, patient journeys, task queue, document inbox and communication.
- **Field Desk** — mobile-friendly beneficiary follow-ups, route list and voice-first update entry point.

## Design system
The three workspaces use separate accent systems:
- Patient: botanical green / warm ivory
- Care team: muted indigo / cool neutrals
- Field team: terracotta / sand

The UI uses Manrope + DM Sans, Lucide icons, responsive layouts and Framer Motion transitions. The design intentionally keeps AI out of the way; the interface is organised around the user's job, not a generic chat box.

## Run locally
```bash
npm install
npm run dev
```
Open the local Vite URL.

## Build
```bash
npm run build
npm run preview
```

## GitHub Pages
This project uses a relative Vite base (`./`) so it can be hosted from a repository subpath. In GitHub, enable Pages using GitHub Actions or deploy the `dist` folder from your preferred workflow.

## Current implementation status
This is a polished interactive frontend prototype using synthetic demo content. Workspace switching, navigation, search/filtering, task completion, task creation, notifications and patient detail selection work locally.

The document upload, message composer, voice capture, backend, authentication, database and Sarvam API calls are currently UI entry points only. They are not wired to production services yet.

## Product and safety boundaries
The app coordinates clinician-approved administrative tasks. It must not determine investigations, interpret results, recommend care pathways or make clinical decisions. Use synthetic data only until authentication, role-based access, consent, encryption, audit logging, retention/deletion controls and data governance are implemented.

## Sarvam integration plan
Keep all Sarvam API calls behind a server-side gateway. Never expose `SARVAM_API_KEY` in Vite/browser code. Suggested service boundaries:
- Vision/document parsing: extract administrative document metadata for human confirmation.
- Saaras speech-to-text: transcribe patient or field-worker voice updates.
- Translate: prepare patient communications in the selected language.
- Bulbul text-to-speech: play approved workflow messages.
- LLM/tool calling: propose task events; require human approval before updating authoritative records or sending messages.
