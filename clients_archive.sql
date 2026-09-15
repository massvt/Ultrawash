-- ============================================================
-- Archivage des clients + interdiction de supprimer un client
-- qui a au moins un lavage
-- ============================================================
-- Un client avec de l'historique ne se supprime plus : on l'ARCHIVE
-- (réversible, les lavages / KPIs / CA restent intacts). La règle est
-- appliquée EN BASE (trigger), pas seulement dans l'interface : aucune
-- requête directe à l'API ne peut la contourner.
--
-- Règles :
--  1. DELETE clients → refusé si ≥ 1 lavage rattaché (par client_id, ou
--     lavage orphelin portant le même téléphone normalisé, comme
--     le comptage affiché dans l'app).
--  2. archived_at / archived_by : seuls admin et super_admin peuvent
--     archiver ou désarchiver (agents : refusé en base).
--  3. Un lavage saisi pour un client archivé le RÉACTIVE automatiquement :
--     « archivé » signifie « n'est plus client », un nouveau lavage
--     contredit ce statut.
--
-- Pré-requis : normalize_phone() (telephone_normalize.sql),
--              uw_is_admin_or_above() (supabase_users_v2.sql).
-- À exécuter UNE fois dans Supabase SQL Editor. Idempotent.
-- ============================================================

-- 1. Colonnes
alter table public.clients
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users(id) on delete set null;

create index if not exists clients_archived_idx on public.clients (archived_at) where archived_at is not null;

-- 2. Nombre de lavages d'un client (même logique que l'app)
create or replace function public.client_lavages_count(p_client public.clients)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.entrees e
  where e.client_id = p_client.id
     or (e.client_id is null
         and p_client.telephone is not null
         and normalize_phone(e.telephone) = normalize_phone(p_client.telephone));
$$;

-- 3. Interdit la suppression d'un client avec historique
create or replace function public.clients_block_delete_with_lavages()
returns trigger
language plpgsql
as $$
declare n int;
begin
  n := public.client_lavages_count(old);
  if n > 0 then
    raise exception 'CLIENT_HAS_LAVAGES:%', n
      using errcode = 'P0001',
            hint = 'Archivez ce client au lieu de le supprimer.';
  end if;
  return old;
end;
$$;

drop trigger if exists clients_block_delete on public.clients;
create trigger clients_block_delete
  before delete on public.clients
  for each row execute function public.clients_block_delete_with_lavages();

-- 4. Archiver / désarchiver : réservé aux admins, horodaté et signé en base
create or replace function public.clients_guard_archive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.archived_at is null) is distinct from (old.archived_at is null) then
    -- Réactivation système (trigger entrees_unarchive_client) : pas de contrôle de rôle
    if coalesce(current_setting('uw.system_unarchive', true), '') <> '1'
       and not public.uw_is_admin_or_above() then
      raise exception 'ARCHIVE_FORBIDDEN'
        using errcode = 'P0001',
              hint = 'Seul un administrateur peut archiver ou réactiver un client.';
    end if;
    if new.archived_at is not null then
      new.archived_at := now();
      new.archived_by := auth.uid();
    else
      new.archived_by := null;
    end if;
  else
    -- pas de changement de statut : on fige les valeurs existantes
    new.archived_at := old.archived_at;
    new.archived_by := old.archived_by;
  end if;
  return new;
end;
$$;

drop trigger if exists clients_guard_archive on public.clients;
create trigger clients_guard_archive
  before update on public.clients
  for each row execute function public.clients_guard_archive();

-- 5. Un nouveau lavage réactive un client archivé
create or replace function public.entrees_unarchive_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.client_id is not null then
    perform set_config('uw.system_unarchive', '1', true);  -- portée : transaction courante
    update public.clients
       set archived_at = null, archived_by = null
     where id = new.client_id and archived_at is not null;
    perform set_config('uw.system_unarchive', '', true);
  end if;
  return new;
end;
$$;

drop trigger if exists entrees_unarchive_client on public.entrees;
create trigger entrees_unarchive_client
  after insert on public.entrees
  for each row execute function public.entrees_unarchive_client();

-- 6. Vérification
select count(*) filter (where archived_at is not null) as archives, count(*) as total from public.clients;
