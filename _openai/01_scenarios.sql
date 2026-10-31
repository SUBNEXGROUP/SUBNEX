\set ON_ERROR_STOP 1
create temp table res(n serial, name text, ok bool, got text);
create function pg_temp.req(email text, pc text, extra jsonb default '{}') returns jsonb language sql as $$
  select set_config('request.headers',json_build_object('x-forwarded-for','203.0.113.'||(1+floor(random()*250))::int,'user-agent','Mozilla/5.0 Test')::text,false);
  update subnex_private.web_bookings set created_at=created_at-interval '2 days';
  select public.subnex_web_booking(jsonb_build_object('name','Test Person','email',email,'phone','07700 900123','postcode',pc,
    'address','12 Test Street','bags','1-5','elapsed_ms',9000,'lat',51.5,'lng',-3.2,
    'ad',jsonb_build_object('gclid','G-1','utm_source','chatgpt','oppref','opp_ABC-123','page','/collect/','junk','x'),
    'oai',jsonb_build_object('consent','granted','obref','123e4567-e89b-42d3-a456-426614174000')) || extra) $$;

select set_config('request.headers','{"x-forwarded-for":"203.0.113.9","user-agent":"Mozilla/5.0 Test"}',false);

-- 1. Disabled config: new lead still gets an event id (for the Pixel) but nothing is queued for the server.
do $$ declare r jsonb := pg_temp.req('a@x.co','CF10 1AA'); begin
 insert into res(name,ok,got) values('1 new served → new:true + id', r->>'new'='true' and r ? 'lead_event_id', r::text);
 insert into res(name,ok,got) values('1 disabled → nothing queued', (select count(*) from subnex_private.oai_events)=0, null);
end $$;

update subnex_private.oai_config set enabled=true, pixel_id='PIXEL_FROM_ADS_MANAGER', validate_only=false;

-- 2. New served request, consent granted.
do $$ declare r jsonb := pg_temp.req('b@x.co','CF11 2BB'); e subnex_private.oai_events; w subnex_private.web_bookings; begin
 select * into e from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid;
 select * into w from subnex_private.web_bookings where oai_event_id=(r->>'lead_event_id')::uuid;
 insert into res(name,ok,got) values('2 queued with same id', e.id is not null and e.payload->>'id'=r->>'lead_event_id', e.payload::text);
 insert into res(name,ok,got) values('2 event name lead_created / customer_action', e.payload->>'type'='lead_created' and e.payload->'data'->>'type'='customer_action', null);
 insert into res(name,ok,got) values('2 oppref passed unchanged', e.payload->>'oppref'='opp_ABC-123', null);
 insert into res(name,ok,got) values('2 email hashed, no raw PII', e.payload->'user'->'emails_sha256'->>0 = encode(extensions.digest('b@x.co','sha256'),'hex')
      and position('b@x.co' in e.payload::text)=0 and position('07700' in e.payload::text)=0, null);
 insert into res(name,ok,got) values('2 phone normalised 447700900123', e.payload->'user'->'phone_numbers_sha256'->>0 = encode(extensions.digest('447700900123','sha256'),'hex'), null);
 insert into res(name,ok,got) values('2 ip/ua/obref/source_url', e.payload->'user'->>'ip_address' like '203.0.113.%' and e.payload->'user'->>'user_agent'='Mozilla/5.0 Test'
      and e.payload->'user'->>'obref'='123e4567-e89b-42d3-a456-426614174000' and e.payload->>'source_url'='https://subnex.co.uk/collect/', null);
 insert into res(name,ok,got) values('2 utm/gclid/oppref kept in web_bookings.ad, junk dropped', w.ad->>'gclid'='G-1' and w.ad->>'utm_source'='chatgpt'
      and w.ad->>'oppref'='opp_ABC-123' and not (w.ad ? 'junk') and w.consent='granted' and w.outcome='created', w.ad::text);
 insert into res(name,ok,got) values('2 planner still ran (email offer)', exists(select 1 from subnex_private.log l where l.fn='email_offer' and l.address_id=w.address_id), null);
end $$;

-- 3. Same address again → duplicate: no new, no event.
do $$ declare n0 int := (select count(*) from subnex_private.oai_events); r jsonb := pg_temp.req('b@x.co','CF11 2BB'); begin
 insert into res(name,ok,got) values('3 duplicate → new:false, no id', r->>'new'='false' and not (r ? 'lead_event_id'), r::text);
 insert into res(name,ok,got) values('3 duplicate → nothing queued', (select count(*) from subnex_private.oai_events)=n0, null);
end $$;

-- 4. Out of area → served:false, no new, no event.
do $$ declare n0 int := (select count(*) from subnex_private.oai_events); r jsonb := pg_temp.req('c@x.co','BS1 4DJ'); begin
 insert into res(name,ok,got) values('4 out of area → no new', r->>'served'='false' and not (r ? 'new'), r::text);
 insert into res(name,ok,got) values('4 out of area → nothing queued', (select count(*) from subnex_private.oai_events)=n0, null);
end $$;

-- 5. Bot (honeypot) → ok:true only.
do $$ declare r jsonb := pg_temp.req('d@x.co','CF14 3CC','{"website":"spam"}'); begin
 insert into res(name,ok,got) values('5 bot → no new', not (r ? 'new'), r::text);
end $$;

-- 6. Invalid form → exception, nothing stored.
do $$ declare n0 int := (select count(*) from subnex_private.oai_events); begin
 begin perform pg_temp.req('bad-email','CF14 3CC'); insert into res(name,ok) values('6 invalid email raises', false);
 exception when others then insert into res(name,ok,got) values('6 invalid email raises', sqlerrm='EMAIL_INVALID', sqlerrm); end;
 insert into res(name,ok,got) values('6 invalid → nothing queued', (select count(*) from subnex_private.oai_events)=n0, null);
end $$;

-- 7. Consent rejected → event id for nobody's Pixel (client checks consent), nothing to server.
do $$ declare n0 int := (select count(*) from subnex_private.oai_events); r jsonb := pg_temp.req('e@x.co','CF15 4DD','{"oai":{"consent":"denied"}}'); begin
 insert into res(name,ok,got) values('7 rejected cookies → no server event', (select count(*) from subnex_private.oai_events)=n0 and r->>'new'='true', r::text);
end $$;

-- 8. Test email: no address row at all (no triggers, no emails, no planner), event validate_only.
update subnex_private.oai_config set test_email='Collections+OAITest@subnex.co.uk';
do $$ declare na int := (select count(*) from public.addresses); nl int := (select count(*) from subnex_private.log);
  r jsonb := pg_temp.req('collections+oaitest@subnex.co.uk','CF24 5EE','{"day":"2030-01-01"}'); w subnex_private.web_bookings; e subnex_private.oai_events; begin
 select * into w from subnex_private.web_bookings where oai_event_id=(r->>'lead_event_id')::uuid;
 select * into e from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid;
 insert into res(name,ok,got) values('8 test → new:true test:true', r->>'new'='true' and r->>'test'='true', r::text);
 insert into res(name,ok,got) values('8 test → no address row created', (select count(*) from public.addresses)=na and w.address_id is null and w.outcome='test', w.outcome);
 insert into res(name,ok,got) values('8 test → no planner, no emails, nothing logged', (select count(*) from subnex_private.log)=nl, null);
 insert into res(name,ok,got) values('8 test → validate_only, email hash from form', e.validate_only and e.payload->'user'->'emails_sha256'->>0=encode(extensions.digest('collections+oaitest@subnex.co.uk','sha256'),'hex'), null);
end $$;
do $$ declare n0 int := (select count(*) from subnex_private.oai_events); r jsonb := pg_temp.req('collections+oaitest@subnex.co.uk','BS1 4DJ'); begin
 insert into res(name,ok,got) values('8 test + unserved postcode → no new, no event, no address', r->>'served'='false' and not (r ? 'new')
   and (select count(*) from subnex_private.oai_events)=n0 and exists(select 1 from subnex_private.web_bookings where outcome='test_unserved'), r::text);
end $$;
do $$ declare r1 jsonb := pg_temp.req('collections+oaitest@subnex.co.uk','CF24 5EE'); begin
 insert into res(name,ok,got) values('8 repeated test never becomes a duplicate', r1->>'new'='true', r1::text);
end $$;

-- 9. Worker: no key → waits; with key → posts once per event; 200 → sent; 500 → retry with same id; reply missing kept.
select subnex_private.oai_send();
insert into res(name,ok,got) select '9 no key → nothing posted', (select count(*) from net.calls)=0, (select last_note from subnex_private.oai_config);
insert into vault.decrypted_secrets values('openai_ads_capi_key','sk-test-not-real');
select subnex_private.oai_send();
insert into res(name,ok,got) select '9 posted 3 events', (select count(*) from net.calls)=3, (select string_agg(url,' ') from net.calls);
insert into res(name,ok,got) select '9 bearer header, validate flag', (select bool_and(headers->>'Authorization'='Bearer sk-test-not-real') from net.calls)
   and (select count(*) from net.calls where (body->>'validate_only')::bool)=2, null;
insert into net._http_response(id,status_code,content) select request_id, 200, '{}' from subnex_private.oai_events where validate_only;
insert into net._http_response(id,status_code,content) select request_id, 503, 'busy' from subnex_private.oai_events where not validate_only;
select subnex_private.oai_send();
insert into res(name,ok,got) select '9 validate_only + 200 → validated (not sent)', (select bool_and(state='validated') from subnex_private.oai_events where validate_only), null;
insert into res(name,ok,got) select '9 503 → pending for retry', (select state from subnex_private.oai_events where not validate_only)='pending', null;
update subnex_private.oai_events set last_try_at=now()-interval '1 hour' where state='pending';
select subnex_private.oai_send();
insert into res(name,ok,got) select '9 retry reuses same id', (select count(distinct body->'events'->0->>'id') from net.calls where not (body->>'validate_only')::bool)=1
   and (select count(*) from net.calls where not (body->>'validate_only')::bool)=2, null;
select subnex_private.oai_send();
insert into res(name,ok,got) select '9 no double post while waiting', (select count(*) from net.calls)=4, null;


-- 9b. Real event after retry: 200 → 'sent' (distinct from 'validated').
insert into net._http_response(id,status_code,content) select request_id, 200, '{}' from subnex_private.oai_events where not validate_only and state='sending';
select subnex_private.oai_send();
insert into res(name,ok,got) select '9b real event + 200 → sent', (select state from subnex_private.oai_events where not validate_only)='sent', null;
insert into res(name,ok,got) select '9b nobody is both sent and validate_only', not exists(select 1 from subnex_private.oai_events where state='sent' and validate_only), null;

-- 10. Consent withdrawn before the worker sends → nothing is posted.
update subnex_private.oai_config set validate_only=false;
do $$ declare r jsonb := pg_temp.req('f@x.co','CF31 1AA'); v jsonb; n0 int := (select count(*) from net.calls); begin
 v := public.subnex_oai_revoke(array[r->>'lead_event_id','not-a-uuid']);
 perform subnex_private.oai_send();
 insert into res(name,ok,got) values('10 revoke → pending dropped', v->>'dropped'='1' and v->>'already_sent'='0', v::text);
 insert into res(name,ok,got) values('10 revoke → event skipped consent_revoked', (select state||'/'||error from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid)='skipped/consent_revoked', null);
 insert into res(name,ok,got) values('10 revoke → nothing posted', (select count(*) from net.calls)=n0, null);
 insert into res(name,ok,got) values('10 revoke → booking consent revoked, request itself untouched',
   (select w.consent from subnex_private.web_bookings w where w.oai_event_id=(r->>'lead_event_id')::uuid)='revoked'
   and (select a.status from public.addresses a join subnex_private.web_bookings w on w.address_id=a.id where w.oai_event_id=(r->>'lead_event_id')::uuid)='new', null);
end $$;

-- 11. Consent changed by other means → worker re-checks before sending.
do $$ declare r jsonb := pg_temp.req('g@x.co','CF32 1AA'); n0 int := (select count(*) from net.calls); begin
 update subnex_private.web_bookings set consent='revoked' where oai_event_id=(r->>'lead_event_id')::uuid;
 perform subnex_private.oai_send();
 insert into res(name,ok,got) values('11 worker re-checks consent → not posted', (select count(*) from net.calls)=n0
   and (select state from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid)='skipped', null);
end $$;

-- 12. Revoke after hand-off: reported as already sent; a failed reply is NOT retried.
do $$ declare r jsonb := pg_temp.req('h@x.co','CF33 1AA'); v jsonb; n1 int; begin
 perform subnex_private.oai_send();                         -- now 'sending'
 v := public.subnex_oai_revoke(array[r->>'lead_event_id']);
 insert into net._http_response(id,status_code,content) select request_id, 503, 'busy' from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid;
 perform subnex_private.oai_send();
 update subnex_private.oai_events set last_try_at=now()-interval '1 hour' where id=(r->>'lead_event_id')::uuid;
 n1 := (select count(*) from net.calls);
 perform subnex_private.oai_send();
 insert into res(name,ok,got) values('12 revoke during hand-off → reported already_sent', v->>'already_sent'='1', v::text);
 insert into res(name,ok,got) values('12 failed in-flight event not retried after revoke', (select count(*) from net.calls)=n1
   and (select state from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid)='skipped', null);
 insert into res(name,ok,got) values('12 revoke RPC callable by anon', has_function_privilege('anon','public.subnex_oai_revoke(text[])','execute')
   and not has_function_privilege('anon','subnex_private.oai_send()','execute'), null);
end $$;

-- 13. Test email: real (non-validate) event only when test_validate_only=false; request still closed.
update subnex_private.oai_config set validate_only=true, test_validate_only=false;
do $$ declare r jsonb := pg_temp.req('collections+oaitest@subnex.co.uk','CF34 1AA'); begin
 insert into res(name,ok,got) values('13 test + test_validate_only=false → real event, still no address',
   not (select validate_only from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid)
   and (select w.address_id is null and w.outcome='test' from subnex_private.web_bookings w where w.oai_event_id=(r->>'lead_event_id')::uuid), r::text);
end $$;
do $$ declare r jsonb := pg_temp.req('i@x.co','CF35 1AA'); begin
 insert into res(name,ok,got) values('13 ordinary request still validate_only while global flag is on',
   (select validate_only from subnex_private.oai_events where id=(r->>'lead_event_id')::uuid), null);
end $$;

select n, case when ok then 'PASS' else 'FAIL' end r, name, case when not ok then got end from res order by n;
select count(*) filter (where ok) pass, count(*) filter (where not ok) fail from res;
