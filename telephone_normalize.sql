-- ============================================================
-- Normalisation des numéros de téléphone déjà stockés
-- ============================================================
-- Aligne les données existantes sur la forme canonique utilisée
-- par normalizePhone() (app.js / reservation.js) : chiffres
-- uniquement, format international sans « + », hypothèse Sénégal
-- (+221) pour un numéro local à 9 chiffres.
--
-- Sans cette passe, un même numéro saisi jadis sous une autre forme
-- (77…, 0077…, +221 77…) ne correspond plus aux lookups .eq(telephone)
-- ni au rattachement client → clients affichés à « 0 lavage / CA 0 ».
--
-- À exécuter UNE fois dans Supabase SQL Editor, dans l'ordre.
-- Idempotent : ré-exécuter ne change rien (normaliser une valeur
-- déjà canonique la laisse identique).
-- ============================================================

-- 0. Fonction de normalisation (miroir exact du JS)
CREATE OR REPLACE FUNCTION normalize_phone(tel text) RETURNS text AS $$
DECLARE d text;
BEGIN
  d := regexp_replace(COALESCE(tel, ''), '\D', '', 'g');
  IF d = '' THEN RETURN NULL; END IF;
  IF left(d, 3) = '221' THEN RETURN d; END IF;
  d := regexp_replace(d, '^0+', '');
  IF d = '' THEN RETURN NULL; END IF;
  IF length(d) = 9 THEN RETURN '221' || d; END IF;
  RETURN d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. PRÉ-CHECK collisions clients : la colonne clients.telephone est UNIQUE.
--    Si deux fiches se normalisent vers le MÊME numéro, l'UPDATE de l'étape 3
--    échouera. Résoudre ces doublons manuellement (fusion/suppression) AVANT.
--    Ce SELECT doit renvoyer 0 ligne pour continuer sereinement.
SELECT normalize_phone(telephone) AS tel_normalise,
       count(*)                    AS nb_fiches,
       array_agg(id)               AS client_ids,
       array_agg(nom)              AS noms
FROM clients
WHERE telephone IS NOT NULL
GROUP BY normalize_phone(telephone)
HAVING count(*) > 1;

-- 2. Normaliser les tables sans contrainte d'unicité (entrees, reservations)
UPDATE entrees
   SET telephone = normalize_phone(telephone)
 WHERE telephone IS NOT NULL
   AND telephone IS DISTINCT FROM normalize_phone(telephone);

UPDATE reservations
   SET client_telephone = normalize_phone(client_telephone)
 WHERE client_telephone IS NOT NULL
   AND client_telephone IS DISTINCT FROM normalize_phone(client_telephone);

-- 3. Normaliser les clients (n'exécuter qu'une fois l'étape 1 à 0 ligne)
UPDATE clients
   SET telephone = normalize_phone(telephone)
 WHERE telephone IS NOT NULL
   AND telephone IS DISTINCT FROM normalize_phone(telephone);

-- 4. BONUS — rattacher définitivement les lavages orphelins à leur client
--    (client_id NULL mais téléphone désormais identique). Répare l'historique
--    d'un coup, au-delà du rattachement à la volée fait côté app.
UPDATE entrees e
   SET client_id = c.id
  FROM clients c
 WHERE e.client_id IS NULL
   AND e.telephone IS NOT NULL
   AND e.telephone = c.telephone;

-- 5. Contrôle : lavages encore orphelins alors qu'une fiche partage le numéro
--    (doit renvoyer 0 ligne après l'étape 4).
SELECT e.id, e.telephone
FROM entrees e
JOIN clients c ON c.telephone = e.telephone
WHERE e.client_id IS NULL;
