-- Run for existing tnc2 database. Includes the current carbon formula. No historical changes.
begin;
create or replace function public.tnc2_create_ride(p jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare me bigint; rid bigint; point jsonb; seats integer; owner bigint; km numeric; emissions numeric; pickup_day date;
begin
 me := (public.tnc2_profile()->>'id')::bigint;
 if coalesce(p->>'pickupDate','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'กรุณาเลือกวันที่รับผู้โดยสาร'; end if;
 pickup_day := (p->>'pickupDate')::date;
 if pickup_day < (now() at time zone 'Asia/Bangkok')::date then raise exception 'ไม่สามารถเลือกวันที่ก่อนวันนี้ได้'; end if;
 if p is null or not(p ?& array['id','shift','maxSeats','pickup','dest']) then raise exception 'ข้อมูลเที่ยวรถไม่ครบ'; end if;
 rid := (p->>'id')::bigint; seats := (p->>'maxSeats')::integer;
 if rid is null or rid<1 or rid>9007199254740991 or seats is null or seats not between 1 and 8 or p->>'shift' not in ('morning','evening') then raise exception 'ข้อมูลเที่ยวรถไม่ถูกต้อง'; end if;
 foreach point in array array[p->'pickup',p->'dest'] loop
  if point is null or not(point ?& array['name','lat','lng']) or jsonb_typeof(point->'lat')<>'number' or jsonb_typeof(point->'lng')<>'number' or coalesce(char_length(point->>'name'),0) not between 1 and 500 or abs((point->>'lat')::numeric)>90 or abs((point->>'lng')::numeric)>180 then raise exception 'จุดรับส่งไม่ถูกต้อง'; end if;
 end loop;
 if coalesce(p->>'distance','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'ระยะทางไม่ถูกต้อง'; end if;
 km := round((p->>'distance')::numeric,1);
 if km<0 or km>50000 then raise exception 'ระยะทางไม่ถูกต้อง'; end if;
 emissions := round((km/12)*2.7076,2);
 insert into public.tnc2_trips(id,owner_id,details,max_seats) values(rid,me,jsonb_build_object('pickupDate',to_char(pickup_day,'YYYY-MM-DD'),'shift',p->>'shift','date',to_char(now() at time zone 'Asia/Bangkok','DD/MM/YYYY HH24:MI'),'pickup',p->'pickup','dest',p->'dest','distance',km,'co2',emissions,'carbonMethod','distance-div12-times27076','kmPerLitre',12,'emissionFactor',2.7076),seats) on conflict(id) do nothing;
 select owner_id into owner from public.tnc2_trips where id=rid;
 if owner<>me then raise exception 'รหัสเที่ยวรถซ้ำ กรุณาลองใหม่'; end if;
 return rid;
end $$;

commit;
