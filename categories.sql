-- =====================================================================
-- UltraWash — Catégories dynamiques (services & véhicules)
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- Pré-requis : services.sql et vehicule_types.sql déjà exécutés
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Table service_categories
-- ---------------------------------------------------------------------
create table if not exists public.service_categories (
  nom        text primary key,
  icon       text default '📦',
  ordre      integer not null default 0,
  actif      boolean not null default true,
  updated_at timestamptz default now()
);

insert into public.service_categories (nom, icon, ordre) values
  ('Lavage',    '🧼', 10),
  ('Detailing', '✨', 20),
  ('Entretien', '🔧', 30)
on conflict (nom) do update
  set icon  = excluded.icon,
      ordre = excluded.ordre,
      updated_at = now();

-- Le check rigide sur services.categorie devient un frein. On le retire pour
-- laisser l'utilisateur créer ses propres catégories. La cohérence reste
-- assurée côté front (selects peuplés depuis service_categories).
alter table public.services drop constraint if exists services_categorie_check;

alter table public.service_categories enable row level security;
drop policy if exists "sc_select_auth"   on public.service_categories;
drop policy if exists "sc_insert_patron" on public.service_categories;
drop policy if exists "sc_update_patron" on public.service_categories;
drop policy if exists "sc_delete_patron" on public.service_categories;
create policy "sc_select_auth"   on public.service_categories for select to authenticated using (true);
create policy "sc_insert_patron" on public.service_categories for insert to authenticated with check (public.uw_current_role() = 'patron');
create policy "sc_update_patron" on public.service_categories for update to authenticated using (public.uw_current_role() = 'patron') with check (public.uw_current_role() = 'patron');
create policy "sc_delete_patron" on public.service_categories for delete to authenticated using (public.uw_current_role() = 'patron');


-- ---------------------------------------------------------------------
-- 2) Table vehicule_categories + colonne sur vehicule_types
-- ---------------------------------------------------------------------
create table if not exists public.vehicule_categories (
  nom        text primary key,
  icon       text default '🚗',
  ordre      integer not null default 0,
  actif      boolean not null default true,
  updated_at timestamptz default now()
);

insert into public.vehicule_categories (nom, icon, ordre) values
  ('Tous', '🚗', 10)
on conflict (nom) do nothing;

alter table public.vehicule_types
  add column if not exists categorie text default 'Tous';

update public.vehicule_types set categorie = 'Tous' where categorie is null;

alter table public.vehicule_categories enable row level security;
drop policy if exists "vc_select_auth"   on public.vehicule_categories;
drop policy if exists "vc_insert_patron" on public.vehicule_categories;
drop policy if exists "vc_update_patron" on public.vehicule_categories;
drop policy if exists "vc_delete_patron" on public.vehicule_categories;
create policy "vc_select_auth"   on public.vehicule_categories for select to authenticated using (true);
create policy "vc_insert_patron" on public.vehicule_categories for insert to authenticated with check (public.uw_current_role() = 'patron');
create policy "vc_update_patron" on public.vehicule_categories for update to authenticated using (public.uw_current_role() = 'patron') with check (public.uw_current_role() = 'patron');
create policy "vc_delete_patron" on public.vehicule_categories for delete to authenticated using (public.uw_current_role() = 'patron');

-- Vérifs :
-- select * from public.service_categories order by ordre;
-- select * from public.vehicule_categories order by ordre;
-- select nom, categorie from public.vehicule_types order by ordre;
