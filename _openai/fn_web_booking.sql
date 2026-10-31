CREATE OR REPLACE FUNCTION public.subnex_web_booking(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_name text:=left(btrim(coalesce(p_data->>'name','')),100);
 v_email text:=lower(left(btrim(coalesce(p_data->>'email','')),200));
 v_phone_raw text:=left(btrim(coalesce(p_data->>'phone','')),40);
 v_phone text;
 v_pc text:=upper(regexp_replace(left(btrim(coalesce(p_data->>'postcode','')),12),'\s+',' ','g'));
 v_addr text:=left(btrim(regexp_replace(coalesce(p_data->>'address',''),'\s+',' ','g')),300);
 v_bags text:=coalesce(p_data->>'bags','');
 v_note text:=left(btrim(coalesce(p_data->>'notes','')),1000);
 v_text text; v_driver uuid; v_id uuid; v_existing uuid; v_bags_text text;
 v_lat float8; v_lng float8; v_booked boolean:=false;
 v_pick date:=case when coalesce(p_data->>'day','') ~ '^\d{4}-\d{2}-\d{2}$' then (p_data->>'day')::date end; v_ad jsonb; v_days date[]; v_res jsonb; v_offered boolean:=false; z subnex_private.dispatch_zones;
 v_ip text:=left(btrim(split_part(coalesce(current_setting('request.headers',true)::json->>'cf-connecting-ip',
   current_setting('request.headers',true)::json->>'x-forwarded-for',''),',',1)),64);
begin
 if coalesce(p_data->>'website','')<>'' or coalesce((p_data->>'elapsed_ms')::numeric,99999)<3000 then
  insert into subnex_private.web_bookings(ip,email,phone,postcode,outcome,detail) values(v_ip,v_email,v_phone_raw,v_pc,'bot',null);
  return jsonb_build_object('ok',true);
 end if;
 if length(v_name)<2 then raise exception 'NAME_REQUIRED'; end if;
 if v_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[a-z]{2,}$' then raise exception 'EMAIL_INVALID'; end if;
 if v_phone_raw<>'' and length(regexp_replace(v_phone_raw,'\D','','g'))<10 then raise exception 'PHONE_INVALID'; end if;
 if v_pc !~ '^[A-Z]{1,2}[0-9][A-Z0-9]? ?[0-9][A-Z]{2}$' then raise exception 'POSTCODE_INVALID'; end if;
 if length(v_addr)<5 then raise exception 'ADDRESS_REQUIRED'; end if;
 v_bags_text:=case v_bags when '1-5' then '1 to 5 bags' when '5-10' then '5 to 10 bags' when '10+' then '10+ bags' else null end;
 if v_bags_text is null then raise exception 'BAGS_REQUIRED'; end if;
 if v_pc !~ ' ' then v_pc:=left(v_pc,length(v_pc)-3)||' '||right(v_pc,3); end if;

 if (select count(*) from subnex_private.web_bookings w where w.created_at>now()-interval '1 day'
      and (w.email=v_email or (v_phone_raw<>'' and w.phone=v_phone_raw)) and w.outcome in ('created','duplicate'))>=3
   or (select count(*) from subnex_private.web_bookings w where w.created_at>now()-interval '1 day')>=300
   or (v_ip<>'' and (select count(*) from subnex_private.web_bookings w where w.ip=v_ip and w.created_at>now()-interval '1 hour')>=5)
   or (v_ip<>'' and (select count(*) from subnex_private.web_bookings w where w.ip=v_ip and w.created_at>now()-interval '1 day')>=15) then
  insert into subnex_private.web_bookings(ip,email,phone,postcode,outcome,detail) values(v_ip,v_email,v_phone_raw,v_pc,'limited',null);
  raise exception 'TOO_MANY_REQUESTS';
 end if;

 select nullif(jsonb_object_agg(k,left(btrim(p_data->'ad'->>k),300)) filter (where coalesce(btrim(p_data->'ad'->>k),'')<>''),'{}'::jsonb)
   into v_ad
   from unnest(array['gclid','gbraid','wbraid','utm_source','utm_medium','utm_campaign','utm_term','utm_content','page','referrer']) k
  where jsonb_typeof(p_data->'ad')='object';
 v_phone:=subnex_private.phone(v_phone_raw);
 begin
  v_lat:=nullif(p_data->>'lat','')::float8; v_lng:=nullif(p_data->>'lng','')::float8;
  if not (v_lat between 49.8 and 60.9 and v_lng between -8.7 and 1.8) then v_lat:=null; v_lng:=null; end if;
 exception when others then v_lat:=null; v_lng:=null; end;
 v_text:=case when upper(replace(v_addr,' ','')) like '%'||replace(v_pc,' ','')||'%' then v_addr else v_addr||', '||v_pc end;

 select t.driver_id into v_driver from subnex_private.intake_tokens t
  join public.drivers d on d.id=t.driver_id and d.active
  where t.active and t.channel='subnex_website' order by t.id limit 1;
 if v_driver is null and (select count(*) from public.drivers where active)=1 then
  select id into v_driver from public.drivers where active;
 end if;

 select a.id into v_existing from public.addresses a
  where a.status in ('new','planned') and subnex_private.planner_key(a.text)=subnex_private.planner_key(v_text) limit 1;

 if v_existing is null then
  insert into public.addresses(text,phone,note,bags,bags_text,contact_name,contact_email,lat,lng,geocode_source,
   driver_id,status,kind,collection_source,intake_channel,intake_source,intake_ref,estimated_kg,service_minutes,arrival_mode)
  values(v_text,v_phone,v_note,0,v_bags_text,v_name,v_email,v_lat,v_lng,case when v_lat is not null then 'postcode' end,
   v_driver,'new','d2d','subnex','subnex_website','website','web-'||to_char(now(),'YYYYMMDDHH24MISS')||'-'||left(md5(v_email||v_phone_raw),6),
   10,coalesce((select c.service_minutes from subnex_private.auto_plan_config c where c.singleton),1),'window')
  returning id into v_id;
  insert into subnex_private.web_bookings(ip,email,phone,postcode,address_id,outcome,ad) values(v_ip,v_email,v_phone_raw,v_pc,v_id,'created',v_ad);
 else
  v_id:=v_existing;
  insert into subnex_private.web_bookings(ip,email,phone,postcode,address_id,outcome,ad) values(v_ip,v_email,v_phone_raw,v_pc,v_id,'duplicate',v_ad);
 end if;

 if v_existing is null then
  z:=subnex_private.dispatch_zone_for(v_text);
  if z.code is null or z.mode='off' then
   perform subnex_private.close_request(v_id,'area_not_served_yet',false);
   return jsonb_build_object('ok',true,'served',false);
  end if;
 end if;
 if v_existing is null and v_lat is not null then
  begin
   if subnex_private.auto_plan_skip(v_id) is null then
    v_days:=subnex_private.auto_plan_days(v_id);
    if coalesce(array_length(v_days,1),0)>0 then
     perform pg_advisory_xact_lock(hashtextextended(v_driver::text,73));
     -- SITE_DATE_PICK_V1: the customer chose a day on the site — book it straight away if it is still on offer.
     if v_pick is not null and v_pick=any(v_days) then
      begin
       v_res:=subnex_private.site_book_day(v_id,v_pick);
       v_booked:=coalesce((v_res->>'ok')::boolean,false);
      exception when others then v_booked:=false;
      end;
     end if;
     if v_booked then v_offered:=true;
     else
      v_res:=subnex_private.email_offer(v_id,v_days[1],true);
      v_offered:=coalesce((v_res->>'ok')::boolean,false);
     end if;
    end if;
   end if;
  exception when others then v_offered:=false;
  end;
 end if;
 if v_existing is not null then /* DUPLICATE_NOTICE_V1 */
  begin v_offered:=subnex_private.web_duplicate_notice(v_id); exception when others then v_offered:=false; end;
 end if;
 if not v_offered then
  perform subnex_private.site_email_enqueue(v_id,'received','received:'||left(md5(v_email),12),'{}'::jsonb);
 end if;

 return jsonb_build_object('ok',true,'booked',v_booked,'day',case when v_booked then v_pick end,
  'day_label',case when v_booked then to_char(v_pick,'FMDay FMDD FMMonth') end,'picked',v_pick is not null);
end $function$
;
