-- Optional minute-level scheduler for the Continuum voice dispatch worker.
-- Enable pg_cron, pg_net and Supabase Vault from Database > Extensions first.
-- Add the same CRON_SECRET value to Vercel and Supabase Vault. Do not commit real secrets.

-- Run once, replacing placeholders with your deployment URL and Vercel CRON_SECRET.
select vault.create_secret('https://YOUR-CONTINUUM-DEPLOYMENT.vercel.app', 'continuum_public_url');
select vault.create_secret('REPLACE_WITH_THE_EXACT_VERCEL_CRON_SECRET', 'continuum_cron_secret');

-- This calls the server-side worker every minute. It does not place calls while
-- VOICE_DISPATCH_ENABLED is false in Vercel. The API independently enforces that gate.
select cron.schedule(
  'continuum-voice-dispatch',
  '* * * * *',
  $$
    select net.http_post(
      url := (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'continuum_public_url'
      ) || '/api/voice-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'continuum_cron_secret'
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    ) as request_id;
  $$
);

-- To pause/remove the scheduler:
-- select cron.unschedule(jobid) from cron.job where jobname = 'continuum-voice-dispatch';

-- Monitor runs in Supabase Dashboard > Integrations > Cron (or query cron.job_run_details).
-- No patient identifiers or call data should be added to cron arguments or logs.
