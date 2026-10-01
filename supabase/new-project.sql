-- Run once in a NEW Supabase project, SQL Editor, as postgres.
begin;
create table public.tnc_profiles (
 id bigint generated always as identity primary key,
 auth_id uuid not null unique references auth.users(id) on delete cascade,
 name text not null check(char_length(name) between 2 and 100),
 phone text not null unique check(phone ~ '^0[0-9]{9}$'),
 email text not null,
 created_at timestamptz not null default now()
);
create table public.tnc_trips (
 id bigint primary key check(id>0 and id<=9007199254740991),
 owner_id bigint not null references public.tnc_profiles(id),
 details jsonb not null,
 status text not null default 'Pending' check(status in ('Pending','Full','In-Progress','Complete')),
 max_seats integer not null check(max_seats between 1 and 8),
 created_at timestamptz not null default now()
);
create table public.tnc_passengers (
 trip_id bigint not null references public.tnc_trips(id) on delete cascade,
 member_id bigint not null references public.tnc_profiles(id),
 created_at timestamptz not null default now(),
 primary key(trip_id,member_id)
);
alter table public.tnc_profiles enable row level security;
alter table public.tnc_trips enable row level security;
alter table public.tnc_passengers enable row level security;
-- Direct table access denied. Only explicitly granted RPCs expose scoped data.
revoke all on public.tnc_profiles,public.tnc_trips,public.tnc_passengers from anon,authenticated;

create function public.tnc_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare u auth.users; m public.tnc_profiles;
begin
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'กรุณายืนยันอีเมลก่อน'; end if;
 select * into m from public.tnc_profiles where auth_id=u.id;
 if m.id is null then
  if coalesce(u.raw_user_meta_data->>'name','') !~ '^.{2,100}$' or coalesce(u.raw_user_meta_data->>'phone','') !~ '^0[0-9]{9}$' then
   raise exception 'ข้อมูลสมาชิกไม่ครบ กรุณาติดต่อผู้ดูแล';
  end if;
  insert into public.tnc_profiles(auth_id,name,phone,email) values(u.id,u.raw_user_meta_data->>'name',u.raw_user_meta_data->>'phone',u.email)
   on conflict(auth_id) do nothing;
  select * into m from public.tnc_profiles where auth_id=u.id;
 end if;
 return jsonb_build_object('id',m.id,'name',m.name,'phone',m.phone,'email',u.email);
end $$;

create function public.tnc_rides() returns jsonb language plpgsql security definer set search_path='' as $$
declare me bigint; result jsonb;
begin
 me := (public.tnc_profile()->>'id')::bigint;
 select coalesce(jsonb_agg(x.doc order by x.created_at desc),'[]'::jsonb) into result from (
 select t.created_at,t.details || jsonb_build_object('id',t.id,'userId',t.owner_id,'userName',m.name,'driver',m.name,
 'userPhone',case when t.owner_id=me or exists(select 1 from public.tnc_passengers where trip_id=t.id and member_id=me) then m.phone else '' end,
 'status',t.status,'maxSeats',t.max_seats,'bookedSeats',(select count(*) from public.tnc_passengers where trip_id=t.id),
 'availableSeats',t.max_seats-(select count(*) from public.tnc_passengers where trip_id=t.id),
 'passengers',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'phone',case when t.owner_id=me or p.id=me then p.phone else '' end,'bookedAt',b.created_at)) from public.tnc_passengers b join public.tnc_profiles p on p.id=b.member_id where b.trip_id=t.id),'[]'::jsonb)) doc
 from public.tnc_trips t join public.tnc_profiles m on m.id=t.owner_id
 ) x;
 return result;
end $$;

create function public.tnc_create_ride(p jsonb) returns bigint language plpgsql security definer set search_path='' as $$
declare me bigint; rid bigint; point jsonb; seats integer; owner bigint;
begin
 me := (public.tnc_profile()->>'id')::bigint;
 if p is null or not(p ?& array['id','shift','maxSeats','pickup','dest']) then raise exception 'ข้อมูลเที่ยวรถไม่ครบ'; end if;
 rid := (p->>'id')::bigint; seats := (p->>'maxSeats')::integer;
 if rid is null or rid<1 or rid>9007199254740991 or seats is null or seats not between 1 and 8 or p->>'shift' not in ('morning','evening') then raise exception 'ข้อมูลเที่ยวรถไม่ถูกต้อง'; end if;
 foreach point in array array[p->'pickup',p->'dest'] loop
  if point is null or not(point ?& array['name','lat','lng']) or jsonb_typeof(point->'lat')<>'number' or jsonb_typeof(point->'lng')<>'number' or coalesce(char_length(point->>'name'),0) not between 1 and 500 or abs((point->>'lat')::numeric)>90 or abs((point->>'lng')::numeric)>180 then raise exception 'จุดรับส่งไม่ถูกต้อง'; end if;
 end loop;
 insert into public.tnc_trips(id,owner_id,details,max_seats) values(rid,me,jsonb_build_object('shift',p->>'shift','date',to_char(now() at time zone 'Asia/Bangkok','DD/MM/YYYY HH24:MI'),'pickup',p->'pickup','dest',p->'dest','distance',left(p->>'distance',20),'co2',left(p->>'co2',20)),seats) on conflict(id) do nothing;
 select owner_id into owner from public.tnc_trips where id=rid;
 if owner<>me then raise exception 'รหัสเที่ยวรถซ้ำ กรุณาลองใหม่'; end if;
 return rid;
end $$;

create function public.tnc_join_ride(ride_id bigint) returns boolean language plpgsql security definer set search_path='' as $$
declare me bigint; t public.tnc_trips; booked integer;
begin
 me := (public.tnc_profile()->>'id')::bigint;
 select * into t from public.tnc_trips where id=ride_id for update;
 if t.id is null then raise exception 'ไม่พบเที่ยวรถ'; end if;
 if t.owner_id=me then raise exception 'ไม่สามารถร่วมรถของตัวเอง'; end if;
 if exists(select 1 from public.tnc_passengers where trip_id=ride_id and member_id=me) then return true; end if;
 select count(*) into booked from public.tnc_passengers where trip_id=ride_id;
 if t.status<>'Pending' or booked>=t.max_seats then raise exception 'เที่ยวรถเต็มหรือไม่เปิดรับแล้ว'; end if;
 insert into public.tnc_passengers(trip_id,member_id) values(ride_id,me);
 if booked+1>=t.max_seats then update public.tnc_trips set status='Full' where id=ride_id; end if;
 return true;
end $$;

create function public.tnc_status(ride_id bigint,new_status text) returns boolean language plpgsql security definer set search_path='' as $$
declare me bigint; t public.tnc_trips;
begin
 me := (public.tnc_profile()->>'id')::bigint;
 select * into t from public.tnc_trips where id=ride_id for update;
 if t.id is null or t.owner_id<>me then raise exception 'เฉพาะเจ้าของเที่ยวรถเท่านั้น'; end if;
 if new_status=t.status then return true; end if;
 if not((t.status in ('Pending','Full') and new_status='In-Progress') or (t.status='In-Progress' and new_status='Complete')) or new_status is null then raise exception 'ลำดับสถานะไม่ถูกต้อง'; end if;
 update public.tnc_trips set status=new_status where id=ride_id;
 return true;
end $$;
revoke all on function public.tnc_profile(),public.tnc_rides(),public.tnc_create_ride(jsonb),public.tnc_join_ride(bigint),public.tnc_status(bigint,text) from public,anon;
grant execute on function public.tnc_profile(),public.tnc_rides(),public.tnc_create_ride(jsonb),public.tnc_join_ride(bigint),public.tnc_status(bigint,text) to authenticated;
commit;

-- Existing Supabase edition: run this migration ONCE. Keeps IDs/trips/passengers.
begin;
alter table public.tnc_profiles alter column auth_id drop not null;
-- New members are database records only, not Supabase Auth identities.
create or replace function public.tnc_profile() returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.tnc_profiles; actor bigint;
begin
 actor := nullif(current_setting('tnc.member_id',true),'')::bigint;
 select * into m from public.tnc_profiles where id=actor;
 if m.id is null then raise exception 'Member not found. Please sign in again.'; end if;
 return jsonb_build_object('id',m.id,'name',m.name,'phone',m.phone,'email',m.email);
end $$;

create or replace function public.tnc_phone(p_action text,p_payload jsonb default '{}'::jsonb,p_actor bigint default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare m public.tnc_profiles; n text; ph text; em text; point jsonb;
begin
 if p_action in ('register','login') then
  ph := trim(p_payload->>'phone');
  if ph is null or ph !~ '^0[0-9]{9}$' then raise exception 'Enter a valid 10-digit phone number.'; end if;
  if p_action='register' then
   n:=trim(p_payload->>'name'); em:=lower(trim(p_payload->>'email'));
   if n is null or n !~ '^[A-Za-z][A-Za-z .''-]{1,99}$' or n !~ '[A-Za-z].*[A-Za-z]' then raise exception 'Name must use English letters (2-100 characters).'; end if;
   if em is null or char_length(em)>254 or em !~ '^[!-~]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$' then raise exception 'Enter a valid English-character email address.'; end if;
   insert into public.tnc_profiles(name,phone,email) values(n,ph,em) returning * into m;
  else
   select * into m from public.tnc_profiles where phone=ph;
   if m.id is null then raise exception 'Phone number not found. Please register first.'; end if;
  end if;
  return jsonb_build_object('id',m.id,'name',m.name,'phone',m.phone,'email',m.email);
 end if;
 if p_actor is null or not exists(select 1 from public.tnc_profiles where id=p_actor) then raise exception 'Please sign in again.'; end if;
 perform set_config('tnc.member_id',p_actor::text,true);
 case p_action
  when 'me' then return public.tnc_profile();
  when 'getAllRides' then return public.tnc_rides();
  when 'createRide' then
   foreach point in array array[p_payload->'pickup',p_payload->'dest'] loop
    if point->>'name' is null or char_length(point->>'name') not between 1 and 500 or (point->>'name') collate "C" !~ '^[ -~]+$' then raise exception 'Location names must use English characters.'; end if;
   end loop;
   return to_jsonb(public.tnc_create_ride(p_payload));
  when 'joinRide' then return to_jsonb(public.tnc_join_ride((p_payload->>'rideId')::bigint));
  when 'updateRideStatus' then return to_jsonb(public.tnc_status((p_payload->>'id')::bigint,p_payload->>'status'));
  else raise exception 'Unknown action';
 end case;
end $$;
-- All actions must pass through Vercel. Never grant these functions to public clients.
revoke all on function public.tnc_profile(),public.tnc_rides(),public.tnc_create_ride(jsonb),public.tnc_join_ride(bigint),public.tnc_status(bigint,text) from public,anon,authenticated;
revoke all on function public.tnc_phone(text,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.tnc_phone(text,jsonb,bigint) to service_role;
commit;
