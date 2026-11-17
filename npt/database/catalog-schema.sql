
create schema if not exists gis;
create extension if not exists postgis with schema gis;
create table public.npt_catalog_sources (
 key text primary key, name text not null, url text not null, license_notes text,
 coverage_notes text, last_imported_at timestamptz
);
alter table public.npt_parks
 add column source_key text references public.npt_catalog_sources(key),
 add column source_record_id text,
 add column description text,
 add column metadata jsonb not null default '{}',
 add column imported_at timestamptz,
 add column location gis.geography(Point,4326) generated always as
 (case when latitude is not null and longitude is not null then gis.st_setsrid(gis.st_makepoint(longitude,latitude),4326)::gis.geography end) stored,
 add constraint npt_parks_lat_range check(latitude between -90 and 90),
 add constraint npt_parks_lon_range check(longitude between -180 and 180),
 add constraint npt_parks_source_unique unique(source_key,source_record_id);
create index npt_parks_location_idx on public.npt_parks using gist(location);
create index npt_parks_designation_idx on public.npt_parks(designation,country,region);
create table public.npt_campgrounds (
 id uuid primary key default gen_random_uuid(),
 park_id uuid references public.npt_parks(id),
 name text not null, country text not null default 'US', region text,
 latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180),
 location gis.geography(Point,4326) generated always as
 (case when latitude is not null and longitude is not null then gis.st_setsrid(gis.st_makepoint(longitude,latitude),4326)::gis.geography end) stored,
 description text, official_url text, reservation_url text,
 operator text, campground_type text,
 rv_allowed boolean, trailer_allowed boolean,
 max_rv_length_ft numeric check(max_rv_length_ft>=0),
 max_trailer_length_ft numeric check(max_trailer_length_ft>=0),
 electric_hookups boolean, water_hookups boolean, sewer_hookups boolean,
 amenities jsonb not null default '{}', fees jsonb not null default '[]',
 operating_hours jsonb not null default '[]', reservation_notes text,
 accessibility jsonb not null default '{}',
 availability_status text not null default 'unknown' check(availability_status in ('unknown','checked')),
 availability_checked_at timestamptz,
 security_review_status text not null default 'unknown' check(security_review_status in ('unknown','reviewed')),
 source_key text not null references public.npt_catalog_sources(key), source_record_id text not null,
 source_verified_at timestamptz, imported_at timestamptz not null default now(),
 metadata jsonb not null default '{}', unique(source_key,source_record_id)
);
create index npt_campgrounds_location_idx on public.npt_campgrounds using gist(location);
create index npt_campgrounds_park_idx on public.npt_campgrounds(park_id);
create table public.npt_attractions (
 id uuid primary key default gen_random_uuid(), park_id uuid not null references public.npt_parks(id),
 name text not null, description text, attraction_type text,
 latitude double precision check(latitude between -90 and 90),
 longitude double precision check(longitude between -180 and 180),
 location gis.geography(Point,4326) generated always as
 (case when latitude is not null and longitude is not null then gis.st_setsrid(gis.st_makepoint(longitude,latitude),4326)::gis.geography end) stored,
 official_url text, duration_minutes integer check(duration_minutes>0),
 difficulty text, accessibility jsonb not null default '{}', seasonality jsonb not null default '{}',
 source_key text not null references public.npt_catalog_sources(key), source_record_id text not null,
 source_verified_at timestamptz, imported_at timestamptz not null default now(),
 metadata jsonb not null default '{}', unique(source_key,source_record_id,park_id)
);
create index npt_attractions_park_idx on public.npt_attractions(park_id);
create index npt_attractions_location_idx on public.npt_attractions using gist(location);
create index npt_attractions_source_idx on public.npt_attractions(source_key);
create table public.npt_catalog_photos (
 id uuid primary key default gen_random_uuid(),
 park_id uuid references public.npt_parks(id),
 campground_id uuid references public.npt_campgrounds(id),
 attraction_id uuid references public.npt_attractions(id),
 url text not null, alt_text text, caption text, credit text, source_url text,
 license_notes text, sort_order integer not null default 100,
 imported_at timestamptz not null default now(),
 check(num_nonnulls(park_id,campground_id,attraction_id)=1)
);
create unique index npt_photos_park_url on public.npt_catalog_photos(park_id,url) where park_id is not null;
create unique index npt_photos_camp_url on public.npt_catalog_photos(campground_id,url) where campground_id is not null;
create unique index npt_photos_attraction_url on public.npt_catalog_photos(attraction_id,url) where attraction_id is not null;
create table public.npt_catalog_imports (
 id uuid primary key default gen_random_uuid(), source_key text not null references public.npt_catalog_sources(key),
 started_at timestamptz not null default now(), completed_at timestamptz,
 status text not null check(status in ('running','complete','partial','failed')),
 counts jsonb not null default '{}', notes text
);
alter table public.npt_catalog_sources enable row level security;
revoke all on public.npt_catalog_sources from anon,authenticated;
grant select on public.npt_catalog_sources to anon,authenticated;
create policy "catalog read" on public.npt_catalog_sources for select to anon,authenticated using(true);
alter table public.npt_campgrounds enable row level security;
revoke all on public.npt_campgrounds from anon,authenticated;
grant select on public.npt_campgrounds to anon,authenticated;
create policy "catalog read" on public.npt_campgrounds for select to anon,authenticated using(true);
alter table public.npt_attractions enable row level security;
revoke all on public.npt_attractions from anon,authenticated;
grant select on public.npt_attractions to anon,authenticated;
create policy "catalog read" on public.npt_attractions for select to anon,authenticated using(true);
alter table public.npt_catalog_photos enable row level security;
revoke all on public.npt_catalog_photos from anon,authenticated;
grant select on public.npt_catalog_photos to anon,authenticated;
create policy "catalog read" on public.npt_catalog_photos for select to anon,authenticated using(true);
alter table public.npt_catalog_imports enable row level security;
revoke all on public.npt_catalog_imports from anon,authenticated;
grant select on public.npt_catalog_imports to anon,authenticated;
create policy "catalog read" on public.npt_catalog_imports for select to anon,authenticated using(true);
revoke insert,update,delete,truncate,references,trigger on public.npt_parks from anon,authenticated;
grant select on public.npt_parks to anon,authenticated;
create function public.npt_nearby_campgrounds(
 center_lat double precision, center_lon double precision, radius_miles double precision default 30,
 required_rv_length_ft numeric default null, require_full_hookups boolean default false,
 include_unknown_fit boolean default false, result_limit integer default 50
) returns table(id uuid,name text,park_id uuid,latitude double precision,longitude double precision,
 distance_miles double precision,max_rv_length_ft numeric,rv_allowed boolean,
 electric_hookups boolean,water_hookups boolean,sewer_hookups boolean,official_url text,reservation_url text)
language plpgsql stable security invoker set search_path='' as $$
begin
 if center_lat is null or center_lon is null or center_lat not between -90 and 90 or center_lon not between -180 and 180
 or radius_miles is null or radius_miles<=0 or radius_miles>250 or result_limit is null or result_limit<1 or result_limit>200
 or required_rv_length_ft<0 then raise exception 'Invalid nearby-search parameters'; end if;
 return query select c.id,c.name,c.park_id,c.latitude,c.longitude,
 gis.st_distance(c.location,gis.st_setsrid(gis.st_makepoint(center_lon,center_lat),4326)::gis.geography)/1609.344,
 c.max_rv_length_ft,c.rv_allowed,c.electric_hookups,c.water_hookups,c.sewer_hookups,c.official_url,c.reservation_url
 from public.npt_campgrounds c
 where gis.st_dwithin(c.location,gis.st_setsrid(gis.st_makepoint(center_lon,center_lat),4326)::gis.geography,radius_miles*1609.344)
 and (required_rv_length_ft is null or (c.rv_allowed is distinct from false and
 (c.max_rv_length_ft>=required_rv_length_ft or (include_unknown_fit and c.max_rv_length_ft is null))))
 and (not require_full_hookups or (c.electric_hookups and c.water_hookups and c.sewer_hookups))
 order by c.location operator(gis.<->) gis.st_setsrid(gis.st_makepoint(center_lon,center_lat),4326)::gis.geography
 limit result_limit;
end; $$;
revoke all on function public.npt_nearby_campgrounds(double precision,double precision,double precision,numeric,boolean,boolean,integer) from public;
grant execute on function public.npt_nearby_campgrounds(double precision,double precision,double precision,numeric,boolean,boolean,integer) to anon,authenticated;

grant usage on schema gis to anon,authenticated;
create table public.npt_campsites(
 id uuid primary key default gen_random_uuid(), campground_id uuid not null references public.npt_campgrounds(id),
 site_number text not null, site_type text, max_equipment_length_ft numeric check(max_equipment_length_ft>=0),
 equipment_types text[], electric_amps integer[], water_hookup boolean, sewer_hookup boolean,
 accessible boolean, reservation_url text, metadata jsonb not null default '{}',
 source_key text not null references public.npt_catalog_sources(key), source_record_id text not null,
 imported_at timestamptz not null default now(), unique(source_key,source_record_id)
);
create index npt_campsites_campground_idx on public.npt_campsites(campground_id);
alter table public.npt_campsites enable row level security;
revoke all on public.npt_campsites from anon,authenticated;
grant select on public.npt_campsites to anon,authenticated;
create policy "catalog read" on public.npt_campsites for select to anon,authenticated using(true);
create index npt_campsites_source_idx on public.npt_campsites(source_key);
create index npt_catalog_imports_source_idx on public.npt_catalog_imports(source_key);
