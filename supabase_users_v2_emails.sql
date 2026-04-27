-- =====================================================================
-- UltraWash — Migration des emails auth des 3 comptes existants
-- Convertit l'email en {telephone}@ultrawash.local pour uniformiser
-- la connexion par téléphone.
-- À exécuter APRÈS supabase_users_v2.sql et APRÈS le déploiement
-- du nouveau front (login par téléphone).
-- Idempotent.
-- =====================================================================

-- admin@ultrawash.sn → 781436380@ultrawash.local
update auth.users
   set email = '781436380@ultrawash.local',
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('telephone','781436380')
 where email = 'admin@ultrawash.sn';

-- agent1@ultrawash.sn → 774780264@ultrawash.local
update auth.users
   set email = '774780264@ultrawash.local',
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('telephone','774780264')
 where email = 'agent1@ultrawash.sn';

-- agent2@ultrawash.sn → 776791841@ultrawash.local
update auth.users
   set email = '776791841@ultrawash.local',
       raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
                            || jsonb_build_object('telephone','776791841')
 where email = 'agent2@ultrawash.sn';

-- Vérification
-- select email, raw_user_meta_data->>'telephone' as tel from auth.users order by email;
