// ===== SUPABASE =====
const SUPABASE_URL = 'https://hajnttnlyoftxgqsjyjl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_maWkeTvWo7H3aQzFwzyp8w_8OvgzSXf';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// État session + rôle courant
const session = { user: null, role: null };
const isAdmin = () => session.role === 'admin' || session.role === 'super_admin';
const isSuperAdmin = () => session.role === 'super_admin';

// In-memory cache (rempli au chargement, mis à jour après chaque mutation)
const cache = { entrees: [], sorties: [], clients: [], vehicules: [], reservations: [], services: [], vehiculeTypes: [], serviceCategories: [], vehiculeCategories: [], clientsLoaded: false, bookingConfig: null };

// Map nom_service → prix (rempli au boot, utilisé pour pré-remplir le montant)
const PRIX = {};

const DB = {
  getEntrees:            () => cache.entrees,
  getSorties:            () => cache.sorties,
  getServices:           () => cache.services,
  getVehiculeTypes:      () => cache.vehiculeTypes,
  getServiceCategories:  () => cache.serviceCategories,
  getVehiculeCategories: () => cache.vehiculeCategories,

  async loadAll() {
    const [
      { data: e,  error: ee },
      { data: s,  error: se },
      { data: r,  error: re },
      { data: sv, error: sve },
      { data: vt, error: vte },
      { data: sc, error: sce },
      { data: vc, error: vce },
    ] = await Promise.all([
      sb.from('entrees').select('*').order('date', { ascending: false }).order('heure', { ascending: false }),
      sb.from('sorties').select('*').order('date', { ascending: false }),
      sb.from('reservations').select('*').order('date_prevue', { ascending: true }).order('heure_prevue', { ascending: true }),
      sb.from('services').select('*').order('ordre', { ascending: true }),
      sb.from('vehicule_types').select('*').order('ordre', { ascending: true }),
      sb.from('service_categories').select('*').order('ordre', { ascending: true }),
      sb.from('vehicule_categories').select('*').order('ordre', { ascending: true }),
    ]);
    if (ee)  console.error('entrees:', ee);
    if (se)  console.error('sorties:', se);
    if (re)  console.error('reservations:', re);
    if (sve) console.error('services:', sve);
    if (vte) console.error('vehicule_types:', vte);
    if (sce) console.error('service_categories:', sce);
    if (vce) console.error('vehicule_categories:', vce);
    cache.entrees            = e  || [];
    cache.sorties            = s  || [];
    cache.reservations       = r  || [];
    cache.services           = sv || [];
    cache.vehiculeTypes      = vt || [];
    cache.serviceCategories  = sc || [];
    cache.vehiculeCategories = vc || [];
    Object.keys(PRIX).forEach(k => delete PRIX[k]);
    (sv || []).filter(s => s.actif).forEach(svc => { PRIX[svc.nom] = svc.prix; });
  },

  // ===== Catégories de services =====
  async addServiceCategory(nom, icon) {
    const next = (cache.serviceCategories.reduce((m, c) => Math.max(m, c.ordre), 0) || 0) + 10;
    const { data, error } = await sb.from('service_categories')
      .insert({ nom, icon: icon || '📦', ordre: next, actif: true }).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.serviceCategories.push(data);
    cache.serviceCategories.sort((a, b) => a.ordre - b.ordre);
    return data;
  },

  async renameServiceCategory(oldNom, newNom, icon) {
    if (oldNom !== newNom && cache.serviceCategories.some(c => c.nom.toLowerCase() === newNom.toLowerCase())) {
      toast('Une catégorie porte déjà ce nom', '#e53935'); return false;
    }
    const patch = { updated_at: new Date().toISOString() };
    if (newNom !== oldNom) patch.nom = newNom;
    if (icon != null) patch.icon = icon;
    const { error: e1 } = await sb.from('service_categories').update(patch).eq('nom', oldNom);
    if (e1) { toast('Erreur : ' + e1.message, '#e53935'); return false; }
    if (newNom !== oldNom) {
      const { error: e2 } = await sb.from('services').update({ categorie: newNom }).eq('categorie', oldNom);
      if (e2) { toast('Renommé mais services non propagés : ' + e2.message, '#e53935'); }
    }
    await DB.loadAll();
    return true;
  },

  async delServiceCategory(nom) {
    const used = cache.services.some(s => s.categorie === nom);
    if (used) {
      toast('Catégorie utilisée : déplace ou supprime d\'abord ses services', '#e53935');
      return false;
    }
    const { error } = await sb.from('service_categories').delete().eq('nom', nom);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.serviceCategories = cache.serviceCategories.filter(c => c.nom !== nom);
    return true;
  },

  // ===== Catégories de véhicules =====
  async addVehiculeCategory(nom, icon) {
    const next = (cache.vehiculeCategories.reduce((m, c) => Math.max(m, c.ordre), 0) || 0) + 10;
    const { data, error } = await sb.from('vehicule_categories')
      .insert({ nom, icon: icon || '🚗', ordre: next, actif: true }).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.vehiculeCategories.push(data);
    cache.vehiculeCategories.sort((a, b) => a.ordre - b.ordre);
    return data;
  },

  async renameVehiculeCategory(oldNom, newNom, icon) {
    if (oldNom !== newNom && cache.vehiculeCategories.some(c => c.nom.toLowerCase() === newNom.toLowerCase())) {
      toast('Une catégorie porte déjà ce nom', '#e53935'); return false;
    }
    const patch = { updated_at: new Date().toISOString() };
    if (newNom !== oldNom) patch.nom = newNom;
    if (icon != null) patch.icon = icon;
    const { error: e1 } = await sb.from('vehicule_categories').update(patch).eq('nom', oldNom);
    if (e1) { toast('Erreur : ' + e1.message, '#e53935'); return false; }
    if (newNom !== oldNom) {
      const { error: e2 } = await sb.from('vehicule_types').update({ categorie: newNom }).eq('categorie', oldNom);
      if (e2) { toast('Renommé mais types non propagés : ' + e2.message, '#e53935'); }
    }
    await DB.loadAll();
    return true;
  },

  async delVehiculeCategory(nom) {
    const used = cache.vehiculeTypes.some(v => v.categorie === nom);
    if (used) {
      toast('Catégorie utilisée : déplace ou supprime d\'abord ses types', '#e53935');
      return false;
    }
    const { error } = await sb.from('vehicule_categories').delete().eq('nom', nom);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.vehiculeCategories = cache.vehiculeCategories.filter(c => c.nom !== nom);
    return true;
  },

  async setVehiculeTypeCategorie(nom, categorie) {
    const { data, error } = await sb.from('vehicule_types')
      .update({ categorie, updated_at: new Date().toISOString() })
      .eq('nom', nom).select().maybeSingle();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    if (!data) return null;
    const i = cache.vehiculeTypes.findIndex(v => v.nom === nom);
    if (i !== -1) cache.vehiculeTypes[i] = data;
    return data;
  },

  async addVehiculeType(nom, categorie) {
    const next = (cache.vehiculeTypes.reduce((m, v) => Math.max(m, v.ordre), 0) || 0) + 10;
    const row = { nom, ordre: next };
    if (categorie) row.categorie = categorie;
    const { data, error } = await sb.from('vehicule_types').insert(row).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.vehiculeTypes.push(data);
    cache.vehiculeTypes.sort((a, b) => a.ordre - b.ordre);
    return data;
  },

  async toggleVehiculeType(nom, actif) {
    const { data, error } = await sb.from('vehicule_types')
      .update({ actif, updated_at: new Date().toISOString() })
      .eq('nom', nom).select().maybeSingle();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    if (!data) return null;
    const i = cache.vehiculeTypes.findIndex(v => v.nom === nom);
    if (i !== -1) cache.vehiculeTypes[i] = data;
    return data;
  },

  async delVehiculeType(nom) {
    const { error } = await sb.from('vehicule_types').delete().eq('nom', nom);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.vehiculeTypes = cache.vehiculeTypes.filter(v => v.nom !== nom);
    return true;
  },

  getReservations: () => cache.reservations,

  async addReservation(row) {
    const { data, error } = await sb.from('reservations').insert(row).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.reservations.push(data);
    cache.reservations.sort(resaSort);
    return data;
  },

  async updateReservation(id, row) {
    const { data, error } = await sb.from('reservations').update(row).eq('id', id).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    const i = cache.reservations.findIndex(r => r.id === id);
    if (i !== -1) cache.reservations[i] = data;
    cache.reservations.sort(resaSort);
    return data;
  },

  async delReservation(id) {
    const { error } = await sb.from('reservations').delete().eq('id', id);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.reservations = cache.reservations.filter(r => r.id !== id);
    return true;
  },

  async addEntree(row) {
    const { data, error } = await sb.from('entrees').insert(row).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.entrees.unshift(data);
    return data;
  },

  async addSortie(row) {
    const { data, error } = await sb.from('sorties').insert(row).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.sorties.unshift(data);
    return data;
  },

  async delEntree(id) {
    const { error } = await sb.from('entrees').delete().eq('id', id);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.entrees = cache.entrees.filter(e => e.id !== id);
    return true;
  },

  async delSortie(id) {
    const { error } = await sb.from('sorties').delete().eq('id', id);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.sorties = cache.sorties.filter(s => s.id !== id);
    return true;
  },

  async updateEntree(id, row) {
    const { data, error } = await sb.from('entrees').update(row).eq('id', id).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    const i = cache.entrees.findIndex(e => e.id === id);
    if (i !== -1) cache.entrees[i] = data;
    return data;
  },

  async updateService(nom, prix) {
    const { data, error } = await sb.from('services')
      .update({ prix, updated_at: new Date().toISOString() })
      .eq('nom', nom).select().maybeSingle();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    if (!data) return null;
    const i = cache.services.findIndex(s => s.nom === nom);
    if (i !== -1) cache.services[i] = data;
    if (data.actif) PRIX[nom] = data.prix; else delete PRIX[nom];
    return data;
  },

  async addService(nom, categorie, prix) {
    const next = (cache.services.reduce((m, s) => Math.max(m, s.ordre), 0) || 0) + 10;
    const { data, error } = await sb.from('services')
      .insert({ nom, categorie, prix, ordre: next, actif: true }).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.services.push(data);
    cache.services.sort((a, b) => a.ordre - b.ordre);
    PRIX[nom] = prix;
    return data;
  },

  async toggleService(nom, actif) {
    const { data, error } = await sb.from('services')
      .update({ actif, updated_at: new Date().toISOString() })
      .eq('nom', nom).select().maybeSingle();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    if (!data) return null;
    const i = cache.services.findIndex(s => s.nom === nom);
    if (i !== -1) cache.services[i] = data;
    if (actif) PRIX[nom] = data.prix; else delete PRIX[nom];
    return data;
  },

  async renameService(oldNom, newNom) {
    if (oldNom === newNom) return false;
    if (cache.services.some(s => s.nom.toLowerCase() === newNom.toLowerCase())) {
      toast('Un service porte déjà ce nom', '#e53935'); return false;
    }
    const { error: e1 } = await sb.from('services')
      .update({ nom: newNom, updated_at: new Date().toISOString() }).eq('nom', oldNom);
    if (e1) { toast('Erreur : ' + e1.message, '#e53935'); return false; }
    const { error: e2 } = await sb.from('entrees').update({ type: newNom }).eq('type', oldNom);
    if (e2) { toast('Renommé en base mais entrées non propagées : ' + e2.message, '#e53935'); }
    const { error: e3 } = await sb.from('reservations').update({ type_lavage: newNom }).eq('type_lavage', oldNom);
    if (e3) { toast('Renommé mais résa non propagées : ' + e3.message, '#e53935'); }
    await DB.loadAll();
    return true;
  },

  async renameVehiculeType(oldNom, newNom) {
    if (oldNom === newNom) return false;
    if (cache.vehiculeTypes.some(v => v.nom.toLowerCase() === newNom.toLowerCase())) {
      toast('Un type porte déjà ce nom', '#e53935'); return false;
    }
    const { error: e1 } = await sb.from('vehicule_types')
      .update({ nom: newNom, updated_at: new Date().toISOString() }).eq('nom', oldNom);
    if (e1) { toast('Erreur : ' + e1.message, '#e53935'); return false; }
    const { error: e2 } = await sb.from('entrees').update({ vehicule: newNom }).eq('vehicule', oldNom);
    if (e2) { toast('Renommé en base mais entrées non propagées : ' + e2.message, '#e53935'); }
    const { error: e3 } = await sb.from('reservations').update({ vehicule_type: newNom }).eq('vehicule_type', oldNom);
    if (e3) { toast('Renommé mais résa non propagées : ' + e3.message, '#e53935'); }
    await DB.loadAll();
    return true;
  },

  async delService(nom) {
    const { error } = await sb.from('services').delete().eq('nom', nom);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.services = cache.services.filter(s => s.nom !== nom);
    delete PRIX[nom];
    return true;
  },

  async setServiceCategorie(nom, categorie) {
    const { data, error } = await sb.from('services')
      .update({ categorie, updated_at: new Date().toISOString() })
      .eq('nom', nom).select().maybeSingle();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    if (!data) return null;
    const i = cache.services.findIndex(s => s.nom === nom);
    if (i !== -1) cache.services[i] = data;
    return data;
  },

  async updateSortie(id, row) {
    const { data, error } = await sb.from('sorties').update(row).eq('id', id).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    const i = cache.sorties.findIndex(s => s.id === id);
    if (i !== -1) cache.sorties[i] = data;
    return data;
  },

  // ===== Clients & véhicules =====
  getClients:   () => cache.clients,
  getVehicules: () => cache.vehicules,

  async loadClients() {
    const [{ data: c, error: ce }, { data: v, error: ve }] = await Promise.all([
      sb.from('clients').select('*').order('nom', { ascending: true }),
      sb.from('vehicules').select('*'),
    ]);
    if (ce) console.error('clients:', ce);
    if (ve) console.error('vehicules:', ve);
    cache.clients = c || [];
    cache.vehicules = v || [];
    cache.clientsLoaded = true;
  },

  async addClient(row) {
    const { data, error } = await sb.from('clients').insert(row).select().single();
    if (error) {
      toast(error.code === '23505' ? 'Ce numéro de téléphone est déjà attribué à un client' : 'Erreur : ' + error.message, '#e53935');
      return null;
    }
    cache.clients.push(data);
    cache.clients.sort((a, b) => a.nom.localeCompare(b.nom));
    return data;
  },

  async updateClient(id, row) {
    const { data, error } = await sb.from('clients').update(row).eq('id', id).select().single();
    if (error) {
      toast(error.code === '23505' ? 'Ce numéro de téléphone est déjà attribué à un client' : 'Erreur : ' + error.message, '#e53935');
      return null;
    }
    const i = cache.clients.findIndex(c => c.id === id);
    if (i !== -1) cache.clients[i] = data;
    return data;
  },

  async delClient(id) {
    const { error } = await sb.from('clients').delete().eq('id', id);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.clients = cache.clients.filter(c => c.id !== id);
    cache.vehicules = cache.vehicules.filter(v => v.client_id !== id);
    return true;
  },

  async addVehicule(row) {
    const { data, error } = await sb.from('vehicules').insert(row).select().single();
    if (error) {
      if (error.code === '23505') {
        // plaque déjà prise — on essaie d'identifier le client propriétaire
        const { data: existing } = await sb
          .from('vehicules')
          .select('clients(nom)')
          .eq('plaque', row.plaque)
          .maybeSingle();
        const owner = existing?.clients?.nom;
        toast(owner
          ? `Plaque ${row.plaque} déjà rattachée à : ${owner}`
          : `Plaque ${row.plaque} déjà enregistrée`, '#e53935');
      } else {
        toast('Erreur : ' + error.message, '#e53935');
      }
      return null;
    }
    cache.vehicules.push(data);
    return data;
  },

  async delVehicule(id) {
    const { error } = await sb.from('vehicules').delete().eq('id', id);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
    cache.vehicules = cache.vehicules.filter(v => v.id !== id);
    return true;
  },
};

// ===== NAVIGATION =====
const sidebar = document.getElementById('sidebar');
const overlay = document.getElementById('sidebarOverlay');
const menuToggle = document.getElementById('menuToggle');

function closeSidebar() {
  sidebar.classList.remove('open');
  overlay.classList.remove('show');
}
function openSidebar() {
  sidebar.classList.add('open');
  overlay.classList.add('show');
}
menuToggle.addEventListener('click', () => {
  sidebar.classList.contains('open') ? closeSidebar() : openSidebar();
});
overlay.addEventListener('click', closeSidebar);

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('page-' + btn.dataset.page).classList.add('active');
    if (btn.dataset.page === 'dashboard') { renderDashboard(); refreshDashResaToday(); }
    if (btn.dataset.page === 'entrees') renderEntreesList();
    if (btn.dataset.page === 'sorties') renderSortiesList();
    if (btn.dataset.page === 'clients') renderClientsPage();
    if (btn.dataset.page === 'reservations') renderReservationsPage();
    if (btn.dataset.page === 'tarifs') renderTarifsPage();
    if (btn.dataset.page === 'vehicules') renderVehiculesPage();
    if (btn.dataset.page === 'utilisateurs') renderUsersPage();
    closeSidebar();
  });
});

// ===== RAFRAÎCHISSEMENT AUTOMATIQUE =====
// Les données vivent dans un cache local : on les re-synchronise
// périodiquement pour refléter les changements faits ailleurs (autre
// agent, réservation en ligne, etc.) sans recharger la page à la main.
const AUTO_REFRESH_SECONDS = 30; // intervalle ajustable
let autoRefreshing = false;

// Re-rend la page actuellement affichée (depuis le cache fraîchement chargé)
function renderActivePage() {
  const active = document.querySelector('.page.active');
  if (!active) return;
  switch (active.id) {
    case 'page-dashboard':
      // On ne redessine les graphiques que si les chiffres ont changé
      if (dashSignature() !== lastDashSig) renderDashboard();
      refreshDashResaToday(); // widget léger (sans graphe), toujours à jour
      break;
    case 'page-entrees':       renderEntreesList(); break;
    case 'page-sorties':       renderSortiesList(); break;
    case 'page-clients':       renderClientsPage(); break;
    case 'page-reservations':  renderReservationsList(); break;
    case 'page-tarifs':        renderTarifsPage(); break;
    case 'page-vehicules':     renderVehiculesPage(); break;
    case 'page-utilisateurs':  renderUsersPage(); break;
  }
}

async function autoRefresh() {
  if (autoRefreshing) return;                                    // déjà en cours
  if (!session.user) return;                                     // pas connecté
  if (document.hidden) return;                                   // onglet en arrière-plan
  if (document.querySelector('.modal-overlay.show')) return;     // saisie dans une fenêtre
  const ae = document.activeElement;                             // saisie en cours sur un champ
  if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
  autoRefreshing = true;
  try {
    await DB.loadAll();
    if (cache.clientsLoaded) await DB.loadClients();
    renderActivePage();
    updateResaBadge();
  } catch (e) {
    console.error('Auto-refresh:', e);
  } finally {
    autoRefreshing = false;
  }
}

setInterval(autoRefresh, AUTO_REFRESH_SECONDS * 1000);
// Re-synchronise aussi dès qu'on revient sur l'onglet
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoRefresh(); });

// ===== Alerte nouvelle réservation en ligne =====
// Détecte les résas faites par les clients via le lien public (source='public')
// et prévient l'équipe : bip sonore + bandeau in-app + notification bureau.
// Le poll est indépendant de autoRefresh pour fonctionner même onglet caché.
const ONLINE_SEEN_KEY = 'uw_seen_online_resa';
let onlineSeen     = null;   // Set des IDs déjà vus (null = pas encore initialisé)
let onlineAudioCtx = null;   // débloqué au 1er geste (politique d'autoplay)
let onlineAlertTimer = null;

function loadOnlineSeen() {
  try {
    const raw = localStorage.getItem(ONLINE_SEEN_KEY);
    return raw ? new Set(JSON.parse(raw)) : null;
  } catch { return null; }
}
function saveOnlineSeen() {
  try { localStorage.setItem(ONLINE_SEEN_KEY, JSON.stringify([...onlineSeen])); } catch {}
}

// L'audio doit être débloqué par un geste utilisateur avant de pouvoir sonner.
function unlockOnlineAudio() {
  if (onlineAudioCtx) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx) onlineAudioCtx = new Ctx();
  } catch {}
}
document.addEventListener('click',   unlockOnlineAudio, { once: true });
document.addEventListener('keydown', unlockOnlineAudio, { once: true });

function playOnlineBeep() {
  if (!onlineAudioCtx) return;
  try {
    if (onlineAudioCtx.state === 'suspended') onlineAudioCtx.resume();
    const now = onlineAudioCtx.currentTime;
    // Petit « ding-dong » de deux notes
    [[880, 0], [1175, 0.18]].forEach(([freq, t]) => {
      const osc  = onlineAudioCtx.createOscillator();
      const gain = onlineAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.35);
      osc.connect(gain).connect(onlineAudioCtx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.4);
    });
  } catch {}
}

function notifyOnline(title, body) {
  try {
    if (('Notification' in window) && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'uw-online-resa', renotify: true });
    }
  } catch {}
}

async function checkNewOnlineBookings() {
  if (!session.user) return;
  const { data, error } = await sb.from('reservations')
    .select('id, client_nom, date_prevue, heure_prevue')
    .eq('source', 'public')
    .eq('statut', 'prevu');
  if (error || !data) return;

  if (onlineSeen === null) onlineSeen = loadOnlineSeen();
  // Tout premier passage (aucun historique local) : on mémorise sans alerter,
  // sinon on notifierait toutes les résas déjà existantes.
  if (onlineSeen === null) {
    onlineSeen = new Set(data.map(r => r.id));
    saveOnlineSeen();
    return;
  }

  const nouvelles = data.filter(r => !onlineSeen.has(r.id));
  // On borne l'ensemble vu aux résas en ligne encore "prévu" (évite qu'il enfle).
  onlineSeen = new Set(data.map(r => r.id));
  saveOnlineSeen();
  if (nouvelles.length === 0) return;

  playOnlineBeep();
  if (nouvelles.length === 1) {
    const r = nouvelles[0];
    const heure = (r.heure_prevue || '').slice(0, 5);
    const qui   = r.client_nom || 'Client';
    toast(`🌐 Nouvelle réservation en ligne : ${qui} le ${fmtDate(r.date_prevue)} à ${heure}`, '#1557b0');
    notifyOnline('Nouvelle réservation en ligne', `${qui} — ${fmtDate(r.date_prevue)} à ${heure}`);
  } else {
    toast(`🌐 ${nouvelles.length} nouvelles réservations en ligne`, '#1557b0');
    notifyOnline('Nouvelles réservations en ligne', `${nouvelles.length} réservations reçues`);
  }

  // Onglet visible : on resynchronise l'UI (badge, tableau, tableau de bord).
  if (!document.hidden) autoRefresh();
}

function startOnlineAlerts() {
  try {
    if (('Notification' in window) && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  } catch {}
  checkNewOnlineBookings();
  if (onlineAlertTimer) clearInterval(onlineAlertTimer);
  onlineAlertTimer = setInterval(checkNewOnlineBookings, AUTO_REFRESH_SECONDS * 1000);
}

// ===== TOAST =====
function toast(msg, color = '#0d9e6e') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.background = color;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
}

// ===== FORMAT =====
const fmt = (n) => Number(n).toLocaleString('fr-FR') + ' FCFA';
const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR');

// ===== PAGINATION (10 enregistrements par page) =====
const PER_PAGE = 10;
const pagers = {}; // page courante par liste (ex. pagers.clients)

// Renvoie la tranche de la page courante (clampe la page si hors limites)
function paginate(items, key) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  let page = Math.min(Math.max(pagers[key] || 1, 1), totalPages);
  pagers[key] = page;
  const start = (page - 1) * PER_PAGE;
  return { slice: items.slice(start, start + PER_PAGE), page, totalPages, total };
}

// Affiche les contrôles « ‹ Précédent · X–Y sur N · Suivant › »
function renderPager(containerId, key, total, page, totalPages, onChange) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (total <= PER_PAGE) { el.innerHTML = ''; return; }
  const from = (page - 1) * PER_PAGE + 1;
  const to = Math.min(page * PER_PAGE, total);
  el.innerHTML =
    `<button type="button" class="pager-btn" data-act="prev" ${page <= 1 ? 'disabled' : ''}>‹ Précédent</button>` +
    `<span class="pager-info">${from}–${to} sur ${total}</span>` +
    `<button type="button" class="pager-btn" data-act="next" ${page >= totalPages ? 'disabled' : ''}>Suivant ›</button>`;
  el.querySelector('[data-act="prev"]').addEventListener('click', () => { pagers[key] = Math.max(1, page - 1); onChange(); });
  el.querySelector('[data-act="next"]').addEventListener('click', () => { pagers[key] = Math.min(totalPages, page + 1); onChange(); });
}

// Wrapper pour réinitialiser à la page 1 (changement de filtre) puis rendre
function withPageReset(key, render) {
  return () => { pagers[key] = 1; render(); };
}

// ===== PERIOD FILTER =====
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(preset) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (preset === 'today') return { from: ymd(today), to: ymd(today) };
  if (preset === 'week') {
    // Lundi = début de semaine, fin = aujourd'hui
    const daysSinceMonday = (today.getDay() + 6) % 7;
    const start = new Date(today); start.setDate(today.getDate() - daysSinceMonday);
    return { from: ymd(start), to: ymd(today) };
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: ymd(start), to: ymd(end) };
  }
  if (preset === 'year') {
    return { from: `${now.getFullYear()}-01-01`, to: `${now.getFullYear()}-12-31` };
  }
  return { from: '', to: '' };
}

function inDashRange(dateStr) {
  const from = document.getElementById('dashFrom').value;
  const to = document.getElementById('dashTo').value;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

function inToday(dateStr) {
  const t = ymd(new Date());
  return dateStr === t;
}

// ===== DASHBOARD =====
let chartCA = null, chartTypes = null, chartCategories = null, chartVehicules = null, chartHeures = null, chartServiceCat = null;

// Signature des données du dashboard : on ne redessine les graphiques
// (lourds) que si elle a changé, pour éviter tout clignotement à chaque
// rafraîchissement automatique.
let lastDashSig = '';
function dashSignature() {
  const e = cache.entrees.map(x => `${x.id}:${x.date}:${x.montant}:${x.type}:${x.vehicule}`).join(',');
  const s = cache.sorties.map(x => `${x.id}:${x.date}:${x.montant}:${x.categorie}`).join(',');
  return e + '||' + s;
}

// Catégorie d'un service (lookup dans cache.services, sinon 'Autre')
const serviceCategory = (type) => {
  const s = cache.services.find(x => x.nom === type);
  return s ? s.categorie : 'Autre';
};

function getDashPeriodType() {
  // Pour le groupement du graphique CA vs Dépenses
  const from = document.getElementById('dashFrom').value;
  const to = document.getElementById('dashTo').value;
  if (!from && !to) return 'all';
  if (from === to) return 'today';
  const diff = (new Date(to) - new Date(from)) / 86400000;
  if (diff <= 7) return 'week';
  if (diff <= 31) return 'month';
  return 'year';
}

function renderDashboard() {
  lastDashSig = dashSignature();
  const entrees = DB.getEntrees().filter(e => inDashRange(e.date));
  const sorties = DB.getSorties().filter(s => inDashRange(s.date));
  const period = getDashPeriodType();

  const ca = entrees.reduce((a, e) => a + Number(e.montant), 0);
  const dep = sorties.reduce((a, s) => a + Number(s.montant), 0);
  const ben = ca - dep;
  const marge = ca > 0 ? Math.round((ben / ca) * 100) : 0;

  const todayEntrees = DB.getEntrees().filter(e => inToday(e.date));
  const caToday = todayEntrees.reduce((a, e) => a + Number(e.montant), 0);

  const panier = entrees.length > 0 ? Math.round(ca / entrees.length) : 0;

  // Meilleur jour
  const caByDay = {};
  entrees.forEach(e => { caByDay[e.date] = (caByDay[e.date] || 0) + Number(e.montant); });
  let bestDay = null, bestDayCA = 0;
  Object.entries(caByDay).forEach(([d, v]) => { if (v > bestDayCA) { bestDay = d; bestDayCA = v; } });

  document.getElementById('kpi-ca').textContent = fmt(ca);
  document.getElementById('kpi-ca-count').textContent = entrees.length + ' lavage' + (entrees.length > 1 ? 's' : '');
  document.getElementById('kpi-depenses').textContent = fmt(dep);
  document.getElementById('kpi-dep-count').textContent = sorties.length + ' opération' + (sorties.length > 1 ? 's' : '');
  document.getElementById('kpi-benefice').textContent = fmt(ben);
  document.getElementById('kpi-marge').textContent = 'Marge : ' + marge + '%';
  document.getElementById('kpi-today').textContent = todayEntrees.length;
  document.getElementById('kpi-today-ca').textContent = fmt(caToday);
  document.getElementById('kpi-panier').textContent = fmt(panier);
  document.getElementById('kpi-bestday').textContent = bestDay ? fmtDate(bestDay) : '—';
  document.getElementById('kpi-bestday-ca').textContent = fmt(bestDayCA);

  renderChartCA(entrees, sorties, period);
  renderChartTypes(entrees);
  renderChartServiceCat(entrees);
  renderChartCategories(sorties);
  renderChartVehicules(entrees);
  renderChartHeures(entrees);
  renderRecentTable();
}

function renderChartServiceCat(entrees) {
  const ctx = document.getElementById('chartServiceCat').getContext('2d');
  if (chartServiceCat) chartServiceCat.destroy();

  const cats = { 'Lavage': 0, 'Detailing': 0, 'Entretien': 0, 'Autre': 0 };
  const ca   = { 'Lavage': 0, 'Detailing': 0, 'Entretien': 0, 'Autre': 0 };
  entrees.forEach(e => {
    const c = serviceCategory(e.type);
    cats[c] = (cats[c] || 0) + 1;
    ca[c]   = (ca[c]   || 0) + Number(e.montant || 0);
  });
  // On retire les catégories à zéro pour ne pas polluer
  const labels = Object.keys(cats).filter(k => cats[k] > 0);
  if (labels.length === 0) return;

  const colors = { 'Lavage': '#1a73e8', 'Detailing': '#8b5cf6', 'Entretien': '#f59e0b', 'Autre': '#94a3b8' };
  chartServiceCat = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Nombre',
          data: labels.map(k => cats[k]),
          backgroundColor: labels.map(k => colors[k]),
          yAxisID: 'y',
        },
        {
          label: 'CA (FCFA)',
          data: labels.map(k => ca[k]),
          backgroundColor: labels.map(k => colors[k] + '66'),
          yAxisID: 'y1',
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: {
        y:  { beginAtZero: true, position: 'left',  title: { display: true, text: 'Nombre' } },
        y1: { beginAtZero: true, position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'CA' } },
      },
    },
  });
}

function periodKey(dateStr, period) {
  const d = new Date(dateStr);
  // On groupe par jour (today/week/month), sinon par mois. Pas de découpage
  // horaire : l'heure n'est pas renseignée sur les sorties, ce qui rendrait
  // le graphe CA vs Dépenses incohérent.
  if (period === 'today' || period === 'week' || period === 'month') {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  }
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

function renderChartCA(entrees, sorties, period) {
  const ctx = document.getElementById('chartCA').getContext('2d');
  if (chartCA) chartCA.destroy();

  const caByKey = {};
  entrees.forEach(e => {
    const key = periodKey(e.date, period);
    caByKey[key] = (caByKey[key] || 0) + Number(e.montant);
  });
  const depByKey = {};
  sorties.forEach(s => {
    const key = periodKey(s.date, period);
    depByKey[key] = (depByKey[key] || 0) + Number(s.montant);
  });

  const labels = [...new Set([...Object.keys(caByKey), ...Object.keys(depByKey)])];
  const caValues = labels.map(k => caByKey[k] || 0);
  const depValues = labels.map(k => depByKey[k] || 0);

  chartCA = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'CA', data: caValues, backgroundColor: '#1a73e8', borderRadius: 6 },
        { label: 'Dépenses', data: depValues, backgroundColor: '#e53935', borderRadius: 6 },
      ]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => v.toLocaleString('fr-FR') } } }
    }
  });
}

function renderChartTypes(entrees) {
  const ctx = document.getElementById('chartTypes').getContext('2d');
  if (chartTypes) chartTypes.destroy();

  const types = {};
  entrees.forEach(e => { types[e.type] = (types[e.type] || 0) + 1; });
  if (Object.keys(types).length === 0) return;

  // Top 5 + regroupement "Autres"
  const sorted = Object.entries(types).sort((a, b) => b[1] - a[1]);
  const top    = sorted.slice(0, 5);
  const rest   = sorted.slice(5);
  const labels = top.map(([k]) => k);
  const data   = top.map(([, v]) => v);
  if (rest.length > 0) {
    labels.push('Autres (' + rest.length + ')');
    data.push(rest.reduce((a, [, v]) => a + v, 0));
  }

  chartTypes = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: ['#1a73e8','#0d9e6e','#f59e0b','#e53935','#8b5cf6','#94a3b8'],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 } } } }
    }
  });
}

function renderChartCategories(sorties) {
  const ctx = document.getElementById('chartCategories').getContext('2d');
  if (chartCategories) chartCategories.destroy();

  const cats = {};
  sorties.forEach(s => { cats[s.categorie] = (cats[s.categorie] || 0) + Number(s.montant); });
  const labels = Object.keys(cats);
  if (labels.length === 0) return;

  chartCategories = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: Object.values(cats),
        backgroundColor: ['#e53935','#f59e0b','#8b5cf6','#14b8a6','#0d9e6e','#1a73e8','#64748b'],
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } },
        tooltip: { callbacks: { label: (c) => c.label + ' : ' + fmt(c.parsed) } }
      }
    }
  });
}

function renderChartVehicules(entrees) {
  const ctx = document.getElementById('chartVehicules').getContext('2d');
  if (chartVehicules) chartVehicules.destroy();

  const vehs = {};
  entrees.forEach(e => { vehs[e.vehicule] = (vehs[e.vehicule] || 0) + 1; });
  const labels = Object.keys(vehs);
  if (labels.length === 0) return;

  chartVehicules = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Nombre',
        data: Object.values(vehs),
        backgroundColor: '#1a73e8',
        borderRadius: 6,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderChartHeures(entrees) {
  const ctx = document.getElementById('chartHeures').getContext('2d');
  if (chartHeures) chartHeures.destroy();

  const hours = Array.from({ length: 24 }, (_, i) => 0);
  entrees.forEach(e => {
    if (!e.heure) return;
    const h = parseInt(e.heure.slice(0, 2), 10);
    if (!isNaN(h)) hours[h]++;
  });

  // On n'affiche que les heures d'ouverture probable (6h-22h)
  const start = 6, end = 22;
  const labels = [];
  const data = [];
  for (let h = start; h <= end; h++) { labels.push(h + 'h'); data.push(hours[h]); }

  chartHeures = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Lavages',
        data,
        backgroundColor: '#0d9e6e',
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderRecentTable() {
  const all = [
    ...DB.getEntrees().map(e => ({ ...e, kind: 'entree' })),
    ...DB.getSorties().map(s => ({ ...s, kind: 'sortie' }))
  ].sort((a, b) => new Date(b.date + 'T' + (b.heure || '00:00')) - new Date(a.date + 'T' + (a.heure || '00:00'))).slice(0, 8);

  const tbody = document.getElementById('recentTable');
  tbody.innerHTML = all.map(op => `
    <tr>
      <td>${fmtDate(op.date)}</td>
      <td><span class="badge badge-${op.kind}">${op.kind === 'entree' ? 'Lavage' : 'Dépense'}</span></td>
      <td>${op.kind === 'entree' ? (op.vehicule + ' – ' + op.type) : (op.categorie + (op.description ? ' – ' + op.description : ''))}</td>
      <td class="montant-${op.kind}">${op.kind === 'entree' ? '+' : '-'}${fmt(op.montant)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4" class="empty-state">Aucune opération</td></tr>';
}

function applyPreset(preset) {
  const { from, to } = presetRange(preset);
  document.getElementById('dashFrom').value = from;
  document.getElementById('dashTo').value = to;
  renderDashboard();
}

document.getElementById('dashPreset').addEventListener('change', (ev) => {
  if (ev.target.value === 'custom') return;
  applyPreset(ev.target.value);
});

['dashFrom', 'dashTo'].forEach(id => {
  document.getElementById(id).addEventListener('change', () => {
    document.getElementById('dashPreset').value = 'custom';
    renderDashboard();
  });
});

// Initialiser avec le preset par défaut (mois en cours)
applyPreset('month');

// ===== ENTREES =====
function setDefaultDateTime() {
  const now = new Date();
  const today = ymd(now);
  const eDate = document.getElementById('e-date');
  eDate.value = today;
  eDate.min = today;
  document.getElementById('e-heure').value = now.toTimeString().slice(0, 5);
  document.getElementById('s-date').value = today;
}
setDefaultDateTime();

// Anti double-soumission : désactive le bouton + verrou "busy" pendant
// l'appel réseau, et restaure l'état même en cas d'erreur ou de retour anticipé.
function guardedSubmit(form, handler) {
  if (!form) return;
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (form.dataset.busy === '1') return;           // clic multiple ignoré
    form.dataset.busy = '1';
    const btn = form.querySelector('button[type="submit"]');
    const label = btn ? btn.innerHTML : null;
    if (btn) { btn.disabled = true; btn.innerHTML = 'Enregistrement…'; }
    try {
      await handler(ev);
    } catch (e) {
      console.error(e);
      toast('Erreur inattendue — réessayez', '#e53935');
    } finally {
      form.dataset.busy = '0';
      if (btn) { btn.disabled = false; btn.innerHTML = label; }
    }
  });
}

guardedSubmit(document.getElementById('formEntree'), async (ev) => {
  ev.preventDefault();

  // Empêcher l'enregistrement à une date antérieure (une heure passée le
  // jour même reste autorisée : on saisit parfois un lavage après coup).
  const dateVal  = document.getElementById('e-date').value;
  const now = new Date();
  const today = ymd(now);
  if (dateVal < today) {
    toast('Date antérieure interdite', '#e53935');
    return;
  }

  const telephone = (document.getElementById('e-telephone').value || '').trim();
  let clientId   = document.getElementById('e-client-id').value || null;
  let vehiculeId = document.getElementById('e-vehicule-id').value || null;

  // Si on a un téléphone mais pas de client rattaché, on cherche en base
  // (au cas où le cache local ne soit pas à jour)
  if (telephone && !clientId) {
    const { data } = await sb.from('clients').select('id').eq('telephone', telephone).limit(1);
    if (data && data[0]) clientId = data[0].id;
  }

  const row = {
    date: document.getElementById('e-date').value,
    heure: document.getElementById('e-heure').value,
    vehicule: document.getElementById('e-vehicule').value,
    type: document.getElementById('e-type').value,
    montant: Number(document.getElementById('e-montant').value),
    telephone: telephone || null,
    notes: document.getElementById('e-notes').value || null,
    client_id: clientId,
    vehicule_id: vehiculeId,
  };
  const saved = await DB.addEntree(row);
  if (!saved) return;
  ev.target.reset();
  setDefaultDateTime();
  document.getElementById('e-client-id').value = '';
  document.getElementById('e-vehicule-id').value = '';
  document.getElementById('e-client-hint').innerHTML = '';
  pagers.entrees = 1;
  renderEntreesList();
  toast('Lavage enregistré !');
});

// Pré-remplissage du montant depuis le catalogue de tarifs.
// L'utilisateur peut toujours écraser la valeur après coup.
function bindPrixAuto(typeSelectId, montantInputId) {
  const sel = document.getElementById(typeSelectId);
  const inp = document.getElementById(montantInputId);
  if (!sel || !inp) return;
  sel.addEventListener('change', () => {
    const prix = PRIX[sel.value];
    if (prix != null && prix > 0) inp.value = prix;
  });
}
bindPrixAuto('e-type',  'e-montant');
bindPrixAuto('ed-type', 'ed-montant');
bindPrixAuto('r-type',  'r-montant');

// Filtre les non-chiffres en temps réel sur les champs téléphone.
// Enregistré AVANT les autres listeners pour qu'ils lisent une valeur déjà nettoyée.
function bindDigitsOnly(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('input', (ev) => {
    const cleaned = ev.target.value.replace(/\D+/g, '');
    if (cleaned !== ev.target.value) ev.target.value = cleaned;
  });
}
['login-telephone','e-telephone','el-tel','u-telephone','ed-telephone','cl-telephone','r-client-telephone']
  .forEach(bindDigitsOnly);

// Auto-rattachement par téléphone (debounced)
let telLookupTimer = null;
document.getElementById('e-telephone').addEventListener('input', (ev) => {
  clearTimeout(telLookupTimer);
  const hint = document.getElementById('e-client-hint');
  const clientHidden = document.getElementById('e-client-id');
  const vehHidden = document.getElementById('e-vehicule-id');
  const telephone = ev.target.value.trim();
  clientHidden.value = '';
  vehHidden.value = '';
  hint.innerHTML = '';
  if (telephone.length < 4) return;
  telLookupTimer = setTimeout(async () => {
    const { data } = await sb
      .from('clients')
      .select('id, nom, type, telephone, vehicules(id, plaque)')
      .eq('telephone', telephone)
      .limit(1);
    const c = data && data[0];
    if (c) {
      clientHidden.value = c.id;
      // Si le client n'a qu'un seul véhicule, on le rattache aussi
      const vehs = c.vehicules || [];
      if (vehs.length === 1) vehHidden.value = vehs[0].id;
      const plaqueInfo = vehs.length === 1 && vehs[0].plaque ? ' · ' + vehs[0].plaque : '';
      hint.innerHTML = `<span class="hint-ok">✓ Client connu : <b>${escapeHtml(c.nom)}</b>${plaqueInfo}</span>`;
    } else {
      hint.innerHTML = `<span class="hint-new">Numéro inconnu — sera enregistré sans fiche client. <a href="#" id="hint-create-client">Créer une fiche ?</a></span>`;
      document.getElementById('hint-create-client').addEventListener('click', (e) => {
        e.preventDefault();
        openClientModal(null, { telephone });
      });
    }
  }, 350);
});

function renderEntreesList() {
  const from = document.getElementById('el-from').value;
  const to   = document.getElementById('el-to').value;
  const tel  = document.getElementById('el-tel').value.trim().toLowerCase();
  let list = DB.getEntrees();
  if (from) list = list.filter(e => e.date >= from);
  if (to)   list = list.filter(e => e.date <= to);
  if (tel)  list = list.filter(e => (e.telephone || '').toLowerCase().includes(tel));
  const { slice, page, totalPages, total } = paginate(list, 'entrees');
  const tbody = document.getElementById('entreesList');
  const canDelete = isAdmin();
  tbody.innerHTML = slice.map(e => `
    <tr>
      <td>${fmtDate(e.date)} ${e.heure || ''}</td>
      <td>${e.vehicule}</td>
      <td>${e.type}</td>
      <td>${escapeHtml(e.telephone || '—')}</td>
      <td class="montant-entree">+${fmt(e.montant)}</td>
      <td>${canDelete ? `<button class="btn-edit" onclick="openEditEntree('${e.id}')" title="Modifier">✎</button><button class="btn-del" onclick="delEntree('${e.id}')" title="Supprimer">✕</button>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="empty-state">Aucun lavage enregistré</td></tr>';
  renderPager('entreesPager', 'entrees', total, page, totalPages, renderEntreesList);
}

['el-from', 'el-to', 'el-tel'].forEach(id =>
  document.getElementById(id).addEventListener('input', withPageReset('entrees', renderEntreesList)));
document.getElementById('el-reset').addEventListener('click', () => {
  document.getElementById('el-from').value = '';
  document.getElementById('el-to').value = '';
  document.getElementById('el-tel').value = '';
  pagers.entrees = 1;
  renderEntreesList();
});

async function delEntree(id) {
  if (!confirm('Supprimer cette entrée ?')) return;
  const ok = await DB.delEntree(id);
  if (!ok) return;
  renderEntreesList();
  toast('Entrée supprimée', '#e53935');
}

// ===== SORTIES =====
guardedSubmit(document.getElementById('formSortie'), async (ev) => {
  ev.preventDefault();
  const row = {
    date: document.getElementById('s-date').value,
    categorie: document.getElementById('s-categorie').value,
    montant: Number(document.getElementById('s-montant').value),
    description: document.getElementById('s-description').value || null,
  };
  const saved = await DB.addSortie(row);
  if (!saved) return;
  ev.target.reset();
  setDefaultDateTime();
  pagers.sorties = 1;
  renderSortiesList();
  toast('Dépense enregistrée !', '#f59e0b');
});

function renderSortiesList() {
  const from = document.getElementById('sl-from').value;
  const to   = document.getElementById('sl-to').value;
  let list = DB.getSorties();
  if (from) list = list.filter(s => s.date >= from);
  if (to)   list = list.filter(s => s.date <= to);
  const { slice, page, totalPages, total } = paginate(list, 'sorties');
  const tbody = document.getElementById('sortiesList');
  tbody.innerHTML = slice.map(s => `
    <tr>
      <td>${fmtDate(s.date)}</td>
      <td>${s.categorie}</td>
      <td>${s.description || '—'}</td>
      <td class="montant-sortie">-${fmt(s.montant)}</td>
      <td><button class="btn-edit" onclick="openEditSortie('${s.id}')" title="Modifier">✎</button><button class="btn-del" onclick="delSortie('${s.id}')" title="Supprimer">✕</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-state">Aucune dépense enregistrée</td></tr>';
  renderPager('sortiesPager', 'sorties', total, page, totalPages, renderSortiesList);
}

['sl-from', 'sl-to'].forEach(id =>
  document.getElementById(id).addEventListener('input', withPageReset('sorties', renderSortiesList)));
document.getElementById('sl-reset').addEventListener('click', () => {
  document.getElementById('sl-from').value = '';
  document.getElementById('sl-to').value = '';
  pagers.sorties = 1;
  renderSortiesList();
});

async function delSortie(id) {
  if (!confirm('Supprimer cette dépense ?')) return;
  const ok = await DB.delSortie(id);
  if (!ok) return;
  renderSortiesList();
  toast('Dépense supprimée', '#e53935');
}

// ===== MODAL ÉDITION =====
const editModal = document.getElementById('editModal');
const formEditEntree = document.getElementById('formEditEntree');
const formEditSortie = document.getElementById('formEditSortie');

function closeEditModal() {
  editModal.classList.remove('show');
  formEditEntree.classList.remove('active');
  formEditSortie.classList.remove('active');
}

document.getElementById('editClose').addEventListener('click', closeEditModal);
editModal.addEventListener('click', (ev) => { if (ev.target === editModal) closeEditModal(); });
document.querySelectorAll('[data-modal-cancel]').forEach(b => b.addEventListener('click', closeEditModal));
document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && editModal.classList.contains('show')) closeEditModal(); });

function openEditEntree(id) {
  const e = DB.getEntrees().find(x => x.id === id);
  if (!e) return;
  document.getElementById('editTitle').textContent = 'Modifier le lavage';
  document.getElementById('ed-id').value = e.id;
  document.getElementById('ed-date').value = e.date;
  document.getElementById('ed-heure').value = (e.heure || '').slice(0, 5);
  document.getElementById('ed-vehicule').value = e.vehicule;
  document.getElementById('ed-type').value = e.type;
  document.getElementById('ed-montant').value = e.montant;
  document.getElementById('ed-telephone').value = e.telephone || '';
  document.getElementById('ed-notes').value = e.notes || '';
  formEditSortie.classList.remove('active');
  formEditEntree.classList.add('active');
  editModal.classList.add('show');
}

function openEditSortie(id) {
  const s = DB.getSorties().find(x => x.id === id);
  if (!s) return;
  document.getElementById('editTitle').textContent = 'Modifier la dépense';
  document.getElementById('sd-id').value = s.id;
  document.getElementById('sd-date').value = s.date;
  document.getElementById('sd-categorie').value = s.categorie;
  document.getElementById('sd-montant').value = s.montant;
  document.getElementById('sd-description').value = s.description || '';
  formEditEntree.classList.remove('active');
  formEditSortie.classList.add('active');
  editModal.classList.add('show');
}

guardedSubmit(formEditEntree, async (ev) => {
  ev.preventDefault();
  const id = document.getElementById('ed-id').value;
  const row = {
    date: document.getElementById('ed-date').value,
    heure: document.getElementById('ed-heure').value,
    vehicule: document.getElementById('ed-vehicule').value,
    type: document.getElementById('ed-type').value,
    montant: Number(document.getElementById('ed-montant').value),
    telephone: document.getElementById('ed-telephone').value.trim() || null,
    notes: document.getElementById('ed-notes').value || null,
  };
  const saved = await DB.updateEntree(id, row);
  if (!saved) return;
  closeEditModal();
  renderEntreesList();
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  toast('Lavage mis à jour !');
});

guardedSubmit(formEditSortie, async (ev) => {
  ev.preventDefault();
  const id = document.getElementById('sd-id').value;
  const row = {
    date: document.getElementById('sd-date').value,
    categorie: document.getElementById('sd-categorie').value,
    montant: Number(document.getElementById('sd-montant').value),
    description: document.getElementById('sd-description').value || null,
  };
  const saved = await DB.updateSortie(id, row);
  if (!saved) return;
  closeEditModal();
  renderSortiesList();
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  toast('Dépense mise à jour !', '#f59e0b');
});

// ===== EXPORT CSV =====
function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCsv(filename, header, rows) {
  const content = header + '\n' + rows.join('\n');
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function periodTag(from, to) {
  return from || to ? `${from || 'debut'}_${to || 'fin'}` : 'export';
}

function getFilteredEntrees() {
  const from = document.getElementById('el-from').value;
  const to   = document.getElementById('el-to').value;
  const tel  = document.getElementById('el-tel').value.trim().toLowerCase();
  let list = DB.getEntrees();
  if (from) list = list.filter(e => e.date >= from);
  if (to)   list = list.filter(e => e.date <= to);
  if (tel)  list = list.filter(e => (e.telephone || '').toLowerCase().includes(tel));
  return { list, from, to };
}

function getFilteredSorties() {
  const from = document.getElementById('sl-from').value;
  const to   = document.getElementById('sl-to').value;
  let list = DB.getSorties();
  if (from) list = list.filter(s => s.date >= from);
  if (to)   list = list.filter(s => s.date <= to);
  return { list, from, to };
}

document.getElementById('el-export').addEventListener('click', () => {
  const { list, from, to } = getFilteredEntrees();
  if (list.length === 0) { toast('Aucune entrée à exporter', '#f59e0b'); return; }
  const header = ['Date', 'Heure', 'Type de service', 'Prestation', 'Téléphone', 'Montant (FCFA)', 'Notes'].join(',');
  const rows = list.map(e => [
    e.date,
    e.heure || '',
    csvEscape(e.vehicule),
    csvEscape(e.type),
    csvEscape(e.telephone || ''),
    e.montant,
    csvEscape(e.notes || ''),
  ].join(','));
  downloadCsv(`ultrawash_entrees_${periodTag(from, to)}.csv`, header, rows);
  toast('Export CSV téléchargé');
});

document.getElementById('sl-export').addEventListener('click', () => {
  const { list, from, to } = getFilteredSorties();
  if (list.length === 0) { toast('Aucune dépense à exporter', '#f59e0b'); return; }
  const header = ['Date', 'Catégorie', 'Description', 'Montant (FCFA)'].join(',');
  const rows = list.map(s => [
    s.date,
    csvEscape(s.categorie),
    csvEscape(s.description || ''),
    s.montant,
  ].join(','));
  downloadCsv(`ultrawash_sorties_${periodTag(from, to)}.csv`, header, rows);
  toast('Export CSV téléchargé');
});

// ===== TARIFS / SERVICES (admin patron) =====
function activeServiceCats() {
  return DB.getServiceCategories().filter(c => c.actif).slice().sort((a, b) => a.ordre - b.ordre);
}

function refreshServiceSelects() {
  const services = DB.getServices().filter(s => s.actif).slice().sort((a, b) => a.ordre - b.ordre);
  const cats = activeServiceCats();
  const html = cats.map(cat => {
    const items = services.filter(s => s.categorie === cat.nom);
    if (!items.length) return '';
    return `<optgroup label="${cat.icon || ''} ${escapeHtml(cat.nom)}">${
      items.map(s => `<option>${escapeHtml(s.nom)}</option>`).join('')
    }</optgroup>`;
  }).join('');
  ['e-type', 'ed-type', 'r-type'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = html;
    if (prev && services.some(s => s.nom === prev)) sel.value = prev;
    else if (services.some(s => s.nom === 'Lavage Standard')) sel.value = 'Lavage Standard';
  });
}

function renderTarifsPage() {
  const wrap = document.getElementById('tarifsAccordion');
  const services = DB.getServices().slice().sort((a, b) => a.ordre - b.ordre);
  const cats = activeServiceCats();

  if (!cats.length) {
    wrap.innerHTML = '<div class="tarif-row" style="color:#94a3b8;font-style:italic;padding:24px">Aucune catégorie. Crée-en une ci-dessus.</div>';
    return;
  }

  wrap.innerHTML = cats.map((cat, idx) => {
    const items = services.filter(s => s.categorie === cat.nom);
    const rows = items.map(s => {
      const catOpts = cats.map(c =>
        `<option value="${escapeHtml(c.nom)}" ${c.nom === s.categorie ? 'selected' : ''}>${c.icon || ''} ${escapeHtml(c.nom)}</option>`
      ).join('');
      return `
      <div class="tarif-row ${s.actif ? '' : 'inactive'}" data-nom="${escapeHtml(s.nom)}" draggable="true">
        <span class="tarif-handle" title="Glisser pour réordonner">⋮⋮</span>
        <div class="tarif-name">
          <span class="tarif-name-text">${escapeHtml(s.nom)}</span>${s.actif ? '' : ' <span class="badge-off">désactivé</span>'}
          <button type="button" class="tarif-rename" title="Renommer">✏️</button>
        </div>
        <div class="tarif-edit">
          <select class="tarif-cat-select" title="Changer de catégorie">${catOpts}</select>
          <input type="number" min="0" step="100" class="tarif-input" value="${s.prix}" />
          <span class="tarif-currency">FCFA</span>
          <button type="button" class="tarif-save" title="Enregistrer le prix">💾</button>
          <label class="switch" title="${s.actif ? 'Désactiver' : 'Activer'}">
            <input type="checkbox" class="tarif-toggle" ${s.actif ? 'checked' : ''} />
            <span class="slider"></span>
          </label>
          <button type="button" class="tarif-save svc-del" title="Supprimer définitivement" style="background:#dc2626">🗑️</button>
        </div>
      </div>`;
    }).join('') || '<div class="tarif-row" style="color:#94a3b8;font-style:italic">Aucun service dans cette catégorie</div>';
    return `
      <details class="tarif-cat" data-cat="${escapeHtml(cat.nom)}" ${idx === 0 ? 'open' : ''}>
        <summary>
          <span class="tarif-cat-icon">${cat.icon || ''}</span>
          <span class="tarif-cat-name">${escapeHtml(cat.nom)}</span>
          <span class="tarif-cat-count">${items.length}</span>
          <span class="cat-actions">
            <button type="button" class="cat-action cat-rename" title="Renommer la catégorie">✏️</button>
            <button type="button" class="cat-action cat-del" title="Supprimer la catégorie">🗑️</button>
          </span>
          <span class="tarif-cat-chevron">▾</span>
        </summary>
        <div class="tarif-list">${rows}</div>
      </details>`;
  }).join('');

  bindCategoryHeaderActions(wrap, 'service');

  wrap.querySelectorAll('.tarif-save').forEach(btn => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('.tarif-row');
      const nom = row.dataset.nom;
      const input = row.querySelector('.tarif-input');
      const prix = Number(input.value);
      if (!Number.isFinite(prix) || prix < 0) { toast('Prix invalide', '#e53935'); return; }
      btn.disabled = true; btn.classList.add('saving');
      const saved = await DB.updateService(nom, prix);
      btn.disabled = false; btn.classList.remove('saving');
      if (saved) {
        row.classList.add('saved');
        setTimeout(() => row.classList.remove('saved'), 1200);
        toast(`${nom} : ${fmt(prix)}`);
      }
    });
  });

  wrap.querySelectorAll('.tarif-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const row = chk.closest('.tarif-row');
      const nom = row.dataset.nom;
      const saved = await DB.toggleService(nom, chk.checked);
      if (saved) {
        toast(`${nom} ${chk.checked ? 'activé' : 'désactivé'}`);
        renderTarifsPage();
        refreshServiceSelects();
      } else {
        chk.checked = !chk.checked;
      }
    });
  });

  wrap.querySelectorAll('.tarif-rename').forEach(btn => {
    btn.addEventListener('click', async () => {
      const oldNom = btn.closest('.tarif-row').dataset.nom;
      const newNom = (prompt('Nouveau nom du service :', oldNom) || '').trim();
      if (!newNom || newNom === oldNom) return;
      const ok = await DB.renameService(oldNom, newNom);
      if (ok) {
        toast(`"${oldNom}" → "${newNom}"`);
        renderTarifsPage();
        refreshServiceSelects();
      }
    });
  });

  wrap.querySelectorAll('.svc-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nom = btn.closest('.tarif-row').dataset.nom;
      if (!confirm(`Supprimer définitivement "${nom}" ?\nL'historique des entrées et réservations conservera ce libellé. Préfère désactiver si tu veux pouvoir réutiliser ce service plus tard.`)) return;
      const ok = await DB.delService(nom);
      if (ok) {
        toast(`${nom} supprimé`);
        renderTarifsPage();
        refreshServiceSelects();
      }
    });
  });

  // Drag & drop pour réordonner les services (intra-catégorie)
  wrap.querySelectorAll('.tarif-list').forEach(list => {
    attachDragSort(list, async () => {
      const rows = wrap.querySelectorAll('.tarif-row[data-nom]');
      const updates = [...rows].map((r, i) => ({ nom: r.dataset.nom, ordre: (i + 1) * 10 }));
      await Promise.all(updates.map(u =>
        sb.from('services').update({ ordre: u.ordre }).eq('nom', u.nom)
      ));
      updates.forEach(u => {
        const s = cache.services.find(x => x.nom === u.nom);
        if (s) s.ordre = u.ordre;
      });
      refreshServiceSelects();
      toast('Ordre mis à jour');
    });
  });

  wrap.querySelectorAll('.tarif-cat-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const row = sel.closest('.tarif-row');
      const nom = row.dataset.nom;
      const saved = await DB.setServiceCategorie(nom, sel.value);
      if (saved) {
        toast(`${nom} déplacé en ${sel.value}`);
        renderTarifsPage();
        refreshServiceSelects();
      }
    });
  });
}

// Peupler les selects de catégorie dans les forms d'ajout
function refreshCategorySelectsInForms() {
  const sCats = activeServiceCats();
  const svcCatSel = document.getElementById('svc-new-cat');
  if (svcCatSel) {
    svcCatSel.innerHTML = sCats.map(c => `<option value="${escapeHtml(c.nom)}">${c.icon || ''} ${escapeHtml(c.nom)}</option>`).join('');
  }
  const vCats = activeVehiculeCats();
  const vtCatSel = document.getElementById('vt-new-cat');
  if (vtCatSel) {
    vtCatSel.innerHTML = vCats.map(c => `<option value="${escapeHtml(c.nom)}">${c.icon || ''} ${escapeHtml(c.nom)}</option>`).join('');
  }
}

// Bouton "+ Nouveau service" et formulaire d'ajout
document.getElementById('btnAddService').addEventListener('click', () => {
  refreshCategorySelectsInForms();
  const f = document.getElementById('addServiceForm');
  f.style.display = f.style.display === 'none' ? 'flex' : 'none';
  if (f.style.display === 'flex') document.getElementById('svc-new-name').focus();
});
document.getElementById('svc-add-cancel').addEventListener('click', () => {
  document.getElementById('addServiceForm').style.display = 'none';
  document.getElementById('svc-new-name').value = '';
  document.getElementById('svc-new-prix').value = '';
});
document.getElementById('svc-add-btn').addEventListener('click', async () => {
  const nom = document.getElementById('svc-new-name').value.trim();
  const cat = document.getElementById('svc-new-cat').value;
  const prix = Number(document.getElementById('svc-new-prix').value);
  if (!nom) { toast('Nom obligatoire', '#e53935'); return; }
  if (DB.getServices().some(s => s.nom.toLowerCase() === nom.toLowerCase())) {
    toast('Ce service existe déjà', '#e53935'); return;
  }
  if (!Number.isFinite(prix) || prix < 0) { toast('Prix invalide', '#e53935'); return; }
  const saved = await DB.addService(nom, cat, prix);
  if (saved) {
    toast(`Service "${nom}" créé`);
    document.getElementById('svc-new-name').value = '';
    document.getElementById('svc-new-prix').value = '';
    document.getElementById('addServiceForm').style.display = 'none';
    renderTarifsPage();
    refreshServiceSelects();
  }
});

// ===== VÉHICULES (admin patron) =====
function refreshVehiculeSelects() {
  const all = DB.getVehiculeTypes().slice().sort((a, b) => a.ordre - b.ordre);
  const actifs = all.filter(v => v.actif);
  const cats = activeVehiculeCats();
  const groups = cats.map(c => {
    const items = actifs.filter(v => v.categorie === c.nom);
    if (!items.length) return '';
    const label = (c.icon ? c.icon + ' ' : '') + c.nom;
    return `<optgroup label="${escapeHtml(label)}">` +
      items.map(v => `<option value="${escapeHtml(v.nom)}">${escapeHtml(v.nom)}</option>`).join('') +
      `</optgroup>`;
  }).join('');
  const orphelins = actifs.filter(v => !cats.some(c => c.nom === v.categorie));
  const orphHtml = orphelins.length
    ? `<optgroup label="Autres">` +
      orphelins.map(v => `<option value="${escapeHtml(v.nom)}">${escapeHtml(v.nom)}</option>`).join('') +
      `</optgroup>`
    : '';
  const htmlActifs = groups + orphHtml;
  ['e-vehicule', 'ed-vehicule', 'r-vehicule-type'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    const prev = sel.value;
    sel.innerHTML = htmlActifs;
    if (prev && actifs.some(v => v.nom === prev)) sel.value = prev;
  });
}

function activeVehiculeCats() {
  return DB.getVehiculeCategories().filter(c => c.actif).slice().sort((a, b) => a.ordre - b.ordre);
}

function renderVehiculesPage() {
  const wrap = document.getElementById('vehiculesList');
  const types = DB.getVehiculeTypes().slice().sort((a, b) => a.ordre - b.ordre);
  const cats = activeVehiculeCats();

  if (!cats.length) {
    wrap.innerHTML = '<div class="tarif-row" style="color:#94a3b8;font-style:italic;padding:24px">Aucune catégorie. Crée-en une ci-dessus.</div>';
    return;
  }

  wrap.innerHTML = cats.map((cat, idx) => {
    const items = types.filter(v => (v.categorie || 'Tous') === cat.nom);
    const rows = items.map(v => {
      const catOpts = cats.map(c =>
        `<option value="${escapeHtml(c.nom)}" ${c.nom === (v.categorie || 'Tous') ? 'selected' : ''}>${c.icon || ''} ${escapeHtml(c.nom)}</option>`
      ).join('');
      return `
        <div class="tarif-row ${v.actif ? '' : 'inactive'}" data-nom="${escapeHtml(v.nom)}" draggable="true">
          <span class="tarif-handle" title="Glisser pour réordonner">⋮⋮</span>
          <div class="tarif-name">
            <span class="tarif-name-text">${escapeHtml(v.nom)}</span>${v.actif ? '' : ' <span class="badge-off">désactivé</span>'}
            <button type="button" class="tarif-rename vt-rename" title="Renommer">✏️</button>
          </div>
          <div class="tarif-edit">
            <select class="tarif-cat-select vt-cat-select" title="Changer de catégorie">${catOpts}</select>
            <label class="switch" title="${v.actif ? 'Désactiver' : 'Activer'}">
              <input type="checkbox" class="vt-toggle" ${v.actif ? 'checked' : ''} />
              <span class="slider"></span>
            </label>
            <button type="button" class="tarif-save vt-del" title="Supprimer définitivement" style="background:#dc2626">🗑️</button>
          </div>
        </div>`;
    }).join('') || '<div class="tarif-row" style="color:#94a3b8;font-style:italic">Aucun type dans cette catégorie</div>';
    return `
      <details class="tarif-cat" data-cat="${escapeHtml(cat.nom)}" ${idx === 0 ? 'open' : ''}>
        <summary>
          <span class="tarif-cat-icon">${cat.icon || '🚗'}</span>
          <span class="tarif-cat-name">${escapeHtml(cat.nom)}</span>
          <span class="tarif-cat-count">${items.length}</span>
          <span class="cat-actions">
            <button type="button" class="cat-action cat-rename" title="Renommer la catégorie">✏️</button>
            <button type="button" class="cat-action cat-del" title="Supprimer la catégorie">🗑️</button>
          </span>
          <span class="tarif-cat-chevron">▾</span>
        </summary>
        <div class="tarif-list">${rows}</div>
      </details>`;
  }).join('');

  bindCategoryHeaderActions(wrap, 'vehicule');

  wrap.querySelectorAll('.vt-cat-select').forEach(sel => {
    sel.addEventListener('change', async () => {
      const nom = sel.closest('.tarif-row').dataset.nom;
      const saved = await DB.setVehiculeTypeCategorie(nom, sel.value);
      if (saved) {
        toast(`${nom} déplacé en ${sel.value}`);
        renderVehiculesPage();
        refreshVehiculeSelects();
      }
    });
  });

  wrap.querySelectorAll('.vt-toggle').forEach(chk => {
    chk.addEventListener('change', async () => {
      const nom = chk.closest('.tarif-row').dataset.nom;
      const saved = await DB.toggleVehiculeType(nom, chk.checked);
      if (saved) {
        toast(`${nom} ${chk.checked ? 'activé' : 'désactivé'}`);
        renderVehiculesPage();
        refreshVehiculeSelects();
      } else {
        chk.checked = !chk.checked;
      }
    });
  });

  wrap.querySelectorAll('.vt-rename').forEach(btn => {
    btn.addEventListener('click', async () => {
      const oldNom = btn.closest('.tarif-row').dataset.nom;
      const newNom = (prompt('Nouveau nom du type de véhicule :', oldNom) || '').trim();
      if (!newNom || newNom === oldNom) return;
      const ok = await DB.renameVehiculeType(oldNom, newNom);
      if (ok) {
        toast(`"${oldNom}" → "${newNom}"`);
        renderVehiculesPage();
        refreshVehiculeSelects();
      }
    });
  });

  wrap.querySelectorAll('.vt-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const nom = btn.closest('.tarif-row').dataset.nom;
      if (!confirm(`Supprimer définitivement "${nom}" ?\n(préfère désactiver si des entrées y font référence)`)) return;
      const ok = await DB.delVehiculeType(nom);
      if (ok) {
        toast(`${nom} supprimé`);
        renderVehiculesPage();
        refreshVehiculeSelects();
      }
    });
  });

  // Drag & drop pour réordonner les types
  wrap.querySelectorAll('.tarif-list').forEach(list => {
    attachDragSort(list, async () => {
      const rows = wrap.querySelectorAll('.tarif-row[data-nom]');
      const updates = [...rows].map((r, i) => ({ nom: r.dataset.nom, ordre: (i + 1) * 10 }));
      await Promise.all(updates.map(u =>
        sb.from('vehicule_types').update({ ordre: u.ordre }).eq('nom', u.nom)
      ));
      updates.forEach(u => {
        const v = cache.vehiculeTypes.find(x => x.nom === u.nom);
        if (v) v.ordre = u.ordre;
      });
      refreshVehiculeSelects();
      toast('Ordre mis à jour');
    });
  });
}

// Helper boutons rename/delete sur les headers de catégorie (services ou véhicules)
function bindCategoryHeaderActions(wrap, kind) {
  const isService = kind === 'service';
  const cats = isService ? DB.getServiceCategories() : DB.getVehiculeCategories();
  const renameMethod = isService ? 'renameServiceCategory' : 'renameVehiculeCategory';
  const delMethod    = isService ? 'delServiceCategory'    : 'delVehiculeCategory';
  const onChange = isService
    ? () => { renderTarifsPage(); refreshServiceSelects(); }
    : () => { renderVehiculesPage(); refreshVehiculeSelects(); };

  wrap.querySelectorAll('.cat-rename').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const oldNom = btn.closest('details').dataset.cat;
      const cat = cats.find(c => c.nom === oldNom);
      const newNom = (prompt('Nom de la catégorie :', oldNom) || '').trim();
      if (!newNom) return;
      const newIcon = (prompt('Émoji (laisse tel quel pour garder)', cat?.icon || '') || '').trim() || (cat?.icon || '');
      const ok = await DB[renameMethod](oldNom, newNom, newIcon);
      if (ok) { toast('Catégorie mise à jour'); onChange(); }
    });
  });
  wrap.querySelectorAll('.cat-del').forEach(btn => {
    btn.addEventListener('click', async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const nom = btn.closest('details').dataset.cat;
      if (!confirm(`Supprimer la catégorie "${nom}" ?\nElle doit être vide. L'historique des entrées n'est pas affecté.`)) return;
      const ok = await DB[delMethod](nom);
      if (ok) { toast(`Catégorie "${nom}" supprimée`); onChange(); }
    });
  });
}

// Helper drag & drop : glisser pour réordonner les .tarif-row dans un container.
// onReorder() est appelé une fois après le drop.
function attachDragSort(container, onReorder) {
  let dragRow = null;
  container.querySelectorAll('.tarif-row[draggable="true"]').forEach(row => {
    row.addEventListener('dragstart', (e) => {
      dragRow = row;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.nom);
      setTimeout(() => row.classList.add('dragging'), 0);
    });
    row.addEventListener('dragend', async () => {
      row.classList.remove('dragging');
      const moved = dragRow != null;
      dragRow = null;
      if (moved) await onReorder();
    });
    row.addEventListener('dragover', (e) => {
      if (!dragRow || dragRow === row) return;
      // Drag intra-liste seulement (évite de mélanger les catégories)
      if (dragRow.parentNode !== row.parentNode) return;
      e.preventDefault();
      const rect = row.getBoundingClientRect();
      const after = (e.clientY - rect.top) > rect.height / 2;
      if (after) row.parentNode.insertBefore(dragRow, row.nextSibling);
      else row.parentNode.insertBefore(dragRow, row);
    });
  });
}

document.getElementById('vt-add-btn').addEventListener('click', async () => {
  const nom = document.getElementById('vt-new-name').value.trim();
  const cat = document.getElementById('vt-new-cat').value || 'Tous';
  if (!nom) { toast('Nom obligatoire', '#e53935'); return; }
  if (DB.getVehiculeTypes().some(v => v.nom.toLowerCase() === nom.toLowerCase())) {
    toast('Ce type existe déjà', '#e53935'); return;
  }
  const saved = await DB.addVehiculeType(nom, cat);
  if (saved) {
    toast(`Type "${nom}" ajouté`);
    document.getElementById('vt-new-name').value = '';
    renderVehiculesPage();
    refreshVehiculeSelects();
  }
});

// Catégories : "+ Nouvelle catégorie" services
document.getElementById('btnAddSvcCat').addEventListener('click', () => {
  const f = document.getElementById('addSvcCatForm');
  f.style.display = f.style.display === 'none' ? 'flex' : 'none';
  if (f.style.display === 'flex') document.getElementById('svccat-new-name').focus();
});
document.getElementById('svccat-add-cancel').addEventListener('click', () => {
  document.getElementById('addSvcCatForm').style.display = 'none';
  document.getElementById('svccat-new-name').value = '';
  document.getElementById('svccat-new-icon').value = '';
});
document.getElementById('svccat-add-btn').addEventListener('click', async () => {
  const nom  = document.getElementById('svccat-new-name').value.trim();
  const icon = document.getElementById('svccat-new-icon').value.trim() || '📦';
  if (!nom) { toast('Nom obligatoire', '#e53935'); return; }
  if (DB.getServiceCategories().some(c => c.nom.toLowerCase() === nom.toLowerCase())) {
    toast('Catégorie déjà existante', '#e53935'); return;
  }
  const saved = await DB.addServiceCategory(nom, icon);
  if (saved) {
    toast(`Catégorie "${nom}" créée`);
    document.getElementById('svccat-new-name').value = '';
    document.getElementById('svccat-new-icon').value = '';
    document.getElementById('addSvcCatForm').style.display = 'none';
    renderTarifsPage();
    refreshServiceSelects();
    refreshCategorySelectsInForms();
  }
});

// Catégories : "+ Nouvelle catégorie" véhicules
document.getElementById('btnAddVtCat').addEventListener('click', () => {
  const f = document.getElementById('addVtCatForm');
  f.style.display = f.style.display === 'none' ? 'flex' : 'none';
  if (f.style.display === 'flex') document.getElementById('vtcat-new-name').focus();
});
document.getElementById('vtcat-add-cancel').addEventListener('click', () => {
  document.getElementById('addVtCatForm').style.display = 'none';
  document.getElementById('vtcat-new-name').value = '';
  document.getElementById('vtcat-new-icon').value = '';
});
document.getElementById('vtcat-add-btn').addEventListener('click', async () => {
  const nom  = document.getElementById('vtcat-new-name').value.trim();
  const icon = document.getElementById('vtcat-new-icon').value.trim() || '🚗';
  if (!nom) { toast('Nom obligatoire', '#e53935'); return; }
  if (DB.getVehiculeCategories().some(c => c.nom.toLowerCase() === nom.toLowerCase())) {
    toast('Catégorie déjà existante', '#e53935'); return;
  }
  const saved = await DB.addVehiculeCategory(nom, icon);
  if (saved) {
    toast(`Catégorie "${nom}" créée`);
    document.getElementById('vtcat-new-name').value = '';
    document.getElementById('vtcat-new-icon').value = '';
    document.getElementById('addVtCatForm').style.display = 'none';
    renderVehiculesPage();
    refreshVehiculeSelects();
    refreshCategorySelectsInForms();
  }
});

// ===== AUTH =====
const loginScreen = document.getElementById('loginScreen');
const formLogin = document.getElementById('formLogin');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

function showLogin() {
  document.body.classList.remove('auth-loading', 'authed', 'role-super-admin', 'role-admin', 'role-agent');
  setTimeout(() => document.getElementById('login-telephone')?.focus(), 50);
}

const ROLE_LABEL = { super_admin: 'Super admin', admin: 'Admin', agent: 'Agent' };

function applyRoleUI() {
  document.body.classList.remove('role-super-admin', 'role-admin', 'role-agent');
  if (session.role === 'super_admin') document.body.classList.add('role-super-admin');
  else if (session.role === 'admin')  document.body.classList.add('role-admin');
  else                                document.body.classList.add('role-agent');
  const profile = session.profile || {};
  const fullName = [profile.prenom, profile.nom].filter(Boolean).join(' ');
  document.getElementById('userEmail').textContent = fullName || profile.telephone || session.user?.email || '';
  document.getElementById('userRole').textContent = ROLE_LABEL[session.role] || session.role || '';
}

function goToPage(page) {
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (btn) btn.classList.add('active');
  document.getElementById('page-' + page)?.classList.add('active');
}

async function loadProfile() {
  const { data, error } = await sb
    .from('profiles')
    .select('role, telephone, prenom, nom, actif')
    .eq('id', session.user.id)
    .maybeSingle();
  if (error || !data) {
    console.error('Profil introuvable', error);
    await sb.auth.signOut();
    session.user = null; session.role = null; session.profile = null;
    showLogin();
    loginError.textContent = "Aucun profil associé. Contacte l'administrateur.";
    return false;
  }
  if (data.actif === false) {
    await sb.auth.signOut();
    session.user = null; session.role = null; session.profile = null;
    showLogin();
    loginError.textContent = "Ce compte est désactivé.";
    return false;
  }
  session.role = data.role;
  session.profile = data;
  return true;
}

async function startApp() {
  applyRoleUI();
  document.body.classList.remove('auth-loading');
  document.body.classList.add('authed');
  await DB.loadAll();
  refreshVehiculeSelects();
  refreshServiceSelects();
  refreshCategorySelectsInForms();
  // Pré-remplit le montant pour la valeur par défaut du select Type
  const eType = document.getElementById('e-type');
  const eMontant = document.getElementById('e-montant');
  if (eType && eMontant && !eMontant.value) {
    const p = PRIX[eType.value];
    if (p != null && p > 0) eMontant.value = p;
  }
  // Page de démarrage selon le rôle
  if (isAdmin()) {
    goToPage('dashboard');
    renderDashboard();
  } else {
    goToPage('entrees');
    renderEntreesList();
  }
  updateResaBadge();
  refreshDashResaToday();
  startOnlineAlerts();
}

const PHONE_EMAIL_DOMAIN = 'ultrawash.local';
function phoneToEmail(tel) {
  return String(tel || '').replace(/\D/g, '') + '@' + PHONE_EMAIL_DOMAIN;
}

guardedSubmit(formLogin, async (ev) => {
  ev.preventDefault();
  loginError.textContent = '';
  loginBtn.disabled = true;
  const raw = document.getElementById('login-telephone').value.trim();
  const password = document.getElementById('login-password').value;
  // Accepte téléphone OU email (si on tape un @, on prend tel quel)
  const email = raw.includes('@') ? raw : phoneToEmail(raw);
  let { data, error } = await sb.auth.signInWithPassword({ email, password });
  // Fallback : si l'email synthétique échoue, essayer les anciens emails connus
  if (error && !raw.includes('@')) {
    const tel = raw.replace(/\D/g, '');
    const legacyMap = {
      '781436380': 'admin@ultrawash.sn',
      '774780264': 'agent1@ultrawash.sn',
      '776791841': 'agent2@ultrawash.sn',
    };
    const legacy = legacyMap[tel];
    if (legacy) {
      const r = await sb.auth.signInWithPassword({ email: legacy, password });
      if (!r.error) { data = r.data; error = null; }
    }
  }
  if (error) {
    const msg = (error.message || '').toLowerCase();
    const code = (error.code || '').toLowerCase();
    if (code.includes('banned') || code.includes('disabled') || msg.includes('banned') || msg.includes('disabled')) {
      loginError.textContent = 'Compte désactivé. Contacte le super admin.';
    } else {
      loginError.textContent = 'Téléphone ou mot de passe incorrect.';
    }
    loginBtn.disabled = false;
    return;
  }
  session.user = data.user;
  const ok = await loadProfile();
  loginBtn.disabled = false;
  if (!ok) return;
  document.getElementById('login-password').value = '';
  await startApp();
});

logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
  session.user = null; session.role = null;
  cache.entrees = []; cache.sorties = [];
  showLogin();
});

// ===== UTILISATEURS (super_admin only) =====
async function callManageUsers(action, body = {}) {
  const { data: { session: s } } = await sb.auth.getSession();
  const token = s?.access_token;
  if (!token) {
    toast('Session expirée, reconnecte-toi.', '#e53935');
    return null;
  }
  const { data, error } = await sb.functions.invoke('manage-users', {
    body: { action, ...body },
    headers: { Authorization: `Bearer ${token}` }
  });
  if (error) {
    let msg = error.message || 'Erreur réseau';
    // Quand status != 2xx, supabase-js met la Response dans error.context
    try {
      if (error.context && typeof error.context.json === 'function') {
        const body = await error.context.clone().json();
        if (body?.error) msg = body.error;
      }
    } catch (_) { /* ignore parse errors */ }
    console.error('manage-users error:', error, 'data:', data);
    toast('Erreur : ' + msg, '#e53935');
    return null;
  }
  if (data?.error) {
    toast('Erreur : ' + data.error, '#e53935');
    return null;
  }
  return data;
}

const ROLE_BADGE = {
  super_admin: { label: 'Super admin', icon: '👑', cls: 'role-badge-super' },
  admin:       { label: 'Admin',       icon: '🛠️', cls: 'role-badge-admin' },
  agent:       { label: 'Agent',       icon: '🧤', cls: 'role-badge-agent' },
};

const AVATAR_PALETTE = [
  '#2563eb', '#7c3aed', '#db2777', '#ea580c', '#16a34a',
  '#0891b2', '#9333ea', '#e11d48', '#ca8a04', '#0d9488'
];

function userInitials(u) {
  const p = (u.prenom || '').trim();
  const n = (u.nom || '').trim();
  const ini = ((p[0] || '') + (n[0] || '')).toUpperCase();
  return ini || (u.telephone || '?').slice(-2);
}

function userColor(u) {
  const seed = (u.telephone || u.id || '').split('').reduce((s, c) => s + c.charCodeAt(0), 0);
  return AVATAR_PALETTE[seed % AVATAR_PALETTE.length];
}

async function renderUsersPage() {
  if (!isSuperAdmin()) return;
  const grid = document.getElementById('usersGrid');
  const stats = document.getElementById('usersStats');
  grid.innerHTML = '<div class="users-empty">Chargement…</div>';
  stats.innerHTML = '';
  const res = await callManageUsers('list');
  if (!res) { grid.innerHTML = '<div class="users-empty error">Impossible de charger.</div>'; return; }
  const users = res.users || [];
  if (!users.length) {
    grid.innerHTML = '<div class="users-empty">Aucun utilisateur.</div>';
    return;
  }

  const count = users.length;
  const supers = users.filter(u => u.role === 'super_admin').length;
  const admins = users.filter(u => u.role === 'admin').length;
  const agents = users.filter(u => u.role === 'agent').length;
  const inactifs = users.filter(u => !u.actif).length;
  stats.innerHTML = `
    <div class="stat-pill"><span class="stat-num">${count}</span><span class="stat-label">utilisateur${count > 1 ? 's' : ''}</span></div>
    <div class="stat-pill"><span class="stat-icon">👑</span><span class="stat-num">${supers}</span><span class="stat-label">super admin${supers > 1 ? 's' : ''}</span></div>
    <div class="stat-pill"><span class="stat-icon">🛠️</span><span class="stat-num">${admins}</span><span class="stat-label">admin${admins > 1 ? 's' : ''}</span></div>
    <div class="stat-pill"><span class="stat-icon">🧤</span><span class="stat-num">${agents}</span><span class="stat-label">agent${agents > 1 ? 's' : ''}</span></div>
    ${inactifs ? `<div class="stat-pill stat-pill-warn"><span class="stat-icon">💤</span><span class="stat-num">${inactifs}</span><span class="stat-label">désactivé${inactifs > 1 ? 's' : ''}</span></div>` : ''}
  `;

  grid.innerHTML = users.map(u => {
    const isSelf = u.id === session.user.id;
    const badge = ROLE_BADGE[u.role] || ROLE_BADGE.agent;
    const fullName = [u.prenom, u.nom].filter(Boolean).join(' ') || '—';
    return `
      <div class="user-card ${u.actif ? '' : 'is-inactive'}" data-id="${u.id}">
        <div class="user-card-top">
          <div class="user-avatar" style="background:${userColor(u)}">${escapeHtml(userInitials(u))}</div>
          <div class="user-card-info">
            <div class="user-name">${escapeHtml(fullName)} ${isSelf ? '<span class="self-tag">moi</span>' : ''}</div>
            <div class="user-tel">📞 ${escapeHtml(u.telephone || '—')}</div>
          </div>
          <span class="role-badge ${badge.cls}">${badge.icon} ${badge.label}</span>
        </div>
        <div class="user-card-controls">
          <label class="user-control-row">
            <span class="ctrl-label">Rôle</span>
            <select class="u-role-sel" ${isSelf ? 'disabled' : ''}>
              <option value="agent" ${u.role === 'agent' ? 'selected' : ''}>🧤 Agent</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>🛠️ Admin</option>
              <option value="super_admin" ${u.role === 'super_admin' ? 'selected' : ''}>👑 Super admin</option>
            </select>
          </label>
          <label class="user-control-row">
            <span class="ctrl-label">Actif</span>
            <span class="actif-wrap">
              <span class="actif-text">${u.actif ? 'Oui' : 'Non'}</span>
              <label class="switch">
                <input type="checkbox" class="u-actif-chk" ${u.actif ? 'checked' : ''} ${isSelf ? 'disabled' : ''} />
                <span class="slider"></span>
              </label>
            </span>
          </label>
        </div>
        <div class="user-card-actions">
          <button class="btn-outline u-edit" title="Modifier prénom, nom, téléphone">✏️ Modifier</button>
          <button class="btn-outline u-pwd" title="Réinitialiser mot de passe">🔑 Mot de passe</button>
          <button class="btn-danger-sm u-del" title="Supprimer" ${isSelf ? 'disabled' : ''}>🗑️ Supprimer</button>
        </div>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.u-role-sel').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = sel.closest('.user-card').dataset.id;
      const r = await callManageUsers('update', { id, role: sel.value });
      if (r) toast('Rôle mis à jour');
      renderUsersPage();
    });
  });

  grid.querySelectorAll('.u-actif-chk').forEach(chk => {
    chk.addEventListener('change', async () => {
      const id = chk.closest('.user-card').dataset.id;
      const r = await callManageUsers('update', { id, actif: chk.checked });
      if (r) toast(chk.checked ? 'Compte activé' : 'Compte désactivé');
      renderUsersPage();
    });
  });

  grid.querySelectorAll('.u-edit').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('.user-card').dataset.id;
      const u = users.find(x => x.id === id);
      if (u) openUserModal(u);
    });
  });

  grid.querySelectorAll('.u-pwd').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.closest('.user-card').dataset.id;
      const pwd = prompt('Nouveau mot de passe (6+ caractères) :');
      if (pwd === null) return;
      if (pwd.length < 6) { toast('Mot de passe trop court', '#e53935'); return; }
      const r = await callManageUsers('reset-password', { id, password: pwd });
      if (r) toast('Mot de passe réinitialisé');
    });
  });

  grid.querySelectorAll('.u-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      const card = btn.closest('.user-card');
      const id = card.dataset.id;
      const nom = card.querySelector('.user-name').textContent.trim();
      if (!confirm(`Supprimer définitivement "${nom}" ? Cette action est irréversible.`)) return;
      const r = await callManageUsers('delete', { id });
      if (r) { toast('Utilisateur supprimé'); renderUsersPage(); }
    });
  });
}

// Modale de création / édition
const userModal = document.getElementById('userModal');
const userError = document.getElementById('userError');
let editingUserId = null;

function setUserModalRole(role) {
  document.getElementById('u-role').value = role;
  document.querySelectorAll('input[name="u-role-radio"]').forEach(r => {
    r.checked = (r.value === role);
  });
}

function updateUserModalAvatar() {
  const av = document.getElementById('userModalAvatar');
  if (!av) return;
  const p = document.getElementById('u-prenom').value.trim();
  const n = document.getElementById('u-nom').value.trim();
  const ini = ((p[0] || '') + (n[0] || '')).toUpperCase();
  av.textContent = ini || '?';
  av.classList.add('pulse');
  setTimeout(() => av.classList.remove('pulse'), 200);
}

function openUserModal(user = null) {
  const form = document.getElementById('formUser');
  form.reset();
  editingUserId = user ? user.id : null;
  const isEdit = !!user;

  document.getElementById('userModalTitle').textContent = isEdit ? 'Modifier l\'utilisateur' : 'Nouvel utilisateur';
  document.getElementById('userModalSubtitle').textContent = isEdit
    ? 'Mets à jour les informations du compte'
    : 'Créer un compte avec téléphone + mot de passe';
  document.getElementById('userSubmit').textContent = isEdit ? 'Enregistrer' : 'Créer le compte';

  // Mot de passe : requis seulement à la création
  const pwdRow = document.getElementById('u-password-row');
  const pwdInput = document.getElementById('u-password');
  pwdRow.style.display = isEdit ? 'none' : '';
  pwdInput.required = !isEdit;

  if (isEdit) {
    document.getElementById('u-prenom').value = user.prenom || '';
    document.getElementById('u-nom').value = user.nom || '';
    document.getElementById('u-telephone').value = user.telephone || '';
    setUserModalRole(user.role || 'agent');
  } else {
    setUserModalRole('agent');
  }

  updateUserModalAvatar();
  userError.textContent = '';
  userModal.style.display = 'flex';
  setTimeout(() => document.getElementById('u-prenom').focus(), 50);
}
function closeUserModal() { userModal.style.display = 'none'; editingUserId = null; }

// Branchements UX : avatar live + radios + générateur mot de passe + ESC + clic backdrop
document.getElementById('u-prenom')?.addEventListener('input', updateUserModalAvatar);
document.getElementById('u-nom')?.addEventListener('input', updateUserModalAvatar);
document.querySelectorAll('input[name="u-role-radio"]').forEach(r => {
  r.addEventListener('change', () => { if (r.checked) document.getElementById('u-role').value = r.value; });
});
document.getElementById('u-password-gen')?.addEventListener('click', () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let pwd = '';
  for (let i = 0; i < 8; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
  document.getElementById('u-password').value = pwd;
});
userModal?.addEventListener('click', (e) => {
  if (e.target === userModal) closeUserModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && userModal && userModal.style.display === 'flex') closeUserModal();
});

document.getElementById('btnAddUser')?.addEventListener('click', () => openUserModal());
document.getElementById('userModalClose')?.addEventListener('click', closeUserModal);
document.getElementById('userCancel')?.addEventListener('click', closeUserModal);

guardedSubmit(document.getElementById('formUser'), async (ev) => {
  ev.preventDefault();
  userError.textContent = '';
  const submitBtn = document.getElementById('userSubmit');
  submitBtn.disabled = true;

  const isEdit = !!editingUserId;
  let r;
  if (isEdit) {
    r = await callManageUsers('update', {
      id: editingUserId,
      prenom: document.getElementById('u-prenom').value.trim(),
      nom: document.getElementById('u-nom').value.trim(),
      telephone: document.getElementById('u-telephone').value.trim(),
      role: document.getElementById('u-role').value,
    });
  } else {
    r = await callManageUsers('create', {
      prenom: document.getElementById('u-prenom').value.trim(),
      nom: document.getElementById('u-nom').value.trim(),
      telephone: document.getElementById('u-telephone').value.trim(),
      role: document.getElementById('u-role').value,
      password: document.getElementById('u-password').value,
    });
  }
  submitBtn.disabled = false;
  if (r) {
    toast(isEdit ? 'Utilisateur mis à jour' : 'Compte créé');
    closeUserModal();
    renderUsersPage();
  }
});

// ===== INIT =====
(async () => {
  const { data: { session: s } } = await sb.auth.getSession();
  if (!s) { showLogin(); return; }
  session.user = s.user;
  const ok = await loadProfile();
  if (!ok) return;
  await startApp();
})();

// ===== CLIENTS =====
const clientModal = document.getElementById('clientModal');
const ficheModal  = document.getElementById('ficheModal');
let editingClientId = null;
let editingClientNewVehicules = []; // pour création : on bufferise les véhicules avant insert
let viewingClientId = null;

async function renderClientsPage() {
  if (!cache.clientsLoaded) {
    await DB.loadClients();
  }
  renderClientsList();
}

function clientStats(clientId) {
  const lavages = cache.entrees.filter(e => e.client_id === clientId);
  const ca = lavages.reduce((a, e) => a + Number(e.montant || 0), 0);
  const last = lavages.length ? lavages[0].date : null; // entrees triées desc
  return { nb: lavages.length, ca, last };
}

function getFilteredClients() {
  const q = (document.getElementById('c-search').value || '').toLowerCase().trim();
  const typeFilter = document.getElementById('c-filter-type').value;
  const from = document.getElementById('c-from').value;
  const to   = document.getElementById('c-to').value;

  return cache.clients.filter(c => {
    if (typeFilter && c.type !== typeFilter) return false;
    // Filtre dernière visite
    if (from || to) {
      const last = clientStats(c.id).last;
      if (!last) return false; // jamais venu → exclu si filtre actif
      if (from && last < from) return false;
      if (to   && last > to)   return false;
    }
    if (!q) return true;
    if (c.nom.toLowerCase().includes(q)) return true;
    if (c.telephone && c.telephone.toLowerCase().includes(q)) return true;
    const vehs = cache.vehicules.filter(v => v.client_id === c.id);
    return vehs.some(v => v.plaque.toLowerCase().includes(q));
  });
}

function renderClientsList() {
  const tbody = document.getElementById('clientsList');
  const empty = document.getElementById('clientsEmpty');
  const list = getFilteredClients();

  if (list.length === 0) {
    tbody.innerHTML = ''; empty.style.display = 'block';
    renderPager('clientsPager', 'clients', 0, 1, 1, renderClientsList);
    return;
  }
  empty.style.display = 'none';

  const { slice, page, totalPages, total } = paginate(list, 'clients');
  tbody.innerHTML = slice.map(c => {
    const vehs = cache.vehicules.filter(v => v.client_id === c.id);
    const st = clientStats(c.id);
    const plaques = vehs.map(v => v.plaque).join(', ') || '—';
    return `
      <tr class="row-click" data-cid="${c.id}">
        <td><b>${escapeHtml(c.nom)}</b></td>
        <td><span class="badge badge-${c.type}">${c.type === 'entreprise' ? 'Entreprise' : 'Particulier'}</span></td>
        <td>${escapeHtml(c.telephone || '—')}</td>
        <td>${escapeHtml(plaques)}</td>
        <td>${st.nb}</td>
        <td class="montant-entree">${fmt(st.ca)}</td>
        <td>${st.last ? fmtDate(st.last) : '—'}</td>
        <td><button class="btn-edit" data-action="view" data-cid="${c.id}" title="Voir la fiche">👁</button></td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-action="view"]').forEach(b => {
    b.addEventListener('click', (ev) => {
      ev.stopPropagation();
      openFiche(b.dataset.cid);
    });
  });
  tbody.querySelectorAll('tr.row-click').forEach(tr => {
    tr.addEventListener('click', () => openFiche(tr.dataset.cid));
  });

  renderPager('clientsPager', 'clients', total, page, totalPages, renderClientsList);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

document.getElementById('c-search').addEventListener('input', withPageReset('clients', renderClientsList));
document.getElementById('c-filter-type').addEventListener('change', withPageReset('clients', renderClientsList));
document.getElementById('c-from').addEventListener('change', withPageReset('clients', renderClientsList));
document.getElementById('c-to').addEventListener('change', withPageReset('clients', renderClientsList));
document.getElementById('c-reset').addEventListener('click', () => {
  pagers.clients = 1;
  document.getElementById('c-search').value = '';
  document.getElementById('c-filter-type').value = '';
  document.getElementById('c-from').value = '';
  document.getElementById('c-to').value = '';
  renderClientsList();
});
document.getElementById('btnNewClient').addEventListener('click', () => openClientModal(null));

// Export CSV des clients (respecte les filtres en cours)
document.getElementById('btnExportClients').addEventListener('click', () => {
  const list = getFilteredClients();
  if (list.length === 0) { toast('Aucun client à exporter', '#f59e0b'); return; }
  const escCsv = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const header = 'Nom,Type,Telephone,Email,Adresse,Plaques,Nb lavages,CA total (FCFA),Derniere visite,Notes\n';
  const rows = list.map(c => {
    const st = clientStats(c.id);
    const plaques = cache.vehicules.filter(v => v.client_id === c.id).map(v => v.plaque).join(' | ');
    return [
      escCsv(c.nom),
      c.type,
      escCsv(c.telephone),
      escCsv(c.email),
      escCsv(c.adresse),
      escCsv(plaques),
      st.nb,
      st.ca,
      st.last || '',
      escCsv(c.notes),
    ].join(',');
  }).join('\n');
  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ultrawash_clients_${todayYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export clients téléchargé');
});

// ----- Modal client (create/edit) -----
function openClientModal(clientId, prefill = {}) {
  editingClientId = clientId;
  editingClientNewVehicules = [];
  document.getElementById('clientModalTitle').textContent = clientId ? 'Modifier le client' : 'Nouveau client';
  const f = document.getElementById('formClient');
  f.reset();
  document.getElementById('cl-id').value = clientId || '';

  if (clientId) {
    const c = cache.clients.find(x => x.id === clientId);
    if (!c) return;
    document.getElementById('cl-type').value      = c.type;
    document.getElementById('cl-nom').value       = c.nom || '';
    document.getElementById('cl-telephone').value = c.telephone || '';
    document.getElementById('cl-email').value     = c.email || '';
    document.getElementById('cl-adresse').value   = c.adresse || '';
    document.getElementById('cl-notes').value     = c.notes || '';
  }
  // Pré-remplir le téléphone si fourni (depuis la fiche entrée)
  if (!clientId && prefill.telephone) {
    document.getElementById('cl-telephone').value = prefill.telephone;
  }
  // Pré-remplir le champ d'ajout véhicule (sans pousser dans la liste)
  document.getElementById('cl-veh-plaque').value = prefill.plaque ? prefill.plaque.toUpperCase() : '';
  document.getElementById('cl-veh-marque').value = '';
  document.getElementById('cl-veh-modele').value = '';
  renderVehiculesInModal();
  clientModal.classList.add('show');
  // Focus sur marque si plaque pré-remplie pour saisie immédiate
  if (prefill.plaque) {
    setTimeout(() => document.getElementById('cl-veh-marque').focus(), 50);
  }
}

function closeClientModal() {
  clientModal.classList.remove('show');
  editingClientId = null;
  editingClientNewVehicules = [];
}
document.getElementById('clientClose').addEventListener('click', closeClientModal);
clientModal.querySelector('[data-modal-cancel]').addEventListener('click', closeClientModal);
clientModal.addEventListener('click', (e) => { if (e.target === clientModal) closeClientModal(); });

function renderVehiculesInModal() {
  const list = document.getElementById('cl-vehicules-list');
  const existing = editingClientId ? cache.vehicules.filter(v => v.client_id === editingClientId) : [];
  const pending = editingClientNewVehicules;
  if (existing.length === 0 && pending.length === 0) {
    list.innerHTML = '<div class="empty-inline">Aucun véhicule.</div>';
    return;
  }
  list.innerHTML = [
    ...existing.map(v => `
      <div class="vehicule-item">
        <span><b>${escapeHtml(v.plaque)}</b>${v.marque || v.modele ? ' — ' + escapeHtml([v.marque, v.modele].filter(Boolean).join(' ')) : ''}</span>
        <button type="button" class="btn-del" data-veh-id="${v.id}" title="Supprimer">✕</button>
      </div>`),
    ...pending.map((v, i) => `
      <div class="vehicule-item pending">
        <span><b>${escapeHtml(v.plaque)}</b>${v.marque || v.modele ? ' — ' + escapeHtml([v.marque, v.modele].filter(Boolean).join(' ')) : ''} <em>(à enregistrer)</em></span>
        <button type="button" class="btn-del" data-pending-idx="${i}" title="Retirer">✕</button>
      </div>`),
  ].join('');
  list.querySelectorAll('[data-veh-id]').forEach(b => {
    b.addEventListener('click', async () => {
      if (!confirm('Supprimer ce véhicule ?')) return;
      const ok = await DB.delVehicule(b.dataset.vehId);
      if (ok) renderVehiculesInModal();
    });
  });
  list.querySelectorAll('[data-pending-idx]').forEach(b => {
    b.addEventListener('click', () => {
      editingClientNewVehicules.splice(Number(b.dataset.pendingIdx), 1);
      renderVehiculesInModal();
    });
  });
}

document.getElementById('cl-veh-add').addEventListener('click', async () => {
  const plaque = (document.getElementById('cl-veh-plaque').value || '').trim().toUpperCase();
  const marque = document.getElementById('cl-veh-marque').value.trim();
  const modele = document.getElementById('cl-veh-modele').value.trim();
  if (!plaque) { toast('Plaque requise', '#e53935'); return; }

  // Vérif côté client : la plaque est-elle déjà chez un autre client ?
  const owned = cache.vehicules.find(v => v.plaque === plaque && v.client_id !== editingClientId);
  if (owned) {
    const ownerClient = cache.clients.find(c => c.id === owned.client_id);
    toast(`Plaque déjà rattachée à : ${ownerClient ? ownerClient.nom : 'un autre client'}`, '#e53935');
    return;
  }
  if (editingClientNewVehicules.some(v => v.plaque === plaque)) {
    toast('Plaque déjà ajoutée', '#e53935');
    return;
  }

  if (editingClientId) {
    const saved = await DB.addVehicule({ client_id: editingClientId, plaque, marque: marque || null, modele: modele || null });
    if (saved) {
      document.getElementById('cl-veh-plaque').value = '';
      document.getElementById('cl-veh-marque').value = '';
      document.getElementById('cl-veh-modele').value = '';
      renderVehiculesInModal();
    }
  } else {
    editingClientNewVehicules.push({ plaque, marque, modele });
    document.getElementById('cl-veh-plaque').value = '';
    document.getElementById('cl-veh-marque').value = '';
    document.getElementById('cl-veh-modele').value = '';
    renderVehiculesInModal();
  }
});

guardedSubmit(document.getElementById('formClient'), async (ev) => {
  ev.preventDefault();
  // Si une plaque est saisie mais pas encore ajoutée, on l'ajoute automatiquement
  const pendingPlaque = (document.getElementById('cl-veh-plaque').value || '').trim().toUpperCase();
  if (pendingPlaque) {
    document.getElementById('cl-veh-add').click();
    // Si l'ajout a échoué (plaque dupliquée), on stoppe le submit
    if ((document.getElementById('cl-veh-plaque').value || '').trim()) return;
  }
  const row = {
    type:      document.getElementById('cl-type').value,
    nom:       document.getElementById('cl-nom').value.trim(),
    telephone: document.getElementById('cl-telephone').value.trim() || null,
    email:     document.getElementById('cl-email').value.trim() || null,
    adresse:   document.getElementById('cl-adresse').value.trim() || null,
    notes:     document.getElementById('cl-notes').value.trim() || null,
  };

  // Téléphone unique : refuser s'il est déjà attribué à un autre client
  if (row.telephone) {
    let dup = cache.clients.find(c => c.telephone === row.telephone && c.id !== editingClientId);
    if (!dup) {
      let q = sb.from('clients').select('id, nom').eq('telephone', row.telephone);
      if (editingClientId) q = q.neq('id', editingClientId);
      const { data } = await q.limit(1);
      if (data && data[0]) dup = data[0];
    }
    if (dup) { toast(`Numéro déjà utilisé par « ${dup.nom} »`, '#e53935'); return; }
  }

  let client;
  if (editingClientId) {
    client = await DB.updateClient(editingClientId, row);
  } else {
    client = await DB.addClient(row);
    if (client && editingClientNewVehicules.length) {
      for (const v of editingClientNewVehicules) {
        await DB.addVehicule({ client_id: client.id, plaque: v.plaque, marque: v.marque || null, modele: v.modele || null });
      }
    }
  }
  if (!client) return;
  closeClientModal();
  renderClientsList();
  toast(editingClientId ? 'Client mis à jour' : 'Client créé');
});

// ----- Fiche client -----
function openFiche(clientId) {
  viewingClientId = clientId;
  const c = cache.clients.find(x => x.id === clientId);
  if (!c) return;
  document.getElementById('ficheTitle').textContent = c.nom;
  const st = clientStats(clientId);
  document.getElementById('ficheInfo').innerHTML = `
    <div class="info-grid">
      <div><span>Type</span><b>${c.type === 'entreprise' ? 'Entreprise / Flotte' : 'Particulier'}</b></div>
      <div><span>Téléphone</span><b>${escapeHtml(c.telephone || '—')}</b></div>
      <div><span>Email</span><b>${escapeHtml(c.email || '—')}</b></div>
      <div><span>Adresse</span><b>${escapeHtml(c.adresse || '—')}</b></div>
      <div><span>Lavages</span><b>${st.nb}</b></div>
      <div><span>CA total</span><b class="montant-entree">${fmt(st.ca)}</b></div>
      <div><span>Dernière visite</span><b>${st.last ? fmtDate(st.last) : '—'}</b></div>
      <div><span>Notes</span><b>${escapeHtml(c.notes || '—')}</b></div>
    </div>`;

  const vehs = cache.vehicules.filter(v => v.client_id === clientId);
  document.getElementById('ficheVehicules').innerHTML = vehs.length
    ? vehs.map(v => `<span class="veh-pill"><b>${escapeHtml(v.plaque)}</b>${v.marque || v.modele ? ' · ' + escapeHtml([v.marque, v.modele].filter(Boolean).join(' ')) : ''}</span>`).join('')
    : '<div class="empty-inline">Aucun véhicule.</div>';

  const lavages = cache.entrees.filter(e => e.client_id === clientId);
  const tbody = document.getElementById('ficheHistorique');
  const empty = document.getElementById('ficheEmpty');
  if (lavages.length === 0) {
    tbody.innerHTML = ''; empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = lavages.map(e => `
      <tr>
        <td>${fmtDate(e.date)} ${e.heure || ''}</td>
        <td>${escapeHtml(e.vehicule || '')}</td>
        <td>${escapeHtml(e.type || '')}</td>
        <td class="montant-entree">+${fmt(e.montant)}</td>
      </tr>`).join('');
  }
  ficheModal.classList.add('show');
}

function closeFiche() { ficheModal.classList.remove('show'); viewingClientId = null; }
document.getElementById('ficheClose').addEventListener('click', closeFiche);
ficheModal.addEventListener('click', (e) => { if (e.target === ficheModal) closeFiche(); });

document.getElementById('ficheEdit').addEventListener('click', () => {
  const id = viewingClientId;
  closeFiche();
  openClientModal(id);
});
document.getElementById('ficheDelete').addEventListener('click', async () => {
  if (!viewingClientId) return;
  if (!confirm('Supprimer ce client ? Ses véhicules seront supprimés. Les lavages historiques sont conservés.')) return;
  const ok = await DB.delClient(viewingClientId);
  if (!ok) return;
  closeFiche();
  renderClientsList();
  toast('Client supprimé', '#e53935');
});

// ===== RESERVATIONS =====
function resaSort(a, b) {
  if (a.date_prevue !== b.date_prevue) return a.date_prevue < b.date_prevue ? -1 : 1;
  return (a.heure_prevue || '').localeCompare(b.heure_prevue || '');
}

const resaModal = document.getElementById('resaModal');
let editingResaId = null;

// Calendrier de la modale réservation
const RESA_MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const RESA_DOW = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
let resaCalYear, resaCalMonth;
let closedDaysSet = new Set(); // jours fermés (off / fériés), 'YYYY-MM-DD'

function todayYmd() { return ymd(new Date()); }

function statutLabel(s) {
  return ({ prevu: 'Prévu', arrive: 'Arrivé', annule: 'Annulé' })[s] || s;
}

function updateResaBadge() {
  const today = todayYmd();
  const n = cache.reservations.filter(r => r.date_prevue === today && r.statut === 'prevu').length;
  const badge = document.getElementById('navBadgeResa');
  if (!badge) return;
  if (n > 0) { badge.textContent = n; badge.style.display = ''; }
  else { badge.textContent = ''; badge.style.display = 'none'; }
}

function clientLabel(r) {
  if (r.client_id) {
    const c = cache.clients.find(x => x.id === r.client_id);
    if (c) return c.nom + (c.telephone ? ' · ' + c.telephone : '');
  }
  return (r.client_nom || 'Client de passage') + (r.client_telephone ? ' · ' + r.client_telephone : '');
}

function vehiculeLabel(r) {
  let label = r.vehicule_type || '';
  if (r.vehicule_id) {
    const v = cache.vehicules.find(x => x.id === r.vehicule_id);
    if (v) {
      const desc = [v.marque, v.modele].filter(Boolean).join(' ');
      label = (desc ? desc + ' · ' : '') + v.plaque;
    }
  }
  return label || '—';
}

// ----- Confirmation WhatsApp au client (réservation interne) -----
// Téléphone du client lié à une résa (fiche liée prioritaire, sinon snapshot)
function resaClientPhone(r) {
  if (r.client_id) {
    const c = cache.clients.find(x => x.id === r.client_id);
    if (c && c.telephone) return c.telephone;
  }
  return r.client_telephone || null;
}
// Normalise un numéro saisi librement vers le format wa.me (international, sans +)
// Hypothèse Sénégal (+221) pour un numéro local à 9 chiffres.
function waNumber(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('221')) return d;
  d = d.replace(/^0+/, '');
  if (d.length === 9) return '221' + d;
  return d;
}
function resaClientName(r) {
  if (r.client_id) {
    const c = cache.clients.find(x => x.id === r.client_id);
    if (c && c.nom) return c.nom;
  }
  return r.client_nom || 'cher client';
}
// Lien wa.me vers le client avec un message de confirmation pré-rempli
function resaWaLink(r) {
  const num = waNumber(resaClientPhone(r));
  if (!num) return null;
  const heure = (r.heure_prevue || '').slice(0, 5);
  const lignes = [
    `Bonjour ${resaClientName(r)},`,
    'Votre réservation chez UltraWash est confirmée :',
    `- Date : ${fmtDate(r.date_prevue)} à ${heure}`,
  ];
  const presta = r.type_lavage || (r.vehicule_type ? 'Lavage ' + r.vehicule_type : '');
  if (presta) lignes.push(`- Prestation : ${presta}`);
  if (r.montant_estime) lignes.push(`- Montant : ${Number(r.montant_estime)} FCFA`);
  lignes.push('À très vite !');
  lignes.push("L'équipe UltraWash");
  return `https://wa.me/${num}?text=${encodeURIComponent(lignes.join('\n'))}`;
}

async function renderReservationsPage() {
  // Pour la recherche client dans la modale, on lazy-load les clients aussi
  if (!cache.clientsLoaded) await DB.loadClients();
  await loadBookingConfig();
  await loadClosedDays();
  renderReservationsList();
  refreshBookingToggle();
}

// Jours fermés (off / fériés) — chargés dans un Set pour le calendrier interne
async function loadClosedDays() {
  const { data } = await sb.from('booking_closed_days').select('day').gte('day', todayYmd());
  closedDaysSet = new Set((data || []).map(r => r.day));
  return closedDaysSet;
}

// ----- Gestion des jours fermés : mini-calendrier multi-sélection -----
let bscYear, bscMonth;

function renderClosedDow() {
  document.getElementById('bsc-dow').innerHTML = RESA_DOW.map(d => `<div class="bsc-dow">${d}</div>`).join('');
}

function renderClosedCal() {
  const today = new Date(); today.setHours(0,0,0,0);
  document.getElementById('bsc-month').textContent = `${RESA_MONTHS[bscMonth]} ${bscYear}`;
  document.getElementById('bsc-prev').disabled = (bscYear === today.getFullYear() && bscMonth === today.getMonth());
  const first = new Date(bscYear, bscMonth, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(bscYear, bscMonth + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="bsc-day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const date = new Date(bscYear, bscMonth, d);
    const key = ymd(date);
    const isPast = date < today;
    const cls = ['bsc-day'];
    if (isPast) cls.push('past');
    if (closedDaysSet.has(key)) cls.push('closed');
    if (date.getTime() === today.getTime()) cls.push('today');
    cells += `<div class="${cls.join(' ')}" ${isPast ? '' : `data-day="${key}"`}>${d}</div>`;
  }
  const grid = document.getElementById('bsc-grid');
  grid.innerHTML = cells;
  grid.querySelectorAll('[data-day]').forEach(el =>
    el.addEventListener('click', () => toggleClosedDay(el.dataset.day)));
}

// Bascule un jour : fermé ⇄ ouvert (clic sur le calendrier ou ✕ de la liste)
async function toggleClosedDay(key) {
  if (closedDaysSet.has(key)) {
    const { error } = await sb.from('booking_closed_days').delete().eq('day', key);
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return; }
    closedDaysSet.delete(key);
    toast(`${fmtDate(key)} rouvert`, '#0d9e6e');
  } else {
    const reason = document.getElementById('bs-day-reason').value.trim() || null;
    const { error } = await sb.from('booking_closed_days').insert({ day: key, reason });
    if (error && error.code !== '23505') {
      if (error.code === '42501' || /row-level/i.test(error.message)) toast('Action réservée aux administrateurs', '#e53935');
      else toast('Erreur : ' + error.message, '#e53935');
      return;
    }
    closedDaysSet.add(key);
    toast(`${fmtDate(key)} fermé`, '#f59e0b');
  }
  renderClosedCal();
  renderClosedDays();
}

// Récap des jours fermés à venir (sous le calendrier), regroupés par mois.
// Sections repliables (le 1er mois ouvert) + puces compactes : reste lisible
// même avec beaucoup de jours sur plusieurs mois/années.
async function renderClosedDays() {
  const wrap = document.getElementById('bs-day-list');
  if (!wrap) return;
  const { data } = await sb.from('booking_closed_days').select('*').gte('day', todayYmd()).order('day');
  const list = data || [];
  if (!list.length) {
    wrap.innerHTML = '<p class="resa-client-note" style="margin:0">Aucun jour fermé à venir.</p>';
    return;
  }
  // Regroupe par mois ('YYYY-MM'), en conservant l'ordre chronologique
  const groups = new Map();
  list.forEach(d => {
    const key = d.day.slice(0, 7);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(d);
  });
  let first = true;
  let html = '';
  for (const [key, days] of groups) {
    const [y, m] = key.split('-').map(Number);
    const n = days.length;
    const chips = days.map(d => {
      const lbl = new Date(d.day + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric' });
      const titre = d.reason ? `${lbl} · ${escapeHtml(d.reason)}` : lbl;
      return `<span class="bs-day-chip"><span>${titre}</span>
        <button type="button" data-day="${d.day}" title="Rouvrir ce jour">✕</button></span>`;
    }).join('');
    html += `
      <details class="bs-month-group"${first ? ' open' : ''}>
        <summary><span class="bs-month-name">${RESA_MONTHS[m - 1]} ${y}</span>
          <span class="bs-month-count">${n} jour${n > 1 ? 's' : ''}</span></summary>
        <div class="bs-day-chips">${chips}</div>
      </details>`;
    first = false;
  }
  wrap.innerHTML = html;
  wrap.querySelectorAll('button[data-day]').forEach(b =>
    b.addEventListener('click', () => toggleClosedDay(b.dataset.day)));
}

document.getElementById('bsc-prev').addEventListener('click', () => {
  if (document.getElementById('bsc-prev').disabled) return;
  bscMonth--; if (bscMonth < 0) { bscMonth = 11; bscYear--; }
  renderClosedCal();
});
document.getElementById('bsc-next').addEventListener('click', () => {
  bscMonth++; if (bscMonth > 11) { bscMonth = 0; bscYear++; }
  renderClosedCal();
});

// Réglages réservation (horaires + capacité), avec valeurs par défaut
async function loadBookingConfig() {
  const { data } = await sb.from('booking_config').select('*').eq('id', true).maybeSingle();
  if (data) cache.bookingConfig = data;
  return cache.bookingConfig;
}
function bookingCfg() {
  const c = cache.bookingConfig || {};
  return {
    open:  Number.isFinite(c.open_hour)    ? c.open_hour    : 10,
    close: Number.isFinite(c.close_hour)   ? c.close_hour   : 19,
    step:  Number.isFinite(c.slot_minutes) ? c.slot_minutes : 60,
    cap:   Number.isFinite(c.capacity)     ? c.capacity     : 1,
  };
}

// ----- Ouverture / fermeture des réservations en ligne (admin/super_admin) -----
function refreshBookingToggle() {
  const btn = document.getElementById('btnBookingToggle');
  if (!btn || !isAdmin()) return;
  const open = cache.bookingConfig ? cache.bookingConfig.is_open : true;
  btn.dataset.open = open ? '1' : '0';
  btn.textContent = open ? '🟢' : '🔴';
  btn.title = open
    ? 'Réservations en ligne ouvertes — cliquer pour fermer'
    : 'Réservations en ligne FERMÉES — cliquer pour rouvrir';
  btn.classList.toggle('btn-danger', !open);
  btn.classList.toggle('btn-outline', open);
}

// Écrit le nouvel état en base + rafraîchit l'UI (renvoie true si OK)
async function setBookingOpen(next) {
  const { data, error } = await sb.from('booking_config')
    .update({ is_open: next, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select();
  if (error) { toast('Erreur : ' + error.message, '#e53935'); return false; }
  if (!data || data.length === 0) {
    toast('Modification refusée — droits administrateur requis.', '#e53935');
    return false;
  }
  cache.bookingConfig = data[0];
  refreshBookingToggle();
  return true;
}

// Bascule ouvert/fermé (utilisé par le bouton header ET l'interrupteur de la modale)
async function toggleBookingOpen() {
  await loadBookingConfig();
  const open = cache.bookingConfig ? cache.bookingConfig.is_open : true;
  const next = !open;
  if (!next && !confirm('Fermer les réservations en ligne ? Les clients ne pourront plus réserver via le lien public.')) {
    return;
  }
  if (await setBookingOpen(next)) {
    toast(next ? 'Réservations en ligne rouvertes' : 'Réservations en ligne fermées',
          next ? '#0d9e6e' : '#f59e0b');
  }
}

document.getElementById('btnBookingToggle').addEventListener('click', toggleBookingOpen);

// ----- Modale de réglages (horaires + capacité) -----
const bookingSettingsModal = document.getElementById('bookingSettingsModal');
function closeBookingSettings() { bookingSettingsModal.classList.remove('show'); }
document.getElementById('btnBookingSettings').addEventListener('click', async () => {
  await loadBookingConfig();
  const c = cache.bookingConfig || {};
  document.getElementById('bs-open').value     = Number.isFinite(c.open_hour)    ? c.open_hour    : 10;
  document.getElementById('bs-close').value    = Number.isFinite(c.close_hour)   ? c.close_hour   : 19;
  document.getElementById('bs-step').value     = String(Number.isFinite(c.slot_minutes) ? c.slot_minutes : 60);
  document.getElementById('bs-capacity').value = Number.isFinite(c.capacity)     ? c.capacity     : 1;
  await loadClosedDays();
  const t = new Date();
  bscYear = t.getFullYear(); bscMonth = t.getMonth();
  renderClosedDow();
  renderClosedCal();
  renderClosedDays();
  bookingSettingsModal.classList.add('show');
});
document.getElementById('bsClose').addEventListener('click', closeBookingSettings);
document.getElementById('bsCancel')?.addEventListener('click', closeBookingSettings);
bookingSettingsModal.addEventListener('click', (e) => { if (e.target === bookingSettingsModal) closeBookingSettings(); });

guardedSubmit(document.getElementById('formBookingSettings'), async (ev) => {
  ev.preventDefault();
  const open  = parseInt(document.getElementById('bs-open').value, 10);
  const close = parseInt(document.getElementById('bs-close').value, 10);
  const step  = parseInt(document.getElementById('bs-step').value, 10);
  const cap   = parseInt(document.getElementById('bs-capacity').value, 10);
  if (!(open >= 0 && open <= 23) || !(close >= 1 && close <= 24) || close <= open) {
    toast("Horaires invalides (l'ouverture doit précéder la fermeture)", '#e53935'); return;
  }
  if ((close - open) * 60 < step) { toast('La plage horaire est plus courte qu’un créneau', '#e53935'); return; }
  if (!(cap >= 1)) { toast('Capacité invalide', '#e53935'); return; }
  const { data, error } = await sb.from('booking_config')
    .update({ open_hour: open, close_hour: close, slot_minutes: step, capacity: cap, updated_at: new Date().toISOString() })
    .eq('id', true)
    .select();
  if (error) { toast('Erreur : ' + error.message, '#e53935'); return; }
  if (!data || data.length === 0) { toast('Modification refusée — droits administrateur requis.', '#e53935'); return; }
  cache.bookingConfig = data[0];
  closeBookingSettings();
  toast('Réglages enregistrés', '#0d9e6e');
});

function renderReservationsList() {
  const period  = document.getElementById('r-period').value;
  const statut  = document.getElementById('r-statut').value;
  const q       = (document.getElementById('r-search').value || '').toLowerCase().trim();
  const from    = document.getElementById('r-from').value;
  const to      = document.getElementById('r-to').value;
  const tbody   = document.getElementById('resaList');
  const empty   = document.getElementById('resaEmpty');

  const today = todayYmd();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7);

  let list = cache.reservations.slice();
  // Filtre date "Du / au" prend priorité s'il est renseigné
  if (from || to) {
    if (from) list = list.filter(r => r.date_prevue >= from);
    if (to)   list = list.filter(r => r.date_prevue <= to);
  } else if (period === 'today') list = list.filter(r => r.date_prevue === today);
  else if (period === 'week') list = list.filter(r => r.date_prevue >= ymd(weekAgo) && r.date_prevue <= ymd(weekAhead));
  else if (period === 'upcoming') list = list.filter(r => r.date_prevue >= today && r.statut === 'prevu');
  if (statut) list = list.filter(r => r.statut === statut);
  if (q) {
    list = list.filter(r => {
      const cl = clientLabel(r).toLowerCase();
      const veh = vehiculeLabel(r).toLowerCase();
      return cl.includes(q) || veh.includes(q);
    });
  }

  if (list.length === 0) {
    tbody.innerHTML = ''; empty.style.display = 'block';
    renderPager('resaPager', 'resa', 0, 1, 1, renderReservationsList);
    return;
  }
  empty.style.display = 'none';

  const { slice, page, totalPages, total } = paginate(list, 'resa');
  tbody.innerHTML = slice.map(r => {
    const canDelete = isAdmin();
    const heure = (r.heure_prevue || '').slice(0,5);
    const online = r.source === 'public'
      ? ' <span class="resa-online" title="Réservation faite en ligne par le client">🌐 en ligne</span>'
      : '';
    return `
      <tr>
        <td>${fmtDate(r.date_prevue)}</td>
        <td>${heure}</td>
        <td>${escapeHtml(clientLabel(r))}${online}</td>
        <td>${escapeHtml(vehiculeLabel(r))}</td>
        <td>${escapeHtml(r.type_lavage || '—')}</td>
        <td>${r.montant_estime ? fmt(r.montant_estime) : '—'}</td>
        <td><span class="statut-pill statut-${r.statut}">${statutLabel(r.statut)}</span></td>
        <td class="resa-actions">
          ${r.statut === 'prevu' ? `<button class="btn-mini btn-ok" data-act="arrive" data-id="${r.id}" title="Marquer arrivé">✓</button>` : ''}
          ${r.statut === 'prevu' && resaClientPhone(r) ? `<button class="btn-mini btn-wa" data-act="wa" data-id="${r.id}" title="Envoyer la confirmation au client sur WhatsApp">📲</button>` : ''}
          ${r.statut === 'prevu' ? `<button class="btn-mini btn-edit" data-act="edit" data-id="${r.id}" title="Modifier">✎</button>` : ''}
          ${r.statut === 'prevu' ? `<button class="btn-mini btn-cancel" data-act="annuler" data-id="${r.id}" title="Annuler">⊘</button>` : ''}
          ${canDelete ? `<button class="btn-mini btn-del" data-act="del" data-id="${r.id}" title="Supprimer">✕</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('button[data-act]').forEach(b => {
    b.addEventListener('click', () => onResaAction(b.dataset.act, b.dataset.id));
  });

  renderPager('resaPager', 'resa', total, page, totalPages, renderReservationsList);
}

document.getElementById('r-period').addEventListener('change', withPageReset('resa', renderReservationsList));
document.getElementById('r-statut').addEventListener('change', withPageReset('resa', renderReservationsList));
document.getElementById('r-search').addEventListener('input', withPageReset('resa', renderReservationsList));
document.getElementById('r-from').addEventListener('change', withPageReset('resa', renderReservationsList));
document.getElementById('r-to').addEventListener('change', withPageReset('resa', renderReservationsList));
document.getElementById('r-reset').addEventListener('click', () => {
  pagers.resa = 1;
  document.getElementById('r-period').value = 'week';
  document.getElementById('r-statut').value = '';
  document.getElementById('r-search').value = '';
  document.getElementById('r-from').value = '';
  document.getElementById('r-to').value = '';
  renderReservationsList();
});
document.getElementById('btnNewResa').addEventListener('click', () => openResaModal(null));

// Lien public de réservation à envoyer aux clients (reservation.html à la racine du site)
document.getElementById('btnBookingLink').addEventListener('click', async () => {
  const url = new URL('reservation.html', window.location.href).href;
  try {
    await navigator.clipboard.writeText(url);
    toast('Lien de réservation copié — collez-le dans WhatsApp/SMS', '#0d9e6e');
  } catch {
    prompt('Copiez le lien de réservation à envoyer au client :', url);
  }
});

async function onResaAction(action, id) {
  const r = cache.reservations.find(x => x.id === id);
  if (!r) return;
  if (action === 'edit') return openResaModal(id);
  if (action === 'wa') {
    const link = resaWaLink(r);
    if (!link) { toast('Aucun numéro de téléphone pour ce client', '#e53935'); return; }
    window.open(link, '_blank');
    return;
  }
  if (action === 'annuler') {
    if (!confirm('Annuler cette réservation ?')) return;
    const ok = await DB.updateReservation(id, { statut: 'annule' });
    if (ok) { renderReservationsList(); updateResaBadge(); refreshDashResaToday(); toast('Réservation annulée', '#f59e0b'); }
    return;
  }
  if (action === 'del') {
    if (!confirm('Supprimer définitivement cette réservation ?')) return;
    const ok = await DB.delReservation(id);
    if (ok) { renderReservationsList(); updateResaBadge(); refreshDashResaToday(); toast('Réservation supprimée', '#e53935'); }
    return;
  }
  if (action === 'arrive') {
    await convertResaToEntree(r);
  }
}

async function convertResaToEntree(r) {
  // L'entrée est datée du moment réel d'arrivée, pas du créneau prévu :
  // sinon une résa marquée "arrivé" en retard fausse le CA du jour.
  const now = new Date();
  // Téléphone : depuis le snapshot résa, sinon depuis la fiche client liée
  let telephone = r.client_telephone || null;
  if (!telephone && r.client_id) {
    const c = cache.clients.find(x => x.id === r.client_id);
    if (c) telephone = c.telephone || null;
  }
  const row = {
    date: todayYmd(),
    heure: now.toTimeString().slice(0,5),
    vehicule: r.vehicule_type || 'Voiture',
    type: r.type_lavage || 'Lavage simple',
    montant: Number(r.montant_estime || 0),
    telephone: telephone,
    notes: r.notes || null,
    client_id: r.client_id || null,
    vehicule_id: r.vehicule_id || null,
  };
  // Si on a un téléphone mais pas de client rattaché → tenter résolution
  if (telephone && !row.client_id) {
    const { data } = await sb.from('clients').select('id').eq('telephone', telephone).limit(1);
    if (data && data[0]) row.client_id = data[0].id;
  }
  // Demander confirmation du montant si pas estimé
  if (!row.montant) {
    const v = prompt('Montant facturé (FCFA) ?', '');
    if (v === null) return;
    row.montant = Number(v) || 0;
  }
  const saved = await DB.addEntree(row);
  if (!saved) return;
  await DB.updateReservation(r.id, { statut: 'arrive', entree_id: saved.id });
  renderReservationsList();
  updateResaBadge();
  refreshDashResaToday();
  toast('Client arrivé — lavage enregistré');
}

// ----- Modal réservation -----
function openResaModal(id) {
  editingResaId = id;
  document.getElementById('resaModalTitle').textContent = id ? 'Modifier la réservation' : 'Nouvelle réservation';
  const f = document.getElementById('formResa');
  f.reset();
  document.getElementById('r-id').value = id || '';
  document.getElementById('r-client-id').value = '';
  document.getElementById('r-vehicule-id').value = '';
  document.getElementById('r-date').value = '';
  document.getElementById('r-heure').value = '';
  document.getElementById('r-client-suggest').innerHTML = '';
  document.getElementById('r-client-selected').innerHTML = '';

  renderResaDow();
  const t = new Date(); t.setHours(0,0,0,0);
  resaCalYear = t.getFullYear();
  resaCalMonth = t.getMonth();

  if (id) {
    const r = cache.reservations.find(x => x.id === id);
    if (!r) return;
    document.getElementById('r-type').value          = r.type_lavage || 'Lavage simple';
    document.getElementById('r-montant').value       = r.montant_estime || '';
    document.getElementById('r-notes').value         = r.notes || '';
    document.getElementById('r-vehicule-type').value = r.vehicule_type || 'Voiture';
    document.getElementById('r-date').value          = r.date_prevue || '';
    document.getElementById('r-heure').value         = (r.heure_prevue || '').slice(0,5);
    if (r.date_prevue) {
      const d = new Date(r.date_prevue + 'T00:00:00');
      resaCalYear = d.getFullYear(); resaCalMonth = d.getMonth();
    }
    if (r.client_id) {
      const c = cache.clients.find(x => x.id === r.client_id);
      document.getElementById('r-client-id').value   = r.client_id;
      document.getElementById('r-vehicule-id').value = r.vehicule_id || '';
      if (c) {
        document.getElementById('r-client-nom').value       = c.nom || '';
        document.getElementById('r-client-telephone').value = c.telephone || '';
        showSelectedClient(c, r.vehicule_id);
      }
    } else {
      document.getElementById('r-client-nom').value       = r.client_nom || '';
      document.getElementById('r-client-telephone').value = r.client_telephone || '';
    }
  }

  renderResaCal();
  const d0 = document.getElementById('r-date').value;
  if (d0) renderResaSlots(d0);
  else resetResaSlots();
  resaModal.classList.add('show');
}

// ----- Calendrier + créneaux de la modale -----
function renderResaDow() {
  document.getElementById('r-cal-dow').innerHTML = RESA_DOW.map(d => `<div class="resa-cal-dow">${d}</div>`).join('');
}

function renderResaCal() {
  const today = new Date(); today.setHours(0,0,0,0);
  document.getElementById('r-cal-month').textContent = `${RESA_MONTHS[resaCalMonth]} ${resaCalYear}`;
  document.getElementById('r-cal-prev').disabled = (resaCalYear === today.getFullYear() && resaCalMonth === today.getMonth());
  const first = new Date(resaCalYear, resaCalMonth, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(resaCalYear, resaCalMonth + 1, 0).getDate();
  const selected = document.getElementById('r-date').value;
  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="resa-cal-day empty"></div>';
  for (let d = 1; d <= days; d++) {
    const date = new Date(resaCalYear, resaCalMonth, d);
    const key = ymd(date);
    const isPast = date < today;
    const isClosed = closedDaysSet.has(key);
    const blocked = isPast || isClosed;
    const cls = ['resa-cal-day'];
    if (isPast) cls.push('past');
    if (isClosed) cls.push('off');
    if (date.getTime() === today.getTime()) cls.push('today');
    if (key === selected) cls.push('selected');
    const title = isClosed ? ' title="Jour fermé"' : '';
    cells += `<div class="${cls.join(' ')}"${title} ${blocked ? '' : `data-date="${key}"`}>${d}</div>`;
  }
  const grid = document.getElementById('r-cal-grid');
  grid.innerHTML = cells;
  grid.querySelectorAll('[data-date]').forEach(el => {
    el.addEventListener('click', () => selectResaDate(el.dataset.date));
  });
}

function selectResaDate(key) {
  document.getElementById('r-date').value = key;
  document.getElementById('r-heure').value = '';
  renderResaCal();
  renderResaSlots(key);
}

function resetResaSlots() {
  document.getElementById('r-slots').innerHTML = '';
  const hint = document.getElementById('r-slots-hint');
  hint.textContent = "Sélectionnez d'abord une date.";
  hint.style.display = '';
}

function renderResaSlots(dateStr) {
  // Jour fermé (off / férié) → aucun créneau
  if (closedDaysSet.has(dateStr)) {
    document.getElementById('r-slots').innerHTML = '';
    const h = document.getElementById('r-slots-hint');
    h.textContent = 'Jour fermé (off / férié) — aucun créneau.';
    h.style.display = '';
    return;
  }
  const cfg = bookingCfg();
  const startMin = cfg.open * 60, endMin = cfg.close * 60;
  const step = Math.max(cfg.step, 5), cap = Math.max(cfg.cap, 1);
  const todayStr = todayYmd();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const slots = [];
  for (let m = startMin; m <= endMin - step; m += step) {
    if (dateStr === todayStr && m <= nowMin) continue;
    const t = `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;
    const count = cache.reservations.filter(r =>
      r.id !== editingResaId &&
      (r.statut === 'prevu' || r.statut === 'arrive') &&
      r.date_prevue === dateStr &&
      (r.heure_prevue || '').slice(0,5) === t
    ).length;
    if (count >= cap) continue;
    slots.push(t);
  }
  // En édition : garder le créneau actuel même s'il est passé / complet par lui-même
  const cur = document.getElementById('r-heure').value;
  if (cur && !slots.includes(cur)) { slots.push(cur); slots.sort(); }

  const wrap = document.getElementById('r-slots');
  const hint = document.getElementById('r-slots-hint');
  if (slots.length === 0) {
    wrap.innerHTML = '';
    hint.textContent = 'Aucun créneau disponible ce jour-là.';
    hint.style.display = '';
    return;
  }
  hint.style.display = 'none';
  wrap.innerHTML = slots.map(h =>
    `<button type="button" class="resa-slot ${h === cur ? 'selected' : ''}" data-h="${h}">${h}</button>`).join('');
  wrap.querySelectorAll('.resa-slot').forEach(b => {
    b.addEventListener('click', () => {
      document.getElementById('r-heure').value = b.dataset.h;
      wrap.querySelectorAll('.resa-slot').forEach(x => x.classList.toggle('selected', x === b));
    });
  });
}

document.getElementById('r-cal-prev').addEventListener('click', () => {
  if (document.getElementById('r-cal-prev').disabled) return;
  resaCalMonth--; if (resaCalMonth < 0) { resaCalMonth = 11; resaCalYear--; }
  renderResaCal();
});
document.getElementById('r-cal-next').addEventListener('click', () => {
  resaCalMonth++; if (resaCalMonth > 11) { resaCalMonth = 0; resaCalYear++; }
  renderResaCal();
});

function closeResaModal() {
  resaModal.classList.remove('show');
  editingResaId = null;
}
document.getElementById('resaClose').addEventListener('click', closeResaModal);
resaModal.querySelector('[data-modal-cancel]').addEventListener('click', closeResaModal);
resaModal.addEventListener('click', (e) => { if (e.target === resaModal) closeResaModal(); });

// Recherche client live (debounced) sur les champs Nom et Téléphone
let resaSearchTimer = null;
function resaClientSearch(ev) {
  clearTimeout(resaSearchTimer);
  const q = ev.target.value.trim().toLowerCase();
  // Retaper délie le client précédemment sélectionné
  document.getElementById('r-client-id').value = '';
  document.getElementById('r-vehicule-id').value = '';
  document.getElementById('r-client-selected').innerHTML = '';
  const sug = document.getElementById('r-client-suggest');
  if (q.length < 2) { sug.innerHTML = ''; return; }
  resaSearchTimer = setTimeout(() => {
    const matches = [];
    cache.clients.forEach(c => {
      const vehs = cache.vehicules.filter(v => v.client_id === c.id);
      const hit = c.nom.toLowerCase().includes(q)
        || (c.telephone || '').toLowerCase().includes(q)
        || vehs.some(v => v.plaque.toLowerCase().includes(q));
      if (hit) matches.push(c);
    });
    if (matches.length === 0) { sug.innerHTML = ''; return; }
    sug.innerHTML = matches.slice(0, 6).map((c, i) => `
      <div class="resa-suggest-item" data-i="${i}">
        <b>${escapeHtml(c.nom)}</b>
        ${c.telephone ? '· ' + escapeHtml(c.telephone) : ''}
      </div>`).join('');
    sug.querySelectorAll('.resa-suggest-item').forEach(el => {
      el.addEventListener('click', () => pickResaClient(matches[Number(el.dataset.i)]));
    });
  }, 200);
}
document.getElementById('r-client-nom').addEventListener('input', resaClientSearch);
document.getElementById('r-client-telephone').addEventListener('input', resaClientSearch);

function pickResaClient(client) {
  document.getElementById('r-client-id').value = client.id;
  document.getElementById('r-client-nom').value = client.nom || '';
  document.getElementById('r-client-telephone').value = client.telephone || '';
  document.getElementById('r-client-suggest').innerHTML = '';
  const vehs = cache.vehicules.filter(v => v.client_id === client.id);
  showSelectedClient(client, vehs.length === 1 ? vehs[0].id : null);
}

function showSelectedClient(client, vehiculeId) {
  const vehs = cache.vehicules.filter(v => v.client_id === client.id);
  const sel = document.getElementById('r-client-selected');
  const vehOpts = vehs.length
    ? `<label>Véhicule :
        <select id="r-veh-pick">
          <option value="">— sans véhicule —</option>
          ${vehs.map(v => `<option value="${v.id}" ${v.id === vehiculeId ? 'selected' : ''}>${escapeHtml(v.plaque)}${v.marque || v.modele ? ' · ' + escapeHtml([v.marque, v.modele].filter(Boolean).join(' ')) : ''}</option>`).join('')}
        </select></label>`
    : '<em>Pas de véhicule enregistré pour ce client.</em>';
  sel.innerHTML = `
    <div class="resa-selected-card">
      <b>✓ ${escapeHtml(client.nom)}</b>
      ${client.telephone ? '<span>· ' + escapeHtml(client.telephone) + '</span>' : ''}
      <button type="button" class="btn-mini" id="r-clear-client">Changer</button>
      <div class="resa-veh-pick">${vehOpts}</div>
    </div>`;
  document.getElementById('r-clear-client').addEventListener('click', () => {
    document.getElementById('r-client-id').value = '';
    document.getElementById('r-vehicule-id').value = '';
    sel.innerHTML = '';
  });
  const pick = document.getElementById('r-veh-pick');
  if (pick) pick.addEventListener('change', () => {
    document.getElementById('r-vehicule-id').value = pick.value;
  });
}

guardedSubmit(document.getElementById('formResa'), async (ev) => {
  ev.preventDefault();
  const dateVal  = document.getElementById('r-date').value;
  const heureVal = document.getElementById('r-heure').value;
  if (!dateVal)  { toast('Choisis une date dans le calendrier', '#e53935'); return; }
  if (!heureVal) { toast('Choisis un créneau', '#e53935'); return; }

  const nom = document.getElementById('r-client-nom').value.trim();
  if (!nom) { toast('Nom du client requis', '#e53935'); return; }
  const telephone = document.getElementById('r-client-telephone').value.trim() || null;

  const row = {
    date_prevue:  dateVal,
    heure_prevue: heureVal,
    type_lavage:  document.getElementById('r-type').value,
    montant_estime: Number(document.getElementById('r-montant').value) || null,
    notes:        document.getElementById('r-notes').value.trim() || null,
  };

  // 1) Refuser une date passée (filet ; le calendrier l'empêche déjà)
  if (dateVal < todayYmd()) {
    toast('Impossible de réserver à une date passée', '#e53935');
    return;
  }

  // 2) Refuser si le créneau est complet (capacité atteinte)
  const cap = Math.max(bookingCfg().cap, 1);
  const taken = cache.reservations.filter(r =>
    r.id !== editingResaId &&
    (r.statut === 'prevu' || r.statut === 'arrive') &&
    r.date_prevue === dateVal &&
    (r.heure_prevue || '').slice(0,5) === heureVal
  ).length;
  if (taken >= cap) {
    toast(`Créneau complet à ${heureVal} (${cap} max)`, '#e53935');
    return;
  }

  // 3) Déterminer le client : lié → existant par téléphone → sinon création auto
  if (!cache.clientsLoaded) await DB.loadClients();
  let clientId = document.getElementById('r-client-id').value || null;
  if (!clientId && telephone) {
    const existing = cache.clients.find(c => c.telephone === telephone);
    if (existing) clientId = existing.id;
  }
  if (!clientId) {
    const newClient = await DB.addClient({ type: 'particulier', nom, telephone });
    if (!newClient) return; // erreur déjà signalée par addClient
    clientId = newClient.id;
    toast('Nouvelle fiche client créée', '#0d9e6e');
  }

  const c = cache.clients.find(x => x.id === clientId) || null;
  row.client_id        = clientId;
  row.vehicule_id      = document.getElementById('r-vehicule-id').value || null;
  row.client_nom       = c ? c.nom : nom;
  row.client_telephone = c ? (c.telephone || null) : telephone;
  row.plaque           = null;
  row.vehicule_type    = document.getElementById('r-vehicule-type').value || null;

  let saved;
  if (editingResaId) saved = await DB.updateReservation(editingResaId, row);
  else {
    row.created_by = session.user.id;
    saved = await DB.addReservation(row);
  }
  if (!saved) return;
  const wasEdit = !!editingResaId;
  closeResaModal();
  renderReservationsList();
  updateResaBadge();
  refreshDashResaToday();
  if (wasEdit) toast('Réservation mise à jour');
  else if (telephone) toast('Réservation enregistrée — 📲 confirmez le client sur WhatsApp');
  else toast('Réservation enregistrée');
});

// ----- Widget dashboard : RDV du jour -----
function refreshDashResaToday() {
  const tbody = document.getElementById('dashResaToday');
  const empty = document.getElementById('dashResaEmpty');
  if (!tbody) return;
  const today = todayYmd();
  const list = cache.reservations
    .filter(r => r.date_prevue === today && r.statut !== 'annule')
    .sort((a, b) => (a.heure_prevue || '').localeCompare(b.heure_prevue || ''));
  if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = list.map(r => `
    <tr>
      <td>${(r.heure_prevue || '').slice(0,5)}</td>
      <td>${escapeHtml(clientLabel(r))}</td>
      <td>${escapeHtml(vehiculeLabel(r))}</td>
      <td>${escapeHtml(r.type_lavage || '—')}</td>
      <td><span class="statut-pill statut-${r.statut}">${statutLabel(r.statut)}</span></td>
      <td>${r.statut === 'prevu' ? `<button class="btn-mini btn-ok" data-dash-arrive="${r.id}" title="Marquer arrivé">✓</button>` : ''}</td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-dash-arrive]').forEach(b => {
    b.addEventListener('click', async () => {
      const r = cache.reservations.find(x => x.id === b.dataset.dashArrive);
      if (r) await convertResaToEntree(r);
    });
  });
}

