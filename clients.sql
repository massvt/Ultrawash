-- =====================================================================
-- UltraWash — Clients & Véhicules
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Table clients (particuliers + entreprises / flottes)
-- ---------------------------------------------------------------------
create table if not exists public.clients (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('particulier','entreprise')),
  nom         text not null,
  telephone   text,
  email       text,
  adresse     text,
  notes       text,
  created_at  timestamptz default now()
);

create index if not exists clients_nom_idx       on public.clients (lower(nom));
create index if not exists clients_telephone_idx on public.clients (telephone);


-- ---------------------------------------------------------------------
-- 2) Table vehicules (un client peut en avoir plusieurs)
-- ---------------------------------------------------------------------
create table if not exists public.vehicules (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  plaque      text not null unique,
  marque      text,
  modele      text,
  couleur     text,
  created_at  timestamptz default now()
);

create index if not exists vehicules_client_idx on public.vehicules (client_id);


-- ---------------------------------------------------------------------
-- 3) Lier entrees aux clients / véhicules (colonnes nullables)
--    On garde l'historique : si un client est supprimé, on remet NULL
--    sur ses entrées pour préserver la compta.
-- ---------------------------------------------------------------------
alter table public.entrees
  add column if not exists client_id   uuid references public.clients(id)   on delete set null,
  add column if not exists vehicule_id uuid references public.vehicules(id) on delete set null;

create index if not exists entrees_client_idx   on public.entrees (client_id);
create index if not exists entrees_vehicule_idx on public.entrees (vehicule_id);


-- ---------------------------------------------------------------------
-- 4) RLS — clients
--    SELECT / INSERT / UPDATE : tout authentifié
--    DELETE : patron uniquement
-- ---------------------------------------------------------------------
alter table public.clients enable row level security;

drop policy if exists "clients_select_auth"   on public.clients;
drop policy if exists "clients_insert_auth"   on public.clients;
drop policy if exists "clients_update_auth"   on public.clients;
drop policy if exists "clients_delete_patron" on public.clients;

create policy "clients_select_auth" on public.clients
  for select to authenticated using (true);

create policy "clients_insert_auth" on public.clients
  for insert to authenticated with check (true);

create policy "clients_update_auth" on public.clients
  for update to authenticated
  using (true) with check (true);

create policy "clients_delete_patron" on public.clients
  for delete to authenticated
  using (public.uw_current_role() = 'patron');


-- ---------------------------------------------------------------------
-- 5) RLS — vehicules (mêmes règles)
-- ---------------------------------------------------------------------
alter table public.vehicules enable row level security;

drop policy if exists "vehicules_select_auth"   on public.vehicules;
drop policy if exists "vehicules_insert_auth"   on public.vehicules;
drop policy if exists "vehicules_update_auth"   on public.vehicules;
drop policy if exists "vehicules_delete_patron" on public.vehicules;

create policy "vehicules_select_auth" on public.vehicules
  for select to authenticated using (true);

create policy "vehicules_insert_auth" on public.vehicules
  for insert to authenticated with check (true);

create policy "vehicules_update_auth" on public.vehicules
  for update to authenticated
  using (true) with check (true);

create policy "vehicules_delete_patron" on public.vehicules
  for delete to authenticated
  using (public.uw_current_role() = 'patron');


-- ---------------------------------------------------------------------
-- 6) Vue d'agrégation : CA cumulé + nb lavages par client
--    Utile pour la facturation mensuelle des flottes.
-- ---------------------------------------------------------------------
create or replace view public.v_clients_stats as
  select
    c.id,
    c.nom,
    c.type,
    count(e.id)                                  as nb_lavages,
    coalesce(sum(e.montant), 0)::bigint          as ca_total,
    max(e.date)                                  as derniere_visite
  from public.clients c
  left join public.entrees e on e.client_id = c.id
  group by c.id, c.nom, c.type;

grant select on public.v_clients_stats to authenticated;


-- ---------------------------------------------------------------------
-- 7) Vérifications
-- ---------------------------------------------------------------------
-- select * from public.clients;
-- select * from public.vehicules;
-- select * from public.v_clients_stats order by ca_total desc;
-- select schemaname, tablename, policyname, cmd
--   from pg_policies
--  where tablename in ('clients','vehicules')
--  order by tablename, policyname;
