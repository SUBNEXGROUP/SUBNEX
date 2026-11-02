-- 101_duplicate_today_window.sql — a repeat booking ON THE COLLECTION DAY, after the morning arrival-window
-- email has gone, gets "You are already booked in for today: between X and Y" instead of
-- "On the morning of your collection we will email you a time window".
-- The website thank-you screen gets the same window (today_window in the subnex_web_booking reply).
-- Every other case is unchanged. Email only (no SMS). Google conversion unchanged.
-- Backups: dispatch_backups '101:web_duplicate_notice', '101:site_mail', '101:subnex_web_booking'.

-- 1) Today's window for an address, if the morning ETA email was sent today. Null otherwise.
create or replace function subnex_private.web_today_window(p_address uuid) returns jsonb
language sql stable security definer set search_path to '' as $$
  select o.extra
    from subnex_private.email_outbox o
    join public.addresses a on a.id = o.address_id
   where o.address_id = p_address
     and a.status in ('new','planned')
     and a.date = (now() at time zone 'Europe/London')::date
     and o.kind = 'eta' and o.state = 'sent'
     and o.event_key = 'eta:' || to_char(a.date,'YYYY-MM-DD')
     and o.extra ? 'eta_from' and o.extra ? 'eta_to'
   order by o.created_at desc limit 1
$$;
revoke all on function subnex_private.web_today_window(uuid) from public, anon, authenticated;

-- 2) For the site reply: {"today_window":"1:55pm – 3:55pm"} on a duplicate, {} otherwise.
create or replace function subnex_private.web_dup_today(p_address uuid, p_duplicate boolean) returns jsonb
language plpgsql stable security definer set search_path to '' as $$
declare x jsonb;
begin
  if not coalesce(p_duplicate,false) then return '{}'::jsonb; end if;
  x := subnex_private.web_today_window(p_address);
  if x is null then return '{}'::jsonb; end if;
  return jsonb_build_object('today_window',
    subnex_private.sms_clock((x->>'eta_from')::int)||' – '||subnex_private.sms_clock((x->>'eta_to')::int));
exception when others then return '{}'::jsonb;
end $$;
revoke all on function subnex_private.web_dup_today(uuid,boolean) from public, anon, authenticated;

-- 3) site_mail('eta', …, {again:true}) → "already booked" wording instead of "Good morning".
do $m$
declare src text;
  a1 text := $q$  intro:='Good morning, '||first||'. Your collection is today and our driver is on the way.';$q$;
  b1 text := $q$  intro:='Good morning, '||first||'. Your collection is today and our driver is on the way.';
  if coalesce((p_extra->>'again')::boolean,false) then /* DUP_TODAY_V1 */
   subj:='You are already booked in: we are collecting today between '||coalesce(replace(win,' – ',' and '),'—');
   eyebrow:='Already booked'; h1:='You are already booked in for today, '||first||'!';
   intro:='There is no need to book again. Your collection is today and our driver will be with you in the window below.';
  end if;$q$;
begin
  src := pg_get_functiondef('subnex_private.site_mail(text,uuid,jsonb)'::regprocedure);
  if position('DUP_TODAY_V1' in src) > 0 then raise notice '101: site_mail already patched'; return; end if;
  if (length(src)-length(replace(src,a1,'')))/length(a1) <> 1 then raise exception '101: eta intro not found exactly once'; end if;
  insert into subnex_private.dispatch_backups(name,definition) select '101:site_mail',src
   where not exists(select 1 from subnex_private.dispatch_backups where name='101:site_mail');
  execute replace(src,a1,b1);
end $m$;

-- 4) web_duplicate_notice: on the day, after the ETA email → resend the window (eta, again).
do $m$
declare src text;
  a1 text := $q$ if a.status='planned' and a.date>=today then$q$;
  b1 text := $q$ if a.date=today then /* DUP_TODAY_V1 */
  declare w jsonb := subnex_private.web_today_window(p_address);
  begin
   if w is not null then
    return subnex_private.site_email_enqueue(p_address,'eta','eta-again:'||k,
     jsonb_build_object('day',a.date,'eta_from',w->'eta_from','eta_to',w->'eta_to','again',true)) is not null;
   end if;
  end;
 end if;
 if a.status='planned' and a.date>=today then$q$;
begin
  src := pg_get_functiondef('subnex_private.web_duplicate_notice(uuid)'::regprocedure);
  if position('DUP_TODAY_V1' in src) > 0 then raise notice '101: web_duplicate_notice already patched'; return; end if;
  if (length(src)-length(replace(src,a1,'')))/length(a1) <> 1 then raise exception '101: planned branch not found exactly once'; end if;
  insert into subnex_private.dispatch_backups(name,definition) select '101:web_duplicate_notice',src
   where not exists(select 1 from subnex_private.dispatch_backups where name='101:web_duplicate_notice');
  execute replace(src,a1,b1);
end $m$;

-- 5) subnex_web_booking reply carries today_window for a duplicate.
do $m$
declare src text;
  a1 text := $q$subnex_private.oai_lead(v_id,p_data,false,v_existing is null)||$q$;
  b1 text := $q$subnex_private.oai_lead(v_id,p_data,false,v_existing is null)||subnex_private.web_dup_today(v_id,v_existing is not null)||$q$;
begin
  src := pg_get_functiondef('public.subnex_web_booking(jsonb)'::regprocedure);
  if position('web_dup_today' in src) > 0 then raise notice '101: subnex_web_booking already patched'; return; end if;
  if (length(src)-length(replace(src,a1,'')))/length(a1) <> 1 then raise exception '101: final return not found exactly once'; end if;
  insert into subnex_private.dispatch_backups(name,definition) select '101:subnex_web_booking',src
   where not exists(select 1 from subnex_private.dispatch_backups where name='101:subnex_web_booking');
  execute replace(src,a1,b1);
end $m$;
