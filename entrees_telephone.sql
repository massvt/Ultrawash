-- =====================================================================
-- UltraWash — Ajout du numéro de téléphone sur les entrées (lavages)
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- =====================================================================
-- La fiche entrée capture désormais le téléphone du client (au lieu de la
-- plaque). S'il correspond à un client existant, le front rattache la fiche
-- automatiquement (client_id). La colonne plaque est conservée pour
-- l'historique et les autres écrans.
-- =====================================================================

alter table public.entrees
  add column if not exists telephone text;

create index if not exists entrees_telephone_idx
  on public.entrees (telephone);

-- Vérif :
-- select date, heure, type, telephone, plaque, montant from public.entrees order by date desc limit 5;
