-- =====================================================================
-- UltraWash — Réglages réservation : horaires + capacité par créneau
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- Pré-requis : public_booking.sql et booking_close.sql déjà exécutés.
-- =====================================================================
-- Ajoute à booking_config : heure d'ouverture/fermeture, durée d'un
-- créneau (minutes) et capacité (nombre de voitures par créneau).
-- Ces réglages pilotent la réservation publique ET le calendrier interne.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Nouvelles colonnes de réglage (valeurs par défaut = comportement actuel)
-- ---------------------------------------------------------------------
alter table public.booking_config
  add column if not exists open_hour    int not null default 10,
  add column if not exists close_hour   int not null default 19,
  add column if not exists slot_minutes int not null default 60,
  add column if not exists capacity     int not null default 1;

alter table public.booking_config drop constraint if exists booking_config_hours_chk;
alter table public.booking_config add constraint booking_config_hours_chk
  check (open_hour >= 0 and close_hour <= 24 and open_hour < close_hour
         and slot_minutes >= 5 and capacity >= 1);

-- Capacité multiple : l'unicité stricte (1 résa par créneau) n'a plus lieu
-- d'être ; le contrôle se fait désormais par comptage dans les fonctions.
drop index if exists public.reservations_creneau_unique;


-- ---------------------------------------------------------------------
-- 2) Créneaux disponibles — grille selon horaires + capacité
-- ---------------------------------------------------------------------
create or replace function public.public_available_slots(p_date date)
returns table(heure text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg   public.booking_config%rowtype;
  v_local timestamp := (now() at time zone 'Africa/Dakar');
  v_today date := v_local::date;
  v_nowm  int  := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_start int; v_end int; v_step int; v_cap int;
begin
  select * into v_cfg from public.booking_config where id = true;
  if not coalesce(v_cfg.is_open, true) then return; end if;
  if p_date is null or p_date < v_today then return; end if;

  v_start := coalesce(v_cfg.open_hour, 10) * 60;
  v_end   := coalesce(v_cfg.close_hour, 19) * 60;
  v_step  := greatest(coalesce(v_cfg.slot_minutes, 60), 5);
  v_cap   := greatest(coalesce(v_cfg.capacity, 1), 1);

  return query
    with grid as (
      select g as m from generate_series(v_start, v_end - v_step, v_step) as g
    )
    select to_char(make_time(grid.m / 60, grid.m % 60, 0), 'HH24:MI')
    from grid
    where (p_date > v_today or grid.m > v_nowm)
      and (
        select count(*) from public.reservations r
        where r.date_prevue = p_date
          and (extract(hour from r.heure_prevue)::int * 60 + extract(minute from r.heure_prevue)::int) = grid.m
          and r.statut in ('prevu', 'arrive')
      ) < v_cap
    order by 1;
end;
$$;


-- ---------------------------------------------------------------------
-- 3) Création publique — valide la grille + la capacité
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
  v_cfg     public.booking_config%rowtype;
  v_local   timestamp := (now() at time zone 'Africa/Dakar');
  v_today   date := v_local::date;
  v_nowm    int  := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_min     int;
  v_start int; v_end int; v_step int; v_cap int;
  v_montant integer;
  v_id      uuid;
begin
  select * into v_cfg from public.booking_config where id = true;
  if not coalesce(v_cfg.is_open, true) then
    return jsonb_build_object('ok', false, 'error',
      coalesce(v_cfg.closed_message, 'Les réservations en ligne sont momentanément fermées.'));
  end if;

  if coalesce(btrim(p_nom), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Le nom est obligatoire.');
  end if;
  if coalesce(btrim(p_telephone), '') = '' then
    return jsonb_build_object('ok', false, 'error', 'Le téléphone est obligatoire.');
  end if;
  if p_heure !~ '^[0-2][0-9]:[0-5][0-9]$' then
    return jsonb_build_object('ok', false, 'error', 'Heure invalide.');
  end if;

  v_start := coalesce(v_cfg.open_hour, 10) * 60;
  v_end   := coalesce(v_cfg.close_hour, 19) * 60;
  v_step  := greatest(coalesce(v_cfg.slot_minutes, 60), 5);
  v_cap   := greatest(coalesce(v_cfg.capacity, 1), 1);
  v_min   := split_part(p_heure, ':', 1)::int * 60 + split_part(p_heure, ':', 2)::int;

  -- Doit être un créneau valide de la grille (dans les horaires + aligné)
  if v_min < v_start or v_min > v_end - v_step or ((v_min - v_start) % v_step) <> 0 then
    return jsonb_build_object('ok', false, 'error', 'Créneau hors horaires.');
  end if;
  if p_date is null or p_date < v_today or (p_date = v_today and v_min <= v_nowm) then
    return jsonb_build_object('ok', false, 'error', 'Ce créneau est déjà passé.');
  end if;

  -- Capacité : nombre de voitures déjà prévues/arrivées sur ce créneau
  if (
    select count(*) from public.reservations r
    where r.date_prevue = p_date
      and (extract(hour from r.heure_prevue)::int * 60 + extract(minute from r.heure_prevue)::int) = v_min
      and r.statut in ('prevu', 'arrive')
  ) >= v_cap then
    return jsonb_build_object('ok', false,
      'error', 'Désolé, ce créneau est complet. Merci d''en choisir un autre.');
  end if;

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
     make_time(v_min / 60, v_min % 60, 0),
     nullif(btrim(coalesce(p_type_lavage, '')), ''),
     v_montant,
     'prevu', 'public',
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;


-- ---------------------------------------------------------------------
-- 4) Vérifications
-- ---------------------------------------------------------------------
-- select open_hour, close_hour, slot_minutes, capacity, is_open from public.booking_config;
-- select * from public.public_available_slots(current_date + 1);
