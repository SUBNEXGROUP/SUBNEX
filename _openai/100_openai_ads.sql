-- 100_openai_ads.sql — ChatGPT Ads (OpenAI): event lead_created for each NEW website request in a served area.
--
-- What it does
--   * subnex_web_booking returns  new:true + lead_event_id  ONLY for a new request in a served area.
--     Duplicates, bots, out-of-area, rate-limited and failed requests never get them.
--   * The same lead_event_id is used by the browser Pixel (event_id) and by the server Conversions API (id),
--     so OpenAI keeps one event (dedup key = pixel id + event name + id).
--   * Server events go only when the visitor accepted cookies (p_data.oai.consent = 'granted').
--   * oppref from the ad link is kept in web_bookings.ad (as are gclid / utm) and passed unchanged.
--   * The Conversions API key lives in Supabase Vault (secret 'openai_ads_capi_key'), never in site files.
--   * Off by default: subnex_private.oai_config.enabled = false, validate_only = true.
--   * Test mode: a request from oai_config.test_email is closed at once ('operator_removed', no messages),
--     never reaches the planner or routes, and its server event is always sent with validate_only = true.
--
-- Safe to run twice. Backup of the previous subnex_web_booking → dispatch_backups '100:subnex_web_booking'.
-- No DROP statements (the connector cancels them).

create table if not exists subnex_private.oai_config (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  pixel_id text,
  validate_only boolean not null default true,
  test_email text,
  last_run_at timestamptz,
  last_note text
);
insert into subnex_private.oai_config(singleton) values (true) on conflict do nothing;
alter table subnex_private.oai_config enable row level security;

alter table subnex_private.web_bookings add column if not exists oai_event_id uuid;
alter table subnex_private.web_bookings add column if not exists consent text;

create table if not exists subnex_private.oai_events (
  id uuid primary key,                       -- = lead_event_id = Pixel event_id
  address_id uuid,
  created_at timestamptz not null default now(),
  validate_only boolean not null default true,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','sent','failed','skipped')),
  request_id bigint,
  attempts int not null default 0,
  last_try_at timestamptz,
  sent_at timestamptz,
  http_status int,
  error text
);
alter table subnex_private.oai_events enable row level security;
create index if not exists oai_events_state_idx on subnex_private.oai_events(state);

create or replace function subnex_private.oai_sha256(p text) returns text
language sql immutable set search_path to '' as $$
  select case when coalesce(p,'')='' then null else encode(extensions.digest(convert_to(p,'UTF8'),'sha256'),'hex') end
$$;

-- Phone for matching: country code, digits only, no leading + or zeros. UK 07… → 447…
create or replace function subnex_private.oai_phone(p text) returns text
language plpgsql immutable set search_path to '' as $$
declare d text := regexp_replace(coalesce(p,''),'\D','','g');
begin
  if d ~ '^00' then d := substr(d,3);
  elsif d ~ '^0' then d := '44'||substr(d,2);
  end if;
  d := regexp_replace(d,'^0+','');
  if length(d) between 8 and 15 then return d; end if;
  return null;
end $$;

create or replace function subnex_private.oai_is_test(p_email text) returns boolean
language sql stable set search_path to '' as $$
  select coalesce((select lower(btrim(c.test_email)) = lower(btrim(p_email))
                     from subnex_private.oai_config c where c.singleton and coalesce(c.test_email,'')<>''), false)
$$;

-- Called from subnex_web_booking. Never raises: tracking must not break a booking.
create or replace function subnex_private.oai_lead(p_address uuid, p_data jsonb, p_test boolean, p_new boolean)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare
  c subnex_private.oai_config;
  a public.addresses;
  ev uuid := gen_random_uuid();
  v_consent text := nullif(left(btrim(coalesce(p_data->'oai'->>'consent','')),10),'');
  h json := current_setting('request.headers',true)::json;
  v_ip text; v_ua text; v_pc text; v_user jsonb; v_payload jsonb; v_page text; v_oppref text; v_obref text;
begin
  if not coalesce(p_new,false) then return jsonb_build_object('new',false); end if;
  begin
    update subnex_private.web_bookings set oai_event_id = ev, consent = v_consent
     where id = (select w.id from subnex_private.web_bookings w
                  where w.address_id = p_address and w.outcome = 'created' order by w.created_at desc limit 1);

    select * into c from subnex_private.oai_config where singleton;
    if v_consent = 'granted' and coalesce(c.enabled,false) and coalesce(c.pixel_id,'') <> '' then
      select * into a from public.addresses where id = p_address;
      v_ip := left(btrim(split_part(coalesce(h->>'cf-connecting-ip', h->>'x-forwarded-for',''),',',1)),64);
      v_ua := left(btrim(coalesce(h->>'user-agent','')),512);
      v_pc := upper(regexp_replace(btrim(coalesce(p_data->>'postcode','')),'\s+',' ','g'));
      v_page := coalesce(nullif(p_data->'ad'->>'page',''),'/');
      if v_page !~ '^/[A-Za-z0-9/_.-]*$' then v_page := '/'; end if;
      v_oppref := nullif(btrim(coalesce(p_data->'ad'->>'oppref','')),'');
      if length(v_oppref) > 300 then v_oppref := null; end if;
      v_obref := nullif(btrim(coalesce(p_data->'oai'->>'obref','')),'');
      if v_obref !~ '^[A-Za-z0-9-]{8,64}$' then v_obref := null; end if;

      v_user := jsonb_strip_nulls(jsonb_build_object(
        'emails_sha256', case when coalesce(a.contact_email,'')<>'' then jsonb_build_array(subnex_private.oai_sha256(lower(btrim(a.contact_email)))) end,
        'phone_numbers_sha256', case when subnex_private.oai_phone(p_data->>'phone') is not null
                                     then jsonb_build_array(subnex_private.oai_sha256(subnex_private.oai_phone(p_data->>'phone'))) end,
        'postal_codes', case when v_pc ~ '^[A-Z0-9 ]{5,8}$' then jsonb_build_array(v_pc) end,
        'countries', jsonb_build_array('GB'),
        'obref', v_obref,
        'ip_address', nullif(v_ip,''),
        'user_agent', nullif(v_ua,'')));

      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'id', ev::text,
        'type', 'lead_created',
        'timestamp_ms', (extract(epoch from clock_timestamp())*1000)::bigint,
        'oppref', v_oppref,
        'source_url', 'https://subnex.co.uk' || v_page,
        'action_source', 'web',
        'user', v_user,
        'data', jsonb_build_object('type','customer_action')));

      insert into subnex_private.oai_events(id, address_id, validate_only, payload)
      values (ev, p_address, coalesce(c.validate_only,true) or coalesce(p_test,false), v_payload)
      on conflict (id) do nothing;
    end if;
  exception when others then
    return jsonb_build_object('new',true);   -- booking stays; no event id → no OpenAI event
  end;
  return jsonb_strip_nulls(jsonb_build_object('new',true,'lead_event_id',ev::text,'test',case when p_test then true end));
end $$;

-- Worker (cron every minute). Reads replies, retries up to 5 times with the SAME id (OpenAI keeps the first).
create or replace function subnex_private.oai_send() returns jsonb
language plpgsql security definer set search_path to '' as $$
declare c subnex_private.oai_config; k text; e record; r record; n_sent int := 0; n_new int := 0;
begin
  select * into c from subnex_private.oai_config where singleton;

  for e in select * from subnex_private.oai_events where state = 'sending' for update skip locked loop
    select * into r from net._http_response where id = e.request_id;
    if r.id is not null then
      if r.status_code between 200 and 299 then
        update subnex_private.oai_events set state='sent', sent_at=now(), http_status=r.status_code, error=null where id=e.id;
        n_sent := n_sent + 1;
      else
        update subnex_private.oai_events
           set state = case when e.attempts >= 5 or r.status_code = 400 then 'failed' else 'pending' end,
               http_status = r.status_code,
               error = left(coalesce(r.error_msg, r.content::text, ''),500)
         where id = e.id;
      end if;
    elsif e.last_try_at < now() - interval '30 minutes' then
      update subnex_private.oai_events set state = 'pending', error = 'no reply' where id = e.id;
    end if;
  end loop;

  update subnex_private.oai_events set state='skipped', error='older than 7 days'
   where state='pending' and created_at < now() - interval '6 days 20 hours';

  if not coalesce(c.enabled,false) or coalesce(c.pixel_id,'') = '' then
    update subnex_private.oai_config set last_run_at=now(), last_note='off' where singleton;
    return jsonb_build_object('enabled',false);
  end if;
  select decrypted_secret into k from vault.decrypted_secrets where name = 'openai_ads_capi_key' limit 1;
  if coalesce(k,'') = '' then
    update subnex_private.oai_config set last_run_at=now(), last_note='no API key in Vault (openai_ads_capi_key)' where singleton;
    return jsonb_build_object('enabled',true,'key',false);
  end if;

  for e in select * from subnex_private.oai_events
            where state = 'pending' and (last_try_at is null or last_try_at < now() - (attempts * interval '2 minutes'))
            order by created_at limit 50 for update skip locked loop
    update subnex_private.oai_events
       set state='sending', attempts=attempts+1, last_try_at=now(),
           request_id = net.http_post(
             url := 'https://bzr.openai.com/v1/events?pid=' || c.pixel_id,
             body := jsonb_build_object('validate_only', e.validate_only, 'events', jsonb_build_array(e.payload)),
             headers := jsonb_build_object('Authorization','Bearer '||k,'Content-Type','application/json'),
             timeout_milliseconds := 10000)
     where id = e.id;
    n_new := n_new + 1;
  end loop;

  update subnex_private.oai_config set last_run_at=now(),
         last_note = format('sent %s, queued %s', n_sent, n_new) where singleton;
  return jsonb_build_object('enabled',true,'sent',n_sent,'queued',n_new);
end $$;

revoke all on function subnex_private.oai_lead(uuid,jsonb,boolean,boolean) from public, anon, authenticated;
revoke all on function subnex_private.oai_send() from public, anon, authenticated;

-- Patch subnex_web_booking in place (same technique as 35/36/37): three exact replacements, stop if any is missing.
do $mig$
declare src text; dst text;
  a1 text := $q$'page','referrer']) k$q$;
  b1 text := $q$'page','referrer','oppref']) k$q$;
  a2 text := $q$   return jsonb_build_object('ok',true,'served',false);
  end if;
 end if;$q$;
  b2 text := $q$   return jsonb_build_object('ok',true,'served',false);
  end if;
 end if;
 if v_existing is null and subnex_private.oai_is_test(v_email) then /* OAI_TEST_V1: never reaches the planner */
  perform subnex_private.close_request(v_id,'operator_removed',false);
  return jsonb_build_object('ok',true)||subnex_private.oai_lead(v_id,p_data,true,true);
 end if;$q$;
  a3 text := $q$ return jsonb_build_object('ok',true,'booked',v_booked,$q$;
  b3 text := $q$ return /* OAI_LEAD_V1 */ subnex_private.oai_lead(v_id,p_data,false,v_existing is null)||jsonb_build_object('ok',true,'booked',v_booked,$q$;
begin
  src := pg_get_functiondef('public.subnex_web_booking(jsonb)'::regprocedure);
  if position('OAI_LEAD_V1' in src) > 0 then raise notice '100: subnex_web_booking already patched'; return; end if;
  if position(a1 in src) = 0 then raise exception '100: ad key list not found'; end if;
  if position(a2 in src) = 0 then raise exception '100: served=false block not found'; end if;
  if position(a3 in src) = 0 then raise exception '100: final return not found'; end if;
  insert into subnex_private.dispatch_backups(name, definition)
  select '100:subnex_web_booking', src
   where not exists (select 1 from subnex_private.dispatch_backups where name = '100:subnex_web_booking');
  dst := replace(replace(replace(src, a1, b1), a2, b2), a3, b3);
  execute dst;
end $mig$;

-- Cron: every minute; does nothing while there is nothing to send.
do $c$
begin
  if not exists (select 1 from cron.job where jobname = 'subnex-openai-capi') then
    perform cron.schedule('subnex-openai-capi', '* * * * *', 'select subnex_private.oai_send()');
  end if;
end $c$;
