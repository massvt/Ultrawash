-- =====================================================================
-- UltraWash — Types de véhicules
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- =====================================================================

create table if not exists public.vehicule_types (
  nom        text primary key,
  ordre      integer not null default 0,
  actif      boolean not null default true,
  updated_at timestamptz default now()
);

insert into public.vehicule_types (nom, ordre) values
  ('Voiture',     10),
  ('Moto',        20),
  ('SUV/4x4',     30),
  ('Camionnette', 40),
  ('Bus/Camion',  50),
  ('Autre',       60)
on conflict (nom) do update
  set ordre      = excluded.ordre,
      updated_at = now();

alter table public.vehicule_types enable row level security;

drop policy if exists "vt_select_auth"   on public.vehicule_types;
drop policy if exists "vt_insert_patron" on public.vehicule_types;
drop policy if exists "vt_update_patron" on public.vehicule_types;
drop policy if exists "vt_delete_patron" on public.vehicule_types;

create policy "vt_select_auth" on public.vehicule_types
  for select to authenticated using (true);

create policy "vt_insert_patron" on public.vehicule_types
  for insert to authenticated
  with check (public.uw_current_role() = 'patron');

create policy "vt_update_patron" on public.vehicule_types
  for update to authenticated
  using  (public.uw_current_role() = 'patron')
  with check (public.uw_current_role() = 'patron');

create policy "vt_delete_patron" on public.vehicule_types
  for delete to authenticated
  using (public.uw_current_role() = 'patron');

-- Vérif :
-- select * from public.vehicule_types order by ordre;
