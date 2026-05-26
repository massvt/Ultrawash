-- =====================================================================
-- UltraWash — Réservation publique (lien client, sans login)
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- Pré-requis : reservations.sql, services.sql, vehicule_types.sql exécutés.
-- =====================================================================
-- Principe de sécurité :
--   La page publique utilise la clé "publishable" (anon). On n'ouvre PAS
--   les tables au rôle anon (ça exposerait noms/téléphones de tous les
--   clients). À la place, 3 fonctions SECURITY DEFINER, accessibles à anon,
--   exposent UNIQUEMENT : les créneaux libres, le catalogue de services et
--   une insertion contrôlée. search_path verrouillé sur public.
--   Horaires : 10h → 19h, créneaux d'1 heure (derniers départs à 18h).
--   Fuseau : Africa/Dakar (UTC+0).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) Colonne source : distinguer une résa "publique" d'une saisie interne
-- ---------------------------------------------------------------------
alter table public.reservations
  add column if not exists source text not null default 'interne';


-- ---------------------------------------------------------------------
-- 1) Catalogue de services (nom, catégorie, prix) — services actifs
-- ---------------------------------------------------------------------
create or replace function public.public_services()
returns table(nom text, categorie text, prix integer)
language sql
security definer
set search_path = public
as $$
  select nom, categorie, prix
  from public.services
  where actif
  order by ordre;
$$;


-- ---------------------------------------------------------------------
-- 2) Types de véhicules actifs
-- ---------------------------------------------------------------------
create or replace function public.public_vehicule_types()
returns table(nom text)
language sql
security definer
set search_path = public
as $$
  select nom from public.vehicule_types where actif order by ordre;
$$;


-- ---------------------------------------------------------------------
-- 3) Créneaux disponibles pour une date donnée
--    Renvoie les heures 'HH:MM' encore libres (10h..18h), en excluant :
--    - les dates passées,
--    - les heures déjà passées si la date = aujourd'hui,
--    - les créneaux déjà occupés (statut prevu ou arrive).
--    Match par heure entière : une résa interne à 10h30 bloque le 10h.
-- ---------------------------------------------------------------------
create or replace function public.public_available_slots(p_date date)
returns table(heure text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open  int := 10;   -- première heure de départ
  v_close int := 18;   -- dernière heure de départ (créneau 18h→19h)
  v_local timestamp := (now() at time zone 'Africa/Dakar');
  v_today date := v_local::date;
  v_curh  int  := extract(hour from v_local)::int;
begin
  if p_date is null or p_date < v_today then
    return;  -- aucune dispo dans le passé
  end if;
  return query
    select to_char(make_time(h, 0, 0), 'HH24:MI')
    from generate_series(v_open, v_close) as h
    where (p_date > v_today or h > v_curh)
      and not exists (
        select 1 from public.reservations r
        where r.date_prevue = p_date
          and extract(hour from r.heure_prevue)::int = h
          and r.statut in ('prevu', 'arrive')
      )
    order by 1;
end;
$$;


-- ---------------------------------------------------------------------
-- 4) Création d'une réservation publique
--    Valide les entrées, re-vérifie le créneau côté serveur, insère en
--    statut 'prevu' / source 'public'. Renvoie un jsonb {ok, error?, id?}.
-- ---------------------------------------------------------------------
create or replace function public.public_create_booking(
  p_nom           text,
  p_telephone     text,
  p_plaque        text,
  p_vehicule_type text,
  p_date          date,
  p_heure         text,   -- 'HH:MM'
  p_type_lavage   text,
  p_notes         text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_local   timestamp := (now() at time zone 'Africa/Dakar');
  v_today   date := v_local::date;
  v_curh    int  := extract(hour from v_local)::int;
  v_h       int;
  v_montant integer;
  v_id      uuid;
begin
  if coalesce(btrim(p_nom), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.');
  end if;
  if coalesce(btrim(p_telephone), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Le téléphone est obligatoire.');
  end if;
  if p_heure !~ '^[0-2][0-9]:[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'error', 'Heure invalide.');
  end if;

  v_h := split_part(p_heure, ':', 1)::int;
  if v_h < 10 or v_h > 18 then
    return jsonb_build_object('ok', false, 'error', 'Créneau hors horaires (10h–19h).');
  end if;
  if p_date is null or p_date < v_today or (p_date = v_today and v_h <= v_curh) then
    return jsonb_build_object('ok', false, 'error', 'Ce créneau est déjà passé.');
  end if;

  -- Le créneau est-il encore libre ?
  if exists (
    select 1 from public.reservations r
    where r.date_prevue = p_date
      and extract(hour from r.heure_prevue)::int = v_h
      and r.statut in ('prevu', 'arrive')
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Désolé, ce créneau vient d''être réservé. Merci d''en choisir un autre.');
  end if;

  -- Montant estimé depuis le catalogue (si service connu)
  select prix into v_montant
  from public.services
  where nom = p_type_lavage and actif;

  insert into public.reservations
    (client_nom, client_telephone, plaque, vehicule_type, date_prevue, heure_prevue,
     type_lavage, montant_estime, statut, source, notes)
  values
    (btrim(p_nom),
     btrim(p_telephone),
     nullif(upper(btrim(coalesce(p_plaque, ''))), ''),
     nullif(btrim(coalesce(p_vehicule_type, '')), ''),
     p_date,
     make_time(v_h, 0, 0),
     nullif(btrim(coalesce(p_type_lavage, '')), ''),
     v_montant,
     'prevu', 'public',
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);

exception
  when unique_violation then
    -- Filet anti-concurrence : l'index unique (date+heure, statut=prevu) a sauté.
    return jsonb_build_object('ok', false,
      'error', 'Désolé, ce créneau vient d''être réservé. Merci d''en choisir un autre.');
end;
$$;


-- ---------------------------------------------------------------------
-- 5) Droits d'exécution pour le rôle public (anon) + authentifié
-- ---------------------------------------------------------------------
grant execute on function public.public_services()                  to anon, authenticated;
grant execute on function public.public_vehicule_types()            to anon, authenticated;
grant execute on function public.public_available_slots(date)       to anon, authenticated;
grant execute on function public.public_create_booking(
  text, text, text, text, date, text, text, text)                   to anon, authenticated;


-- ---------------------------------------------------------------------
-- 6) Vérifications
-- ---------------------------------------------------------------------
-- select * from public.public_services();
-- select * from public.public_available_slots(current_date);
-- select * from public.public_available_slots(current_date + 1);
-- select public.public_create_booking('Test','770000000',null,'Voiture',
--          current_date + 1,'11:00','Lavage Standard','via test SQL');
