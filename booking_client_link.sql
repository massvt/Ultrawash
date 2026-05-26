-- =====================================================================
-- UltraWash — Réservation publique : reconnaître / créer la fiche client
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- Pré-requis : public_booking.sql, booking_close.sql, booking_settings.sql.
-- =====================================================================
-- Lors d'une réservation via le lien public :
--   - si le téléphone correspond à un client existant → on relie (client_id) ;
--   - sinon → on crée automatiquement une fiche client (type particulier).
-- La fonction est SECURITY DEFINER : elle peut lire/écrire dans clients
-- malgré la RLS, sans ouvrir la table au rôle anon.
-- =====================================================================

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
  v_cfg       public.booking_config%rowtype;
  v_local     timestamp := (now() at time zone 'Africa/Dakar');
  v_today     date := v_local::date;
  v_nowm      int  := extract(hour from v_local)::int * 60 + extract(minute from v_local)::int;
  v_min       int;
  v_start int; v_end int; v_step int; v_cap int;
  v_montant   integer;
  v_id        uuid;
  v_nom       text := btrim(p_nom);
  v_tel       text := btrim(p_telephone);
  v_client_id uuid;
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

  -- Client : reconnaître par téléphone, sinon créer la fiche
  select id into v_client_id
  from public.clients
  where telephone = v_tel
  order by created_at
  limit 1;

  if v_client_id is null then
    insert into public.clients (type, nom, telephone)
    values ('particulier', v_nom, v_tel)
    returning id into v_client_id;
  end if;

  select prix into v_montant
  from public.services
  where nom = p_type_lavage and actif;

  insert into public.reservations
    (client_id, client_nom, client_telephone, plaque, vehicule_type, date_prevue, heure_prevue,
     type_lavage, montant_estime, statut, source, notes)
  values
    (v_client_id,
     v_nom,
     v_tel,
     nullif(upper(btrim(coalesce(p_plaque, ''))), ''),
     nullif(btrim(coalesce(p_vehicule_type, '')), ''),
     p_date,
     make_time(v_min / 60, v_min % 60, 0),
     nullif(btrim(coalesce(p_type_lavage, '')), ''),
     v_montant,
     'prevu', 'public',
     nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id, 'client_id', v_client_id);
end;
$$;


-- ---------------------------------------------------------------------
-- Vérifications
-- ---------------------------------------------------------------------
-- 1) Numéro inconnu → crée une fiche, renvoie client_id
-- select public.public_create_booking('Nouveau Client','771112233',null,'Voiture',
--          current_date + 1, '11:00', null, 'test création fiche');
-- select id, nom, telephone from public.clients where telephone = '771112233';
-- 2) Même numéro → réutilise la même fiche (pas de doublon)
