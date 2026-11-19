-- Catalog Manager admin access. The allowlist is changed only by trusted database operators.
create table if not exists public.npt_catalog_admins(
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table public.npt_catalog_admins enable row level security;
revoke all on public.npt_catalog_admins from anon,authenticated;
grant select on public.npt_catalog_admins to authenticated;
create policy "catalog admin self read" on public.npt_catalog_admins
 for select to authenticated using(user_id=(select auth.uid()));
insert into public.npt_catalog_admins(user_id)
values('5c3a9928-943b-433c-9408-d15df81d9791') on conflict(user_id) do nothing;

create or replace function public.npt_is_catalog_admin()
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.npt_catalog_admins a where a.user_id=(select auth.uid())); $$;
revoke all on function public.npt_is_catalog_admin() from public,anon,authenticated;
grant execute on function public.npt_is_catalog_admin() to authenticated;

grant insert,update,delete on public.npt_parks,public.npt_campgrounds,public.npt_campsites,public.npt_attractions,
 public.npt_catalog_photos,public.npt_catalog_sources,public.npt_catalog_imports to authenticated;

create policy "catalog admin write" on public.npt_parks for all to authenticated using(public.npt_is_catalog_admin()) with check(public.npt_is_catalog_admin());
create policy "catalog admin write" on public.npt_campgrounds for all to authenticated using(public.npt_is_catalog_admin()) with check(public.npt_is_catalog_admin());
create policy "catalog admin write" on public.npt_campsites for all to authenticated using(public.npt_is_catalog_admin()) with check(public.npt_is_catalog_admin());
create policy "catalog admin write" on public.npt_attractions for all to authenticated using(public.npt_is_catalog_admin()) with check(public.npt_is_catalog_admin());
create policy "catalog admin write" on public.npt_catalog_photos for all to authenticated using(public.npt_is_catalog_admin()) with check(public.npt_is_catalog_admin());
create policy "catalog admin write" on public.npt_catalog_sources for all to authenticated using(public.npt_is_catalog_admin()) with check(public.npt_is_catalog_admin());
create policy "catalog admin write" on public.npt_catalog_imports for all to authenticated using(public.npt_is_catalog_admin()) with check(public.npt_is_catalog_admin());

insert into public.npt_catalog_sources(key,name,url,license_notes,coverage_notes)
values('manual_admin','Admin-entered catalog records','https://github.com/mantenak/Indiatrip20262027','Record the official source URL on each record.','Manually entered and reviewed catalog records.')
on conflict(key) do nothing;
