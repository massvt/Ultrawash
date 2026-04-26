-- =====================================================================
-- UltraWash — Catalogue de services & tarifs
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- =====================================================================
-- Table dédiée pour gérer les tarifs sans toucher au code.
-- Le front lit cette table au boot et pré-remplit le montant des entrées.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Table services
-- ---------------------------------------------------------------------
create table if not exists public.services (
  nom        text primary key,
  categorie  text not null check (categorie in ('Lavage','Detailing','Entretien')),
  prix       integer not null check (prix >= 0),
  ordre      integer not null default 0,
  actif      boolean not null default true,
  updated_at timestamptz default now()
);


-- ---------------------------------------------------------------------
-- 2) Seed (upsert : ré-exécuter met à jour les prix)
-- ---------------------------------------------------------------------
insert into public.services (nom, categorie, prix, ordre) values
  -- Lavage
  ('Lavage Moto',                  'Lavage',     1000,  10),
  ('Lavage Moquette',              'Lavage',    10000,  20),
  ('Lavage Standard',              'Lavage',     3000,  30),
  ('Lavage Professionnel',         'Lavage',     5000,  40),
  ('Lavage Complet',               'Lavage',    15000,  50),
  ('Lavage Premium',               'Lavage',    25000,  60),
  ('Autre Lavage',                 'Lavage',        0,  70),
  -- Detailing
  ('Polissage',                    'Detailing',  60000, 110),
  ('Lustrage',                     'Detailing', 100000, 120),
  ('Protection Nano-céramique',    'Detailing', 250000, 130),
  ('Film solaire & anti-UV',       'Detailing', 150000, 140),
  ('Habillage / Covering',         'Detailing', 350000, 150),
  -- Entretien
  ('Changement pneus',             'Entretien',   3000, 210),
  ('Réparation pneus',             'Entretien',   2000, 220),
  ('Équilibrage',                  'Entretien',  20000, 230),
  ('Parallélisme',                 'Entretien',  15000, 240),
  ('Vidange',                      'Entretien',  20000, 250),
  ('Filtre à air',                 'Entretien',  10000, 260),
  ('Filtre à huile',               'Entretien',  10000, 270),
  ('Filtre à gazoil',              'Entretien',  10000, 280),
  ('Entretien climatisation',      'Entretien',  20000, 290),
  ('Freins',                       'Entretien',  20000, 300),
  ('Reprogrammation calculateur',  'Entretien', 200000, 310)
on conflict (nom) do update
  set categorie  = excluded.categorie,
      prix       = excluded.prix,
      ordre      = excluded.ordre,
      updated_at = now();


-- ---------------------------------------------------------------------
-- 3) RLS — services
--    SELECT : tout authentifié (le front a besoin des prix)
--    INSERT/UPDATE/DELETE : patron uniquement
-- ---------------------------------------------------------------------
alter table public.services enable row level security;

drop policy if exists "services_select_auth"   on public.services;
drop policy if exists "services_insert_patron" on public.services;
drop policy if exists "services_update_patron" on public.services;
drop policy if exists "services_delete_patron" on public.services;

create policy "services_select_auth" on public.services
  for select to authenticated using (true);

create policy "services_insert_patron" on public.services
  for insert to authenticated
  with check (public.uw_current_role() = 'patron');

create policy "services_update_patron" on public.services
  for update to authenticated
  using  (public.uw_current_role() = 'patron')
  with check (public.uw_current_role() = 'patron');

create policy "services_delete_patron" on public.services
  for delete to authenticated
  using (public.uw_current_role() = 'patron');


-- ---------------------------------------------------------------------
-- 4) Vérifications
-- ---------------------------------------------------------------------
-- select categorie, nom, prix from public.services where actif order by ordre;
-- select schemaname, tablename, policyname, cmd
--   from pg_policies where tablename = 'services' order by policyname;
