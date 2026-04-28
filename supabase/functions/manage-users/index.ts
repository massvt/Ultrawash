// =====================================================================
// UltraWash — Edge Function : manage-users
// Gestion des comptes utilisateurs (super_admin only)
// Convention : téléphone = identifiant. L'email stocké en base est
// synthétisé sous la forme {telephone}@ultrawash.local.
// =====================================================================
//
// DÉPLOIEMENT (depuis le dashboard Supabase) :
//   1. Project > Edge Functions > "Deploy a new function"
//   2. Nom : manage-users
//   3. Coller ce fichier en entier dans l'éditeur, puis Deploy.
//   4. Aucune variable secrète à ajouter : SUPABASE_URL et
//      SUPABASE_SERVICE_ROLE_KEY sont injectées automatiquement par
//      Supabase dans toutes les edge functions.
//
// USAGE depuis le front (avec sb = createClient(anon)) :
//   await sb.functions.invoke('manage-users', {
//     body: { action: 'list' }
//   })
// =====================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EMAIL_DOMAIN = 'ultrawash.local'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizePhone(raw: string): string {
  return String(raw || '').replace(/\D/g, '').trim()
}

function emailFromPhone(phone: string): string {
  return `${phone}@${EMAIL_DOMAIN}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Client service-role pour les opérations admin
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false },
  })

  // ---- Auth : vérifier que l'appelant est super_admin ----
  const authHeader = req.headers.get('Authorization') || ''
  const jwt = authHeader.replace(/^Bearer\s+/i, '')
  if (!jwt) return jsonResponse({ error: 'Missing Authorization' }, 401)

  // Valide le JWT directement via le client admin (plus fiable en Deno)
  const { data: userData, error: userErr } = await admin.auth.getUser(jwt)
  if (userErr || !userData?.user) {
    return jsonResponse({ error: 'Invalid token: ' + (userErr?.message || 'no user') }, 401)
  }
  const user = userData.user

  const { data: caller, error: profErr } = await admin
    .from('profiles')
    .select('role, actif')
    .eq('id', user.id)
    .maybeSingle()

  if (profErr) return jsonResponse({ error: profErr.message }, 500)
  if (!caller || !caller.actif || caller.role !== 'super_admin') {
    return jsonResponse({ error: 'Forbidden : super_admin only' }, 403)
  }

  // ---- Routage ----
  let payload: any = {}
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400)
  }

  const action = String(payload.action || '')

  try {
    switch (action) {
      case 'list':
        return await handleList(admin)
      case 'create':
        return await handleCreate(admin, payload)
      case 'update':
        return await handleUpdate(admin, payload)
      case 'reset-password':
        return await handleResetPassword(admin, payload)
      case 'delete':
        return await handleDelete(admin, payload, user.id)
      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400)
    }
  } catch (e) {
    return jsonResponse({ error: (e as Error).message }, 500)
  }
})

// ---------------------------------------------------------------------
// list : retourne tous les profils + email auth associé
// ---------------------------------------------------------------------
async function handleList(admin: any) {
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, role, telephone, prenom, nom, actif, created_at, updated_at')
    .order('created_at', { ascending: true })
  if (pErr) return jsonResponse({ error: pErr.message }, 500)

  // Récupère les emails depuis auth.users (paginé, on garde simple pour < 100 users)
  const { data: usersData, error: uErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  })
  if (uErr) return jsonResponse({ error: uErr.message }, 500)

  const emailById: Record<string, string> = {}
  for (const u of usersData.users || []) emailById[u.id] = u.email || ''

  const rows = (profiles || []).map((p: any) => ({
    ...p,
    email: emailById[p.id] || null,
  }))
  return jsonResponse({ users: rows })
}

// ---------------------------------------------------------------------
// create : crée un user auth + profile
// payload : { telephone, password, prenom, nom, role }
// ---------------------------------------------------------------------
async function handleCreate(admin: any, p: any) {
  const telephone = normalizePhone(p.telephone)
  const password = String(p.password || '')
  const prenom = String(p.prenom || '').trim()
  const nom = String(p.nom || '').trim()
  const role = String(p.role || '')

  if (!telephone || telephone.length < 7) {
    return jsonResponse({ error: 'Téléphone invalide' }, 400)
  }
  if (!password || password.length < 6) {
    return jsonResponse({ error: 'Mot de passe trop court (6+ caractères)' }, 400)
  }
  if (!['super_admin', 'admin', 'agent'].includes(role)) {
    return jsonResponse({ error: 'Rôle invalide' }, 400)
  }
  if (!prenom || !nom) {
    return jsonResponse({ error: 'Prénom et nom requis' }, 400)
  }

  // Vérifier unicité du téléphone
  const { data: dup } = await admin
    .from('profiles')
    .select('id')
    .eq('telephone', telephone)
    .maybeSingle()
  if (dup) return jsonResponse({ error: 'Ce téléphone est déjà utilisé' }, 409)

  const email = emailFromPhone(telephone)
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { telephone, prenom, nom },
  })
  if (cErr) return jsonResponse({ error: cErr.message }, 500)

  const newId = created.user.id
  const { error: insErr } = await admin.from('profiles').insert({
    id: newId,
    role,
    telephone,
    prenom,
    nom,
    actif: true,
  })
  if (insErr) {
    // rollback auth user pour éviter un orphelin
    await admin.auth.admin.deleteUser(newId)
    return jsonResponse({ error: insErr.message }, 500)
  }

  return jsonResponse({ ok: true, id: newId, email })
}

// ---------------------------------------------------------------------
// update : modifie role/prenom/nom/telephone/actif
// payload : { id, role?, prenom?, nom?, telephone?, actif? }
// Si le téléphone change, l'email auth synthétique {tel}@ultrawash.local
// est aussi mis à jour pour rester cohérent avec le login.
// ---------------------------------------------------------------------
async function handleUpdate(admin: any, p: any) {
  const id = String(p.id || '')
  if (!id) return jsonResponse({ error: 'id requis' }, 400)

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (p.role !== undefined) {
    if (!['super_admin', 'admin', 'agent'].includes(p.role)) {
      return jsonResponse({ error: 'Rôle invalide' }, 400)
    }
    patch.role = p.role
  }
  if (p.prenom !== undefined) patch.prenom = String(p.prenom).trim()
  if (p.nom !== undefined) patch.nom = String(p.nom).trim()
  if (p.actif !== undefined) patch.actif = !!p.actif

  let newPhone: string | null = null
  if (p.telephone !== undefined) {
    newPhone = normalizePhone(p.telephone)
    if (!newPhone || newPhone.length < 7) {
      return jsonResponse({ error: 'Téléphone invalide' }, 400)
    }
    const { data: dup } = await admin
      .from('profiles')
      .select('id')
      .eq('telephone', newPhone)
      .neq('id', id)
      .maybeSingle()
    if (dup) return jsonResponse({ error: 'Ce téléphone est déjà utilisé' }, 409)
    patch.telephone = newPhone
  }

  const { data, error } = await admin
    .from('profiles')
    .update(patch)
    .eq('id', id)
    .select()
    .maybeSingle()
  if (error) return jsonResponse({ error: error.message }, 500)
  if (!data) return jsonResponse({ error: 'Utilisateur introuvable' }, 404)

  // Synchroniser l'email auth si le téléphone a changé
  if (newPhone) {
    const { error: emailErr } = await admin.auth.admin.updateUserById(id, {
      email: emailFromPhone(newPhone),
      email_confirm: true,
      user_metadata: { telephone: newPhone, prenom: data.prenom, nom: data.nom },
    })
    if (emailErr) return jsonResponse({ error: 'Profil mis à jour mais email auth en échec : ' + emailErr.message }, 500)
  }

  // Si on désactive : bannir au niveau auth pour invalider la session
  if (p.actif === false) {
    await admin.auth.admin.updateUserById(id, { ban_duration: '876000h' }) // ~100 ans
  } else if (p.actif === true) {
    await admin.auth.admin.updateUserById(id, { ban_duration: 'none' })
  }

  return jsonResponse({ ok: true, user: data })
}

// ---------------------------------------------------------------------
// reset-password : change le mot de passe d'un utilisateur
// payload : { id, password }
// ---------------------------------------------------------------------
async function handleResetPassword(admin: any, p: any) {
  const id = String(p.id || '')
  const password = String(p.password || '')
  if (!id) return jsonResponse({ error: 'id requis' }, 400)
  if (!password || password.length < 6) {
    return jsonResponse({ error: 'Mot de passe trop court (6+ caractères)' }, 400)
  }
  const { error } = await admin.auth.admin.updateUserById(id, { password })
  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ ok: true })
}

// ---------------------------------------------------------------------
// delete : supprime définitivement (auth + profile via cascade)
// payload : { id }
// ---------------------------------------------------------------------
async function handleDelete(admin: any, p: any, callerId: string) {
  const id = String(p.id || '')
  if (!id) return jsonResponse({ error: 'id requis' }, 400)
  if (id === callerId) {
    return jsonResponse({ error: 'Tu ne peux pas te supprimer toi-même' }, 400)
  }
  const { error } = await admin.auth.admin.deleteUser(id)
  if (error) return jsonResponse({ error: error.message }, 500)
  return jsonResponse({ ok: true })
}
