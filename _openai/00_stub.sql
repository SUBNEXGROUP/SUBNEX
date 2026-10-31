-- Minimal stand-in for the production objects subnex_web_booking touches.
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create schema subnex_private;
create schema vault;
create schema net;
create schema cron;
do $r$ begin if not exists (select 1 from pg_roles where rolname=$q$anon$q$) then create role anon; create role authenticated; end if; end $r$;

create table vault.decrypted_secrets(name text, decrypted_secret text);
create table net._http_response(id bigserial primary key, status_code int, content text, error_msg text, timed_out bool, created timestamptz default now());
create table net.calls(id bigserial primary key, url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds int) returns bigint
language sql as $$ insert into net.calls(url,body,headers) values(url,body,headers) returning id $$;
create table cron.job(jobname text, schedule text, command text);
create function cron.schedule(n text, s text, c text) returns bigint language sql as $$ insert into cron.job values(n,s,c); select 1::bigint $$;

create table public.drivers(id uuid primary key default gen_random_uuid(), active bool default true);
insert into public.drivers default values;
create table subnex_private.intake_tokens(id serial, driver_id uuid, active bool, channel text);
create table subnex_private.auto_plan_config(singleton bool primary key default true, service_minutes int default 4);
insert into subnex_private.auto_plan_config default values;
create table subnex_private.dispatch_zones(code text, mode text);
create table subnex_private.dispatch_backups(name text, definition text);
create table public.addresses(id uuid primary key default gen_random_uuid(), text text, phone text, note text, bags int, bags_text text,
  contact_name text, contact_email text, lat float8, lng float8, geocode_source text, driver_id uuid, status text, kind text,
  collection_source text, intake_channel text, intake_source text, intake_ref text, estimated_kg int, service_minutes int,
  arrival_mode text, close_reason text);
create table subnex_private.web_bookings(id uuid primary key default gen_random_uuid(), created_at timestamptz default clock_timestamp(),
  email text, phone text, postcode text, address_id uuid, outcome text, detail text, ip text, ad jsonb);
create table subnex_private.log(fn text, address_id uuid, at timestamptz default clock_timestamp());

create function subnex_private.phone(p text) returns text language sql as $$ select nullif(regexp_replace(p,'\D','','g'),'') $$;
create function subnex_private.planner_key(p text) returns text language sql as $$ select lower(regexp_replace(p,'\W','','g')) $$;
-- served = postcode starts CF / NP; anything else → no zone
create function subnex_private.dispatch_zone_for(p text) returns subnex_private.dispatch_zones language sql as $$
  select case when p ~ '(CF|NP)[0-9]' then row('CF','weekly')::subnex_private.dispatch_zones else row(null,null)::subnex_private.dispatch_zones end $$;
create function subnex_private.close_request(a uuid, r text, n bool) returns jsonb language plpgsql as $$
begin update public.addresses set status='cancelled', close_reason=r where id=a; insert into subnex_private.log values('close:'||r,a); return '{}'; end $$;
create function subnex_private.auto_plan_skip(a uuid) returns text language sql as $$ select null::text $$;
create function subnex_private.auto_plan_days(a uuid) returns date[] language sql as $$ select array[current_date+3] $$;
create function subnex_private.site_book_day(a uuid, d date) returns jsonb language plpgsql as $$
begin insert into subnex_private.log values('book',a); update public.addresses set status='planned' where id=a; return '{"ok":true}'; end $$;
create function subnex_private.email_offer(a uuid, d date, x bool) returns jsonb language plpgsql as $$
begin insert into subnex_private.log values('email_offer',a); return '{"ok":true}'; end $$;
create function subnex_private.web_duplicate_notice(a uuid) returns boolean language plpgsql as $$
begin insert into subnex_private.log values('dup_notice',a); return true; end $$;
create function subnex_private.site_email_enqueue(a uuid, k text, key text, x jsonb) returns void language plpgsql as $$
begin insert into subnex_private.log values('received',a); end $$;
