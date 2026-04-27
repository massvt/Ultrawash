-- =====================================================================
-- UltraWash — Migration vers 3 rôles : super_admin / admin / agent
-- + ajout téléphone, prénom, nom, actif sur profiles
-- + helpers RLS et réécriture des policies
-- À exécuter UNE FOIS dans Supabase Studio > SQL Editor.
-- Idempotent : ré-exécutable sans casse.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Nouvelles colonnes sur profiles
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists telephone text,
  add column if not exists prenom    text,
  add column if not exists nom       text,
  add column if not exists actif     boolean not null default true,
  add column if not exists updated_at timestamptz default now();

-- Téléphone unique (sauf null pendant migration)
create unique index if not exists profiles_telephone_uniq
  on public.profiles(telephone)
  where telephone is not null;


-- ---------------------------------------------------------------------
-- 2) Nouvelle contrainte de rôle : super_admin / admin / agent
--    On supprime l'ancienne contrainte (qui acceptait patron/employe)
-- ---------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles drop constraint if exists profiles_role_check1;

-- Migration des valeurs existantes AVANT de poser la nouvelle contrainte
update public.profiles set role = 'admin' where role = 'patron';
update public.profiles set role = 'agent' where role = 'employe';

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('super_admin','admin','agent'));


-- ---------------------------------------------------------------------
-- 3) Mise à jour des 3 comptes existants
--    >>> ÉDITE prénom/nom ci-dessous AVANT exécution si besoin <<<
-- ---------------------------------------------------------------------
-- admin@ultrawash.sn  → super_admin, tél 781436380
update public.profiles p
   set role       = 'super_admin',
       telephone  = '781436380',
       prenom     = coalesce(nullif(p.prenom, ''), 'Samba'),
       nom        = coalesce(nullif(p.nom, ''), 'SAMB'),
       actif      = true,
       updated_at = now()
  from auth.users u
 where p.id = u.id
   and u.email = 'admin@ultrawash.sn';

-- agent1@ultrawash.sn → agent, tél 774780264
update public.profiles p
   set role       = 'agent',
       telephone  = '774780264',
       prenom     = coalesce(nullif(p.prenom, ''), 'Ndeye Codou'),
       nom        = coalesce(nullif(p.nom, ''), 'NIANG'),
       actif      = true,
       updated_at = now()
  from auth.users u
 where p.id = u.id
   and u.email = 'agent1@ultrawash.sn';

-- agent2@ultrawash.sn → agent, tél 776791841
update public.profiles p
   set role       = 'agent',
       telephone  = '776791841',
       prenom     = coalesce(nullif(p.prenom, ''), 'Berry'),
       nom        = coalesce(nullif(p.nom, ''), 'DIOP'),
       actif      = true,
       updated_at = now()
  from auth.users u
 where p.id = u.id
   and u.email = 'agent2@ultrawash.sn';


-- ---------------------------------------------------------------------
-- 4) Helpers SQL utilisés par les policies
-- ---------------------------------------------------------------------
create or replace function public.uw_current_role()
returns text language sql stable security definer set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and actif = true
$$;

create or replace function public.uw_is_super_admin()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.profiles
     where id = auth.uid() and role = 'super_admin' and actif = true
  )
$$;

create or replace function public.uw_is_admin_or_above()
returns boolean language sql stable security definer set search_path = public
as $$
  select exists(
    select 1 from public.profiles
     where id = auth.uid() and role in ('super_admin','admin') and actif = true
  )
$$;

grant execute on function public.uw_current_role()      to authenticated;
grant execute on function public.uw_is_super_admin()    to authenticated;
grant execute on function public.uw_is_admin_or_above() to authenticated;


-- ---------------------------------------------------------------------
-- 5) Policies PROFILES
--    - SELECT : son propre profil ; super_admin voit tout
--    - UPDATE : super_admin uniquement (pour changer rôle / actif / nom)
--    - INSERT/DELETE : pas via API client (passe par l'edge function)
-- ---------------------------------------------------------------------
drop policy if exists "profiles_self_select"        on public.profiles;
drop policy if exists "profiles_super_admin_select" on public.profiles;
drop policy if exists "profiles_super_admin_update" on public.profiles;

create policy "profiles_self_select" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

create policy "profiles_super_admin_select" on public.profiles
  for select to authenticated
  using (public.uw_is_super_admin());

create policy "profiles_super_admin_update" on public.profiles
  for update to authenticated
  using      (public.uw_is_super_admin())
  with check (public.uw_is_super_admin());


-- ---------------------------------------------------------------------
-- 6) ENTREES — réécriture des policies patron → admin_or_above
-- ---------------------------------------------------------------------
drop policy if exists "entrees_update_patron" on public.entrees;
drop policy if exists "entrees_delete_patron" on public.entrees;

create policy "entrees_update_admin" on public.entrees
  for update to authenticated
  using      (public.uw_is_admin_or_above())
  with check (public.uw_is_admin_or_above());

create policy "entrees_delete_admin" on public.entrees
  for delete to authenticated
  using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 7) SORTIES — patron → admin_or_above (sur tout)
-- ---------------------------------------------------------------------
drop policy if exists "sorties_select_patron" on public.sorties;
drop policy if exists "sorties_insert_patron" on public.sorties;
drop policy if exists "sorties_update_patron" on public.sorties;
drop policy if exists "sorties_delete_patron" on public.sorties;

create policy "sorties_select_admin" on public.sorties
  for select to authenticated
  using (public.uw_is_admin_or_above());

create policy "sorties_insert_admin" on public.sorties
  for insert to authenticated
  with check (public.uw_is_admin_or_above());

create policy "sorties_update_admin" on public.sorties
  for update to authenticated
  using      (public.uw_is_admin_or_above())
  with check (public.uw_is_admin_or_above());

create policy "sorties_delete_admin" on public.sorties
  for delete to authenticated
  using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 8) SERVICES (prestations)
-- ---------------------------------------------------------------------
drop policy if exists "services_insert_patron" on public.services;
drop policy if exists "services_update_patron" on public.services;
drop policy if exists "services_delete_patron" on public.services;

create policy "services_insert_admin" on public.services
  for insert to authenticated
  with check (public.uw_is_admin_or_above());

create policy "services_update_admin" on public.services
  for update to authenticated
  using      (public.uw_is_admin_or_above())
  with check (public.uw_is_admin_or_above());

create policy "services_delete_admin" on public.services
  for delete to authenticated
  using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 9) VEHICULE_TYPES (types de service)
-- ---------------------------------------------------------------------
drop policy if exists "vt_insert_patron" on public.vehicule_types;
drop policy if exists "vt_update_patron" on public.vehicule_types;
drop policy if exists "vt_delete_patron" on public.vehicule_types;

create policy "vt_insert_admin" on public.vehicule_types
  for insert to authenticated
  with check (public.uw_is_admin_or_above());

create policy "vt_update_admin" on public.vehicule_types
  for update to authenticated
  using      (public.uw_is_admin_or_above())
  with check (public.uw_is_admin_or_above());

create policy "vt_delete_admin" on public.vehicule_types
  for delete to authenticated
  using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 10) SERVICE_CATEGORIES
-- ---------------------------------------------------------------------
drop policy if exists "sc_insert_patron" on public.service_categories;
drop policy if exists "sc_update_patron" on public.service_categories;
drop policy if exists "sc_delete_patron" on public.service_categories;

create policy "sc_insert_admin" on public.service_categories
  for insert to authenticated with check (public.uw_is_admin_or_above());
create policy "sc_update_admin" on public.service_categories
  for update to authenticated
  using (public.uw_is_admin_or_above()) with check (public.uw_is_admin_or_above());
create policy "sc_delete_admin" on public.service_categories
  for delete to authenticated using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 11) VEHICULE_CATEGORIES
-- ---------------------------------------------------------------------
drop policy if exists "vc_insert_patron" on public.vehicule_categories;
drop policy if exists "vc_update_patron" on public.vehicule_categories;
drop policy if exists "vc_delete_patron" on public.vehicule_categories;

create policy "vc_insert_admin" on public.vehicule_categories
  for insert to authenticated with check (public.uw_is_admin_or_above());
create policy "vc_update_admin" on public.vehicule_categories
  for update to authenticated
  using (public.uw_is_admin_or_above()) with check (public.uw_is_admin_or_above());
create policy "vc_delete_admin" on public.vehicule_categories
  for delete to authenticated using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 12) RESERVATIONS — DELETE patron → admin_or_above
-- ---------------------------------------------------------------------
drop policy if exists "reservations_delete_patron" on public.reservations;

create policy "reservations_delete_admin" on public.reservations
  for delete to authenticated using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 13) CLIENTS / VEHICULES — DELETE patron → admin_or_above
-- ---------------------------------------------------------------------
drop policy if exists "clients_delete_patron"   on public.clients;
drop policy if exists "vehicules_delete_patron" on public.vehicules;

create policy "clients_delete_admin" on public.clients
  for delete to authenticated using (public.uw_is_admin_or_above());

create policy "vehicules_delete_admin" on public.vehicules
  for delete to authenticated using (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 14) Vérifications
-- ---------------------------------------------------------------------
-- Profils :
-- select u.email, p.role, p.telephone, p.prenom, p.nom, p.actif
--   from public.profiles p
--   join auth.users u on u.id = p.id
--  order by p.role desc, u.email;

-- Policies (toutes doivent contenir 'admin' dans le nom, plus aucun '_patron') :
-- select tablename, policyname
--   from pg_policies
--  where tablename in ('profiles','entrees','sorties','services','vehicule_types',
--                      'service_categories','vehicule_categories',
--                      'reservations','clients','vehicules')
--  order by tablename, policyname;
