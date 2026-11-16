-- NPT baseline schema (run only after creating/connecting the Supabase project).
-- Guest browsing is read-only. User-owned trips are protected by RLS.
-- Public trip content is intentionally visible to anyone; choose privacy carefully.

create extension if not exists pgcrypto;

create table if not exists public.npt_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.npt_trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 160),
  start_date date,
  length_days integer not null check (length_days between 1 and 366),
  start_location text not null default '',
  end_location text not null default '',
  vehicle jsonb not null default '{}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  parks jsonb not null default '[]'::jsonb,
  itinerary jsonb not null default '[]'::jsonb,
  route_segments jsonb not null default '[]'::jsonb,
  campgrounds jsonb not null default '[]'::jsonb,
  visibility text not null default 'private' check (visibility in ('private','public','unlisted')),
  allow_copy boolean not null default true,
  source_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint npt_trip_id_owner_unique unique (id, owner_id)
);

-- Revocable unlisted-link tokens. They are not stored inside public GitHub HTML.
create table if not exists public.npt_trip_links (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null,
  owner_id uuid not null,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  foreign key (trip_id, owner_id) references public.npt_trips(id, owner_id) on delete cascade
);

-- Public park directory: only the service administrator may insert/update rows.
-- This will be populated after the initial private trip works.
create table if not exists public.npt_parks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  designation text not null check (designation in ('national_park','state_park','national_park_canada','other')),
  region text,
  country text not null default 'US',
  latitude double precision,
  longitude double precision,
  official_url text,
  official_id text,
  source_verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint npt_park_unique unique (name, designation, country, region)
);

create index if not exists npt_trips_owner_idx on public.npt_trips (owner_id);
create index if not exists npt_trips_visibility_idx on public.npt_trips (visibility);
create index if not exists npt_trip_links_trip_idx on public.npt_trip_links (trip_id);
create index if not exists npt_parks_country_region_idx on public.npt_parks (country, region);

alter table public.npt_profiles enable row level security;
alter table public.npt_trips enable row level security;
alter table public.npt_trip_links enable row level security;
alter table public.npt_parks enable row level security;

-- Explicit grants, not relying on a project's legacy public-schema defaults.
revoke all on public.npt_profiles from anon, authenticated;
revoke all on public.npt_trips from anon, authenticated;
revoke all on public.npt_trip_links from anon, authenticated;
revoke all on public.npt_parks from anon, authenticated;

grant select, insert, update, delete on public.npt_profiles to authenticated;
grant select on public.npt_trips to anon, authenticated;
grant insert, update, delete on public.npt_trips to authenticated;
grant select, insert, update, delete on public.npt_trip_links to authenticated;
grant select on public.npt_parks to anon, authenticated;

-- A profile is only visible to its signed-in owner.
create policy "npt profiles select self"
on public.npt_profiles for select to authenticated
using (user_id = (select auth.uid()));
create policy "npt profiles insert self"
on public.npt_profiles for insert to authenticated
with check (user_id = (select auth.uid()));
create policy "npt profiles update self"
on public.npt_profiles for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
create policy "npt profiles delete self"
on public.npt_profiles for delete to authenticated
using (user_id = (select auth.uid()));

-- Guests and signed-in users can browse PUBLIC trips without an account.
create policy "npt public trips readable by guests"
on public.npt_trips for select to anon, authenticated
using (visibility = 'public');
-- Owners can always view and modify their own trips.
create policy "npt owner reads trips"
on public.npt_trips for select to authenticated
using (owner_id = (select auth.uid()));
create policy "npt owner creates trips"
on public.npt_trips for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy "npt owner edits trips"
on public.npt_trips for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy "npt owner deletes trips"
on public.npt_trips for delete to authenticated
using (owner_id = (select auth.uid()));

-- Link management is restricted to the trip owner; composite FK prevents
-- attaching a link to another user's trip.
create policy "npt owner reads links"
on public.npt_trip_links for select to authenticated
using (owner_id = (select auth.uid()));
create policy "npt owner creates links"
on public.npt_trip_links for insert to authenticated
with check (owner_id = (select auth.uid()));
create policy "npt owner edits links"
on public.npt_trip_links for update to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));
create policy "npt owner deletes links"
on public.npt_trip_links for delete to authenticated
using (owner_id = (select auth.uid()));

-- The park directory is readable by everyone, but not editable by the browser.
create policy "npt anyone reads catalog"
on public.npt_parks for select to anon, authenticated
using (true);

-- Guests can read an unlisted trip ONLY by presenting a valid token.
-- A previously issued link immediately stops working when the trip is Private.
-- No account fields, email, or share tokens are returned.
create or replace function public.npt_get_unlisted_trip(p_token uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'start_date', t.start_date,
    'length_days', t.length_days,
    'start_location', t.start_location,
    'end_location', t.end_location,
    'vehicle', t.vehicle,
    'preferences', t.preferences,
    'parks', t.parks,
    'itinerary', t.itinerary,
    'route_segments', t.route_segments,
    'campgrounds', t.campgrounds,
    'allow_copy', t.allow_copy
  )
  from public.npt_trip_links l
  join public.npt_trips t on t.id = l.trip_id
  where l.token = p_token
    and l.revoked_at is null
    and (l.expires_at is null or l.expires_at > now())
    and t.visibility = 'unlisted'
  limit 1;
$$;

revoke all on function public.npt_get_unlisted_trip(uuid) from public;
grant execute on function public.npt_get_unlisted_trip(uuid) to anon, authenticated;

-- Checklist before deployment:
-- 1. Run RLS tests as anon, a trip owner, and an unrelated authenticated user.
-- 2. Confirm anon cannot select Private or Unlisted trip rows directly.
-- 3. Confirm a share link fails immediately after the trip is made Private.
-- 4. Never include service_role/secret credentials in GitHub Pages or browser JS.
-- 5. Configure Supabase Auth's exact Site URL / redirects for your NPT URL.
