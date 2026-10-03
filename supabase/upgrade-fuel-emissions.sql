-- Run once before deploying this version. Existing trips remain unchanged.
begin;
create table if not exists public.tnc_vehicle_fuel (
 owner_id bigint primary key references public.tnc_profiles(id),
 km_per_litre numeric not null check(km_per_litre>0 and km_per_litre<=100),
 updated_at timestamptz not null default now()
);
alter table public.tnc_vehicle_fuel enable row level security;
revoke all on public.tnc_vehicle_fuel from public,anon,authenticated;
create or replace function public.tnc_fuel_settings(p_action text,p_owner bigint default null,p_rate numeric default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if p_action='set' then
  if p_rate is null or p_rate<=0 or p_rate>100 then raise exception 'Invalid fuel efficiency'; end if;
  insert into public.tnc_vehicle_fuel(owner_id,km_per_litre) values(p_owner,p_rate)
  on conflict(owner_id) do update set km_per_litre=excluded.km_per_litre,updated_at=now();
 elsif p_action='list' then
  select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'name',m.name,'phone',m.phone,'kmPerLitre',f.km_per_litre) order by m.id),'[]'::jsonb) into result
  from public.tnc_profiles m left join public.tnc_vehicle_fuel f on f.owner_id=m.id;
  return result;
 elsif p_action<>'get' then raise exception 'Unknown action'; end if;
 select jsonb_build_object('kmPerLitre',km_per_litre) into result from public.tnc_vehicle_fuel where owner_id=p_owner;
 return coalesce(result,'{"kmPerLitre":null}'::jsonb);
end $$;
revoke all on function public.tnc_fuel_settings(text,bigint,numeric) from public,anon,authenticated;
grant execute on function public.tnc_fuel_settings(text,bigint,numeric) to service_role;
create or replace function public.tnc_calculate_emissions() returns trigger language plpgsql security definer set search_path='' as $$
declare rate numeric; km numeric;
begin
 select km_per_litre into rate from public.tnc_vehicle_fuel where owner_id=new.owner_id;
 if rate is null then raise exception 'กรุณาให้ผู้ดูแลตั้งอัตราสิ้นเปลืองรถของคุณก่อนประกาศ'; end if;
 if coalesce(new.details->>'distance','') !~ '^[0-9]+([.][0-9]+)?$' then raise exception 'กรุณาระบุระยะทางเป็นกิโลเมตร'; end if;
 km := (new.details->>'distance')::numeric;
 if km<=0 or km>10000 then raise exception 'ระยะทางต้องมากกว่า 0 และไม่เกิน 10000 กม.'; end if;
 new.details := new.details || jsonb_build_object('distance',km,'distanceBasis','entered_km','kmPerLitre',rate,'emissionFactor',2.7076,'carbonMethod','fuel-v1','fuelLitres',round(km/rate,6),'co2',round((km/rate)*2.7076,4));
 return new;
end $$;
revoke all on function public.tnc_calculate_emissions() from public,anon,authenticated;
drop trigger if exists tnc_trip_emissions on public.tnc_trips;
create trigger tnc_trip_emissions before insert on public.tnc_trips for each row execute function public.tnc_calculate_emissions();
commit;
