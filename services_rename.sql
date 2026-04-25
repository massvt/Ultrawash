-- =====================================================================
-- UltraWash — Migration des libellés de services
-- À exécuter dans Supabase Studio > SQL Editor (idempotent)
-- =====================================================================
--
-- Renomme les anciennes valeurs de entrees.type et reservations.type_lavage
-- vers le nouveau catalogue (3 catégories : Lavage / Detailing / Entretien).
--
-- Les valeurs inconnues sont laissées telles quelles ; elles seront
-- automatiquement classées en catégorie "Autre" côté front.
-- =====================================================================

update public.entrees set type = 'Lavage Standard'  where type = 'Lavage simple';
update public.entrees set type = 'Lavage Complet'   where type = 'Lavage complet';
update public.entrees set type = 'Lavage Moquette'  where type = 'Lavage intérieur';
update public.entrees set type = 'Lavage Premium'   where type = 'Lavage premium';
-- 'Polissage' inchangé, mais reclassé côté front en Detailing.

update public.reservations set type_lavage = 'Lavage Standard'  where type_lavage = 'Lavage simple';
update public.reservations set type_lavage = 'Lavage Complet'   where type_lavage = 'Lavage complet';
update public.reservations set type_lavage = 'Lavage Moquette'  where type_lavage = 'Lavage intérieur';
update public.reservations set type_lavage = 'Lavage Premium'   where type_lavage = 'Lavage premium';

-- Vérifications
-- select type, count(*) from public.entrees group by type order by count(*) desc;
-- select type_lavage, count(*) from public.reservations group by type_lavage;
