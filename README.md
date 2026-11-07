[README.md](https://github.com/user-attachments/files/34514230/README.md)
# Continuum Supabase API patch

This patch adds a Supabase-authenticated task API to the existing Vite/Vercel project.

## Files
- `package.json`: adds `@supabase/supabase-js`
- `api/_lib/supabase.js`: creates a request-scoped Supabase client using the caller's bearer token
- `api/tasks.js`: GET, POST and PATCH task operations

## Vercel environment variables
Add these to Vercel Project Settings -> Environment Variables:
- `SUPABASE_URL`: Supabase Project URL
- `SUPABASE_ANON_KEY`: Supabase publishable/anon key

Do not use a service-role key in this frontend-connected API. The caller's access token is passed through so Supabase RLS applies.

## Routes
- `GET /api/tasks` (Bearer token required)
- `GET /api/tasks?patient_id=<uuid>` (Bearer token required)
- `GET /api/tasks?status=pending` (Bearer token required)
- `POST /api/tasks` with JSON `{ "clinic_id":"...", "patient_id":"...", "title":"..." }`
- `PATCH /api/tasks` with JSON `{ "id":"...", "status":"completed" }`

All operations require a valid Supabase user session and clinic membership enforced by database RLS.
