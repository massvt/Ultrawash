-- =====================================================================
-- UltraWash — Auth + RLS durcies
-- À exécuter dans Supabase Studio > SQL Editor
-- =====================================================================

-- Étape 1. Créer les 3 utilisateurs DANS L'UI Supabase AVANT ce script :
--   Dashboard > Authentication > Users > Add user > "Create new user"
--   Cocher "Auto Confirm User" pour chacun.
--
--   Comptes à créer (remplace les emails/mots de passe par les vrais) :
--     - patron@ultrawash.sn        (rôle patron)
--     - employe1@ultrawash.sn      (rôle employé)
--     - employe2@ultrawash.sn      (rôle employé)
--
-- Étape 2. Exécuter TOUT ce fichier (bloc par bloc ou d'un coup).


-- ---------------------------------------------------------------------
-- 1) Table profiles : lie auth.users à un rôle métier
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  role       text not null check (role in ('patron','employe')),
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- Un user peut lire son propre profil (pour connaître son rôle côté client)
drop policy if exists "profiles_self_select" on public.profiles;
create policy "profiles_self_select" on public.profiles
  for select to authenticated
  using (auth.uid() = id);

-- Pas d'INSERT/UPDATE/DELETE via l'API client : tout passe par SQL côté admin.


-- ---------------------------------------------------------------------
-- 2) Fonction helper : rôle de l'utilisateur courant
--    SECURITY DEFINER pour pouvoir être appelée dans les policies
--    sans déclencher de récursion RLS sur profiles.
-- ---------------------------------------------------------------------
create or replace function public.uw_current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

grant execute on function public.uw_current_role() to authenticated;


-- ---------------------------------------------------------------------
-- 3) Policies ENTREES
--    - SELECT / INSERT : tout utilisateur authentifié (patron + employé)
--    - UPDATE / DELETE : patron uniquement
-- ---------------------------------------------------------------------
alter table public.entrees enable row level security;

-- Nettoyage des anciennes policies ouvertes (on liste les noms probables,
-- adapte si les tiennes ont des noms différents)
drop policy if exists "Enable read access for all users"   on public.entrees;
drop policy if exists "Enable insert for all users"        on public.entrees;
drop policy if exists "Enable update for all users"        on public.entrees;
drop policy if exists "Enable delete for all users"        on public.entrees;
drop policy if exists "open policy"                         on public.entrees;
drop policy if exists "entrees_select_auth"                 on public.entrees;
drop policy if exists "entrees_insert_auth"                 on public.entrees;
drop policy if exists "entrees_update_patron"               on public.entrees;
drop policy if exists "entrees_delete_patron"               on public.entrees;

create policy "entrees_select_auth" on public.entrees
  for select to authenticated using (true);

create policy "entrees_insert_auth" on public.entrees
  for insert to authenticated with check (true);

create policy "entrees_update_patron" on public.entrees
  for update to authenticated
  using      (public.uw_current_role() = 'patron')
  with check (public.uw_current_role() = 'patron');

create policy "entrees_delete_patron" on public.entrees
  for delete to authenticated
  using (public.uw_current_role() = 'patron');


-- ---------------------------------------------------------------------
-- 4) Policies SORTIES
--    Patron uniquement (les employés ne voient ni n'écrivent les dépenses)
-- ---------------------------------------------------------------------
alter table public.sorties enable row level security;

drop policy if exists "Enable read access for all users"   on public.sorties;
drop policy if exists "Enable insert for all users"        on public.sorties;
drop policy if exists "Enable update for all users"        on public.sorties;
drop policy if exists "Enable delete for all users"        on public.sorties;
drop policy if exists "open policy"                         on public.sorties;
drop policy if exists "sorties_select_patron"               on public.sorties;
drop policy if exists "sorties_insert_patron"               on public.sorties;
drop policy if exists "sorties_update_patron"               on public.sorties;
drop policy if exists "sorties_delete_patron"               on public.sorties;

create policy "sorties_select_patron" on public.sorties
  for select to authenticated
  using (public.uw_current_role() = 'patron');

create policy "sorties_insert_patron" on public.sorties
  for insert to authenticated
  with check (public.uw_current_role() = 'patron');

create policy "sorties_update_patron" on public.sorties
  for update to authenticated
  using      (public.uw_current_role() = 'patron')
  with check (public.uw_current_role() = 'patron');

create policy "sorties_delete_patron" on public.sorties
  for delete to authenticated
  using (public.uw_current_role() = 'patron');


-- ---------------------------------------------------------------------
-- 5) Création des profils (les users doivent déjà exister dans auth.users
--    — cf. Étape 1 ci-dessus). Idempotent grâce à ON CONFLICT.
--    >>> Ajuste les emails si tu as choisi autre chose <<<
-- ---------------------------------------------------------------------
insert into public.profiles (id, role)
select id, 'patron'
  from auth.users
 where email = 'admin@ultrawash.sn'
on conflict (id) do update set role = excluded.role;

insert into public.profiles (id, role)
select id, 'employe'
  from auth.users
 where email = 'agent1@ultrawash.sn'
on conflict (id) do update set role = excluded.role;

insert into public.profiles (id, role)
select id, 'employe'
  from auth.users
 where email = 'agent2@ultrawash.sn'
on conflict (id) do update set role = excluded.role;


-- ---------------------------------------------------------------------
-- 6) Vérifications rapides
-- ---------------------------------------------------------------------
-- Les 3 profils doivent apparaître :
-- select u.email, p.role
--   from public.profiles p
--   join auth.users u on u.id = p.id
--  order by p.role desc, u.email;

-- Les policies doivent lister les nouvelles règles :
-- select schemaname, tablename, policyname, cmd
--   from pg_policies
--  where tablename in ('entrees','sorties','profiles')
--  order by tablename, policyname;
