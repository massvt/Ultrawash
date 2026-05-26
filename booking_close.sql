-- =====================================================================
-- UltraWash — Fermeture des réservations publiques (admin/super_admin)
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- Pré-requis : public_booking.sql déjà exécuté.
-- =====================================================================
-- Permet à un admin/super_admin de fermer les réservations en ligne
-- (ex : trop de véhicules sur place). Quand c'est fermé :
--   - la page publique affiche un message et masque le calendrier ;
--   - public_available_slots ne renvoie aucun créneau ;
--   - public_create_booking refuse avec le message de fermeture.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Table de config (ligne unique)
-- ---------------------------------------------------------------------
create table if not exists public.booking_config (
  id             boolean primary key default true,
  is_open        boolean not null default true,
  closed_message text not null default 'Les réservations en ligne sont momentanément fermées (forte affluence). Merci de nous appeler ou de réessayer plus tard.',
  updated_at     timestamptz default now(),
  constraint booking_config_singleton check (id = true)
);

insert into public.booking_config (id, is_open) values (true, true)
  on conflict (id) do nothing;

alter table public.booking_config enable row level security;

drop policy if exists "booking_config_select_auth"  on public.booking_config;
drop policy if exists "booking_config_update_admin"  on public.booking_config;

-- SELECT : tout authentifié (le CRM lit l'état)
create policy "booking_config_select_auth" on public.booking_config
  for select to authenticated using (true);

-- UPDATE : admin ou super_admin uniquement
create policy "booking_config_update_admin" on public.booking_config
  for update to authenticated
  using  (public.uw_is_admin_or_above())
  with check (public.uw_is_admin_or_above());


-- ---------------------------------------------------------------------
-- 2) État des réservations pour la page publique (rôle anon)
-- ---------------------------------------------------------------------
create or replace function public.public_booking_status()
returns table(is_open boolean, closed_message text)
language sql
security definer
set search_path = public
as $$
  select is_open, closed_message from public.booking_config where id = true;
$$;

grant execute on function public.public_booking_status() to anon, authenticated;


-- ---------------------------------------------------------------------
-- 3) Créneaux disponibles — aucun si les réservations sont fermées
-- ---------------------------------------------------------------------
create or replace function public.public_available_slots(p_date date)
returns table(heure text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_open  int := 10;
  v_close int := 18;
  v_local timestamp := (now() at time zone 'Africa/Dakar');
  v_today date := v_local::date;
  v_curh  int  := extract(hour from v_local)::int;
begin
  -- Réservations fermées par l'admin → aucun créneau
  if not coalesce((select is_open from public.booking_config where id = true), true) then
    return;
  end if;
  if p_date is null or p_date < v_today then
    return;
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
-- 4) Création d'une réservation publique — refus si fermé
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
  v_local   timestamp := (now() at time zone 'Africa/Dakar');
  v_today   date := v_local::date;
  v_curh    int  := extract(hour from v_local)::int;
  v_h       int;
  v_montant integer;
  v_id      uuid;
  v_cfg     public.booking_config%rowtype;
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

  v_h := split_part(p_heure, ':', 1)::int;
  if v_h < 10 or v_h > 18 then
    return jsonb_build_object('ok', false, 'error', 'Créneau hors horaires (10h–19h).');
  end if;
  if p_date is null or p_date < v_today or (p_date = v_today and v_h <= v_curh) then
    return jsonb_build_object('ok', false, 'error', 'Ce créneau est déjà passé.');
  end if;

  if exists (
    select 1 from public.reservations r
    where r.date_prevue = p_date
      and extract(hour from r.heure_prevue)::int = v_h
      and r.statut in ('prevu', 'arrive')
  ) then
    return jsonb_build_object('ok', false,
      'error', 'Désolé, ce créneau vient d''être réservé. Merci d''en choisir un autre.');
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
     make_time(v_h, 0, 0),
     nullif(btrim(coalesce(p_type_lavage, '')), ''),
     v_montant,
     'prevu', 'public',
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);

exception
  when unique_violation then
    return jsonb_build_object('ok', false,
      'error', 'Désolé, ce créneau vient d''être réservé. Merci d''en choisir un autre.');
end;
$$;


-- ---------------------------------------------------------------------
-- 5) Vérifications
-- ---------------------------------------------------------------------
-- select * from public.public_booking_status();
-- update public.booking_config set is_open = false where id = true;  -- fermer
-- select * from public.public_available_slots(current_date + 1);     -- doit être vide
-- update public.booking_config set is_open = true where id = true;   -- rouvrir
