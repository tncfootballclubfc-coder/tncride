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
    if point->>'name' is null or char_length(point->>'name') not between 1 and 500 or (point->>'name') collate "C" !~ '^[ -~ก-๿]+$' then raise exception 'Location names must use Thai or English characters.'; end if;
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
