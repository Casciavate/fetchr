create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'bot-agent-tick',
  '*/2 * * * *',
  $$select net.http_post(
    url := 'https://jvuzjmigkqolphkhzeei.supabase.co/functions/v1/bot-agent',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{"action":"tick"}'::jsonb
  )$$
);
