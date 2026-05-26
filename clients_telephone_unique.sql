-- =====================================================================
-- UltraWash — Téléphone client unique
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- =====================================================================
-- Empêche d'attribuer le même numéro de téléphone à plusieurs clients.
-- Les clients sans numéro (NULL) restent autorisés en nombre.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Normaliser les téléphones "vides" en NULL (sinon plusieurs '' = doublons)
-- ---------------------------------------------------------------------
update public.clients set telephone = null
 where telephone is not null and btrim(telephone) = '';

-- ---------------------------------------------------------------------
-- 2) DIAGNOSTIC : lister d'éventuels doublons AVANT de créer la contrainte.
--    Si cette requête renvoie des lignes, il faut d'abord les régler
--    (fusionner / corriger) car l'index unique échouera sinon.
-- ---------------------------------------------------------------------
-- select telephone, count(*), array_agg(nom order by created_at) as clients
--   from public.clients
--  where telephone is not null
--  group by telephone
-- having count(*) > 1;

-- ---------------------------------------------------------------------
-- 3) Index unique sur le téléphone (NULL multiples autorisés)
-- ---------------------------------------------------------------------
create unique index if not exists clients_telephone_unique
  on public.clients (telephone);

-- ---------------------------------------------------------------------
-- 4) Réservation publique : création de fiche robuste à la contrainte
--    (gère une insertion concurrente via ON CONFLICT)
-- ---------------------------------------------------------------------
create or replace function public.public_create_booking(
  p_nom           text,
  p_telephone     text,
  p_plaque        text,
  p_vehicule_type text,
  p_date          date,
  p_heure         text,
  p_type_lavage   text,
  p_notes         text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg          public.booking_config%rowtype;
  v_local        timestamp := (now() at time zone 'Africa/Dakar');
  v_today        date := v_local::date;
  v_nowm         int  := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_min          int;
  v_start int; v_end int; v_step int; v_cap int;
  v_montant      integer;
  v_id           uuid;
  v_nom          text := btrim(p_nom);
  v_tel          text := btrim(p_telephone);
  v_client_id    uuid;
  v_existing_nom text;
begin
  select * into v_cfg from public.booking_config where id = true;
  if not coalesce(v_cfg.is_open, true) then
    return jsonb_build_object('ok', false, 'error',
      coalesce(v_cfg.closed_message, 'Les réservations en ligne sont momentanément fermées.'));
  end if;

  if coalesce(v_nom, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.');
  end if;
  if coalesce(v_tel, '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Le téléphone est obligatoire.');
  end if;
  if p_heure !~ '^[0-2][0-9]:[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'error', 'Heure invalide.');
  end if;

  if exists (select 1 from public.booking_closed_days where day = p_date) then
    return jsonb_build_object('ok', false, 'error', 'Ce jour n''est pas disponible à la réservation.');
  end if;

  v_start := coalesce(v_cfg.open_hour, 10) * 60;
  v_end   := coalesce(v_cfg.close_hour, 19) * 60;
  v_step  := greatest(coalesce(v_cfg.slot_minutes, 60), 5);
  v_cap   := greatest(coalesce(v_cfg.capacity, 1), 1);
  v_min   := split_part(p_heure, ':', 1)::int * 60 + split_part(p_heure, ':', 2)::int;

  if v_min < v_start or v_min > v_end - v_step or ((v_min - v_start) % v_step) <> 0 then
    return jsonb_build_object('ok', false, 'error', 'Créneau hors horaires.');
  end if;
  if p_date is null or p_date < v_today or (p_date = v_today and v_min <= v_nowm) then
    return jsonb_build_object('ok', false, 'error', 'Ce créneau est déjà passé.');
  end if;

  if (
    select count(*) from public.reservations r
    where r.date_prevue = p_date
      and (extract(hour from r.heure_prevue)::int * 60 + extract(minute from r.heure_prevue)::int) = v_min
      and r.statut in ('prevu', 'arrive')
  ) >= v_cap then
    return jsonb_build_object('ok', false,
      'error', 'Désolé, ce créneau est complet. Merci d''en choisir un autre.');
  end if;

  -- Client : reconnaître par téléphone (nom enregistré conservé),
  -- sinon créer la fiche ; ON CONFLICT couvre une insertion concurrente.
  select id, nom into v_client_id, v_existing_nom
  from public.clients where telephone = v_tel order by created_at limit 1;

  if v_client_id is null then
    insert into public.clients (type, nom, telephone)
    values ('particulier', v_nom, v_tel)
    on conflict (telephone) do nothing
    returning id into v_client_id;

    if v_client_id is null then
      select id, nom into v_client_id, v_existing_nom
      from public.clients where telephone = v_tel limit 1;
      v_nom := coalesce(nullif(btrim(v_existing_nom), ''), v_nom);
    end if;
  else
    v_nom := coalesce(nullif(btrim(v_existing_nom), ''), v_nom);
  end if;

  select prix into v_montant
  from public.services where nom = p_type_lavage and actif;

  insert into public.reservations
    (client_id, client_nom, client_telephone, plaque, vehicule_type, date_prevue, heure_prevue,
     type_lavage, montant_estime, statut, source, notes)
  values
    (v_client_id, v_nom, v_tel,
     nullif(upper(btrim(coalesce(p_plaque, ''))), ''),
     nullif(btrim(coalesce(p_vehicule_type, '')), ''),
     p_date,
     make_time(v_min / 60, v_min % 60, 0),
     nullif(btrim(coalesce(p_type_lavage, '')), ''),
     v_montant, 'prevu', 'public',
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'client_id', v_client_id, 'client_nom', v_nom);
end;
$$;
