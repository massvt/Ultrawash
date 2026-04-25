-- =====================================================================
-- UltraWash — Réservations
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- Pré-requis : clients.sql déjà exécuté (tables clients, vehicules)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Table reservations
--    - client_id / vehicule_id nullables : on peut réserver pour un
--      client de passage sans fiche. Snapshot dans client_nom/telephone/plaque.
--    - heure_prevue NOT NULL (créneau précis exigé)
--    - statut : prevu / arrive / annule (annulés conservés pour stats)
--    - entree_id : rempli quand la résa est convertie en lavage réel
-- ---------------------------------------------------------------------
create table if not exists public.reservations (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references public.clients(id)   on delete set null,
  vehicule_id       uuid references public.vehicules(id) on delete set null,
  client_nom        text,
  client_telephone  text,
  plaque            text,
  vehicule_type     text,
  date_prevue       date not null,
  heure_prevue      time not null,
  type_lavage       text,
  montant_estime    integer,
  statut            text not null default 'prevu'
                    check (statut in ('prevu','arrive','annule')),
  entree_id         uuid references public.entrees(id) on delete set null,
  notes             text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz default now()
);

create index if not exists reservations_date_idx     on public.reservations (date_prevue);
create index if not exists reservations_statut_idx   on public.reservations (statut);
create index if not exists reservations_client_idx   on public.reservations (client_id);


-- ---------------------------------------------------------------------
-- 2) RLS — reservations
--    SELECT / INSERT / UPDATE : tout authentifié (patron + employés)
--    DELETE : patron uniquement
-- ---------------------------------------------------------------------
alter table public.reservations enable row level security;

drop policy if exists "reservations_select_auth"   on public.reservations;
drop policy if exists "reservations_insert_auth"   on public.reservations;
drop policy if exists "reservations_update_auth"   on public.reservations;
drop policy if exists "reservations_delete_patron" on public.reservations;

create policy "reservations_select_auth" on public.reservations
  for select to authenticated using (true);

create policy "reservations_insert_auth" on public.reservations
  for insert to authenticated with check (true);

create policy "reservations_update_auth" on public.reservations
  for update to authenticated
  using (true) with check (true);

create policy "reservations_delete_patron" on public.reservations
  for delete to authenticated
  using (public.uw_current_role() = 'patron');


-- ---------------------------------------------------------------------
-- 3) Vérifications
-- ---------------------------------------------------------------------
-- select * from public.reservations order by date_prevue, heure_prevue;
-- select schemaname, tablename, policyname, cmd
--   from pg_policies
--  where tablename = 'reservations'
--  order by policyname;
