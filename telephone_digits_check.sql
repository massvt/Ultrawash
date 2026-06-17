-- ============================================================
-- Contraintes CHECK : telephone = digits uniquement
-- ============================================================
-- Garantit que toute valeur écrite dans une colonne telephone
-- ne contient que des chiffres (filet de sécurité en plus du
-- filtre JS côté UI, pour les inserts directs via PostgREST
-- ou les imports manuels via Supabase Studio).
--
-- À exécuter une seule fois dans Supabase SQL Editor.
-- Idempotent (DROP IF EXISTS avant ADD).
-- ============================================================

-- 1. Vérification préalable : aucune ligne ne doit déjà violer la règle.
--    Si l'un de ces SELECT renvoie des lignes, corriger AVANT d'appliquer
--    les contraintes ci-dessous (sinon le ALTER échoue).
SELECT 'entrees' AS table_name, id::text AS id, telephone FROM entrees
  WHERE telephone IS NOT NULL AND telephone !~ '^[0-9]+$'
UNION ALL
SELECT 'clients', id::text, telephone FROM clients
  WHERE telephone IS NOT NULL AND telephone !~ '^[0-9]+$'
UNION ALL
SELECT 'reservations', id::text, client_telephone FROM reservations
  WHERE client_telephone IS NOT NULL AND client_telephone !~ '^[0-9]+$';

-- 2. Application des contraintes (autorise NULL ou chaîne de chiffres non vide)
ALTER TABLE entrees      DROP CONSTRAINT IF EXISTS entrees_telephone_digits;
ALTER TABLE entrees      ADD  CONSTRAINT entrees_telephone_digits
  CHECK (telephone IS NULL OR telephone ~ '^[0-9]+$');

ALTER TABLE clients      DROP CONSTRAINT IF EXISTS clients_telephone_digits;
ALTER TABLE clients      ADD  CONSTRAINT clients_telephone_digits
  CHECK (telephone IS NULL OR telephone ~ '^[0-9]+$');

ALTER TABLE reservations DROP CONSTRAINT IF EXISTS reservations_telephone_digits;
ALTER TABLE reservations ADD  CONSTRAINT reservations_telephone_digits
  CHECK (client_telephone IS NULL OR client_telephone ~ '^[0-9]+$');
