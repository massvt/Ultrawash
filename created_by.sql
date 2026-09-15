-- ============================================================
-- Traçabilité : qui a créé chaque client / chaque lavage ?
-- ============================================================
-- Ajoute une colonne created_by (uuid → auth.users) sur clients et
-- entrees, remplie AUTOMATIQUEMENT par la base avec l'utilisateur
-- connecté (auth.uid()) : le front n'a rien à envoyer, impossible
-- d'oublier ou de falsifier. Même mécanisme que reservations.created_by.
--
-- Les lignes antérieures à cette migration restent à NULL (auteur inconnu).
-- Les créations via le portail public (anon, ex. réservation en ligne)
-- restent aussi à NULL → affichées « — » dans l'app.
--
-- Fournit aussi user_names() : résout les uuid en « Prénom NOM » pour
-- TOUS les utilisateurs connectés (les policies de profiles ne laissent
-- voir que sa propre fiche aux non super-admins ; cette fonction
-- security definer n'expose que prénom / nom / rôle, rien de sensible).
--
-- À exécuter UNE fois dans Supabase SQL Editor. Idempotent.
-- ============================================================

-- 1. Colonnes (remplies par défaut avec l'utilisateur du JWT courant)
alter table public.clients
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.clients
  alter column created_by set default auth.uid();

alter table public.entrees
  add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.entrees
  alter column created_by set default auth.uid();

create index if not exists clients_created_by_idx on public.clients (created_by);
create index if not exists entrees_created_by_idx on public.entrees (created_by);

-- 2. Verrou : personne ne peut modifier l'auteur après coup
create or replace function public.protect_created_by()
returns trigger
language plpgsql
as $$
begin
  if new.created_by is distinct from old.created_by then
    new.created_by := old.created_by;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_protect_created_by on public.clients;
create trigger clients_protect_created_by
  before update on public.clients
  for each row execute function public.protect_created_by();

drop trigger if exists entrees_protect_created_by on public.entrees;
create trigger entrees_protect_created_by
  before update on public.entrees
  for each row execute function public.protect_created_by();

-- 3. Annuaire minimal des utilisateurs, lisible par tout utilisateur connecté
create or replace function public.user_names()
returns table (id uuid, prenom text, nom text, role text, actif boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.prenom, p.nom, p.role, p.actif
  from public.profiles p
  where auth.uid() is not null;   -- anon → aucune ligne
$$;

revoke all on function public.user_names() from public, anon;
grant execute on function public.user_names() to authenticated;

-- 4. Vérification
select 'clients' as t, count(*) filter (where created_by is not null) as avec_auteur, count(*) as total from public.clients
union all
select 'entrees', count(*) filter (where created_by is not null), count(*) from public.entrees;
