// ===== SUPABASE =====
const SUPABASE_URL = 'https://hajnttnlyoftxgqsjyjl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_maWkeTvWo7H3aQzFwzyp8w_8OvgzSXf';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// État session + rôle courant
const session = { user: null, role: null };
const isPatron = () => session.role === 'patron';

// In-memory cache (rempli au chargement, mis à jour après chaque mutation)
const cache = { entrees: [], sorties: [], clients: [], vehicules: [], reservations: [], clientsLoaded: false };

const DB = {
  getEntrees: () => cache.entrees,
  getSorties: () => cache.sorties,

  async loadAll() {
    const [
      { data: e,  error: ee },
      { data: s,  error: se },
      { data: r,  error: re },
    ] = await Promise.all([
      sb.from('entrees').select('*').order('date', { ascending: false }).order('heure', { ascending: false }),
      sb.from('sorties').select('*').order('date', { ascending: false }),
      sb.from('reservations').select('*').order('date_prevue', { ascending: true }).order('heure_prevue', { ascending: true }),
    ]);
    if (ee) console.error('entrees:', ee);
    if (se) console.error('sorties:', se);
    if (re) console.error('reservations:', re);
    cache.entrees      = e || [];
    cache.sorties      = s || [];
    cache.reservations = r || [];
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
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
    cache.clients.push(data);
    cache.clients.sort((a, b) => a.nom.localeCompare(b.nom));
    return data;
  },

  async updateClient(id, row) {
    const { data, error } = await sb.from('clients').update(row).eq('id', id).select().single();
    if (error) { toast('Erreur : ' + error.message, '#e53935'); return null; }
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
    if (btn.dataset.page === 'historique') renderHistorique();
    closeSidebar();
  });
});

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
let chartCA = null, chartTypes = null, chartCategories = null, chartVehicules = null, chartHeures = null;

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
  renderChartCategories(sorties);
  renderChartVehicules(entrees);
  renderChartHeures(entrees);
  renderRecentTable();
}

function periodKey(dateStr, heure, period) {
  const d = new Date(dateStr);
  if (period === 'today') return heure ? heure.slice(0,2) + 'h' : '?';
  if (period === 'week' || period === 'month') return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
}

function renderChartCA(entrees, sorties, period) {
  const ctx = document.getElementById('chartCA').getContext('2d');
  if (chartCA) chartCA.destroy();

  const caByKey = {};
  entrees.forEach(e => {
    const key = periodKey(e.date, e.heure, period);
    caByKey[key] = (caByKey[key] || 0) + Number(e.montant);
  });
  const depByKey = {};
  sorties.forEach(s => {
    const key = periodKey(s.date, null, period);
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

  chartTypes = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: Object.keys(types),
      datasets: [{
        data: Object.values(types),
        backgroundColor: ['#1a73e8','#0d9e6e','#f59e0b','#e53935','#8b5cf6'],
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
  document.getElementById('e-date').value = now.toISOString().slice(0, 10);
  document.getElementById('e-heure').value = now.toTimeString().slice(0, 5);
  document.getElementById('s-date').value = now.toISOString().slice(0, 10);
}
setDefaultDateTime();

document.getElementById('formEntree').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const plaque = (document.getElementById('e-plaque').value || '').trim().toUpperCase();
  let clientId   = document.getElementById('e-client-id').value || null;
  let vehiculeId = document.getElementById('e-vehicule-id').value || null;

  // Si on a une plaque mais pas de véhicule rattaché, on cherche en base
  // (au cas où le cache local ne soit pas à jour)
  if (plaque && !vehiculeId) {
    const { data } = await sb.from('vehicules').select('id, client_id').eq('plaque', plaque).maybeSingle();
    if (data) { vehiculeId = data.id; clientId = data.client_id; }
  }

  const row = {
    date: document.getElementById('e-date').value,
    heure: document.getElementById('e-heure').value,
    vehicule: document.getElementById('e-vehicule').value,
    type: document.getElementById('e-type').value,
    montant: Number(document.getElementById('e-montant').value),
    plaque: plaque || null,
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
  renderEntreesList();
  toast('Lavage enregistré !');
});

// Auto-rattachement par plaque (debounced)
let plaqueLookupTimer = null;
document.getElementById('e-plaque').addEventListener('input', (ev) => {
  clearTimeout(plaqueLookupTimer);
  const hint = document.getElementById('e-client-hint');
  const clientHidden = document.getElementById('e-client-id');
  const vehHidden = document.getElementById('e-vehicule-id');
  const plaque = ev.target.value.trim().toUpperCase();
  clientHidden.value = '';
  vehHidden.value = '';
  hint.innerHTML = '';
  if (plaque.length < 3) return;
  plaqueLookupTimer = setTimeout(async () => {
    const { data } = await sb
      .from('vehicules')
      .select('id, client_id, marque, modele, clients(nom, type, telephone)')
      .eq('plaque', plaque)
      .maybeSingle();
    if (data && data.clients) {
      clientHidden.value = data.client_id;
      vehHidden.value = data.id;
      const c = data.clients;
      const veh = [data.marque, data.modele].filter(Boolean).join(' ');
      hint.innerHTML = `<span class="hint-ok">✓ Client connu : <b>${c.nom}</b>${c.telephone ? ' · ' + c.telephone : ''}${veh ? ' · ' + veh : ''}</span>`;
    } else {
      hint.innerHTML = `<span class="hint-new">Plaque inconnue — sera enregistrée sans client. <a href="#" id="hint-create-client">Créer une fiche ?</a></span>`;
      document.getElementById('hint-create-client').addEventListener('click', (e) => {
        e.preventDefault();
        openClientModal(null, { plaque });
      });
    }
  }, 350);
});

function renderEntreesList() {
  const list = DB.getEntrees().slice(0, 20);
  const tbody = document.getElementById('entreesList');
  const canDelete = isPatron();
  tbody.innerHTML = list.map(e => `
    <tr>
      <td>${fmtDate(e.date)} ${e.heure || ''}</td>
      <td>${e.vehicule}</td>
      <td>${e.type}</td>
      <td>${e.plaque || '—'}</td>
      <td class="montant-entree">+${fmt(e.montant)}</td>
      <td>${canDelete ? `<button class="btn-edit" onclick="openEditEntree('${e.id}')" title="Modifier">✎</button><button class="btn-del" onclick="delEntree('${e.id}')" title="Supprimer">✕</button>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="empty-state">Aucun lavage enregistré</td></tr>';
}

async function delEntree(id) {
  if (!confirm('Supprimer cette entrée ?')) return;
  const ok = await DB.delEntree(id);
  if (!ok) return;
  renderEntreesList();
  toast('Entrée supprimée', '#e53935');
}

// ===== SORTIES =====
document.getElementById('formSortie').addEventListener('submit', async (ev) => {
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
  renderSortiesList();
  toast('Dépense enregistrée !', '#f59e0b');
});

function renderSortiesList() {
  const list = DB.getSorties().slice(0, 20);
  const tbody = document.getElementById('sortiesList');
  tbody.innerHTML = list.map(s => `
    <tr>
      <td>${fmtDate(s.date)}</td>
      <td>${s.categorie}</td>
      <td>${s.description || '—'}</td>
      <td class="montant-sortie">-${fmt(s.montant)}</td>
      <td><button class="btn-edit" onclick="openEditSortie('${s.id}')" title="Modifier">✎</button><button class="btn-del" onclick="delSortie('${s.id}')" title="Supprimer">✕</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-state">Aucune dépense enregistrée</td></tr>';
}

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
  document.getElementById('ed-plaque').value = e.plaque || '';
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

formEditEntree.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const id = document.getElementById('ed-id').value;
  const row = {
    date: document.getElementById('ed-date').value,
    heure: document.getElementById('ed-heure').value,
    vehicule: document.getElementById('ed-vehicule').value,
    type: document.getElementById('ed-type').value,
    montant: Number(document.getElementById('ed-montant').value),
    plaque: document.getElementById('ed-plaque').value || null,
    notes: document.getElementById('ed-notes').value || null,
  };
  const saved = await DB.updateEntree(id, row);
  if (!saved) return;
  closeEditModal();
  renderEntreesList();
  if (document.getElementById('page-dashboard').classList.contains('active')) renderDashboard();
  if (document.getElementById('page-historique').classList.contains('active')) renderHistorique();
  toast('Lavage mis à jour !');
});

formEditSortie.addEventListener('submit', async (ev) => {
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
  if (document.getElementById('page-historique').classList.contains('active')) renderHistorique();
  toast('Dépense mise à jour !', '#f59e0b');
});

// ===== HISTORIQUE =====
function getFilters() {
  return {
    kind: document.getElementById('f-kind').value,
    from: document.getElementById('f-from').value,
    to: document.getElementById('f-to').value,
    vehicule: document.getElementById('f-vehicule').value,
    plaque: document.getElementById('f-plaque').value.trim().toLowerCase(),
    categorie: document.getElementById('f-categorie').value,
  };
}

function applyFilters(ops, f) {
  const entreeFilterActive = f.vehicule || f.plaque;
  const sortieFilterActive = f.categorie;
  return ops.filter(op => {
    if (f.kind && op.kind !== f.kind) return false;
    if (f.from && op.date < f.from) return false;
    if (f.to && op.date > f.to) return false;
    if (op.kind === 'entree') {
      if (sortieFilterActive) return false;
      if (f.vehicule && op.vehicule !== f.vehicule) return false;
      if (f.plaque && !(op.plaque || '').toLowerCase().includes(f.plaque)) return false;
    } else {
      if (entreeFilterActive) return false;
      if (f.categorie && op.categorie !== f.categorie) return false;
    }
    return true;
  });
}

function updateFilterVisibility() {
  const kind = document.getElementById('f-kind').value;
  document.querySelectorAll('.filter-entree-only').forEach(el => {
    el.style.display = (kind === '' || kind === 'entree') ? '' : 'none';
  });
  document.querySelectorAll('.filter-sortie-only').forEach(el => {
    el.style.display = (kind === '' || kind === 'sortie') ? '' : 'none';
  });
}

function renderHistorique() {
  updateFilterVisibility();
  const f = getFilters();
  const all = [
    ...DB.getEntrees().map(e => ({ ...e, kind: 'entree' })),
    ...DB.getSorties().map(s => ({ ...s, kind: 'sortie' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = applyFilters(all, f);

  // Résumé
  const totalEntrees = filtered.filter(o => o.kind === 'entree').reduce((a, o) => a + Number(o.montant), 0);
  const totalSorties = filtered.filter(o => o.kind === 'sortie').reduce((a, o) => a + Number(o.montant), 0);
  const summary = document.getElementById('filterSummary');
  if (filtered.length > 0) {
    summary.textContent = `${filtered.length} résultat${filtered.length > 1 ? 's' : ''} · Entrées : ${fmt(totalEntrees)} · Dépenses : ${fmt(totalSorties)}`;
  } else {
    summary.textContent = '';
  }

  const tbody = document.getElementById('historiqueTable');
  const empty = document.getElementById('historiqueEmpty');
  if (filtered.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = filtered.map(op => `
      <tr>
        <td>${fmtDate(op.date)}</td>
        <td><span class="badge badge-${op.kind}">${op.kind === 'entree' ? 'Lavage' : 'Dépense'}</span></td>
        <td>${op.kind === 'entree' ? (op.vehicule + ' – ' + op.type + (op.plaque ? ' [' + op.plaque + ']' : '')) : (op.categorie + (op.description ? ' – ' + op.description : ''))}</td>
        <td class="montant-${op.kind}">${op.kind === 'entree' ? '+' : '-'}${fmt(op.montant)}</td>
      </tr>
    `).join('');
  }
}

['f-kind','f-from','f-to','f-vehicule','f-plaque','f-categorie'].forEach(id => {
  document.getElementById(id).addEventListener('input', renderHistorique);
  document.getElementById(id).addEventListener('change', renderHistorique);
});

document.getElementById('f-reset').addEventListener('click', () => {
  ['f-kind','f-from','f-to','f-vehicule','f-plaque','f-categorie'].forEach(id => {
    document.getElementById(id).value = '';
  });
  renderHistorique();
});

// ===== EXPORT CSV =====
document.getElementById('exportBtn').addEventListener('click', () => {
  const f = getFilters();
  const all = [
    ...DB.getEntrees().map(e => ({ ...e, kind: 'entree' })),
    ...DB.getSorties().map(s => ({ ...s, kind: 'sortie' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  const filtered = applyFilters(all, f);

  if (filtered.length === 0) {
    toast('Aucune donnée à exporter', '#f59e0b');
    return;
  }

  const header = 'Date,Type,Détail,Montant (FCFA)\n';
  const rows = filtered.map(op => {
    const label = op.kind === 'entree' ? 'Lavage' : 'Dépense';
    const detail = op.kind === 'entree'
      ? `${op.vehicule} - ${op.type}${op.plaque ? ' [' + op.plaque + ']' : ''}`
      : `${op.categorie}${op.description ? ' - ' + op.description : ''}`;
    const sign = op.kind === 'entree' ? '' : '-';
    return `${op.date},${label},"${detail}",${sign}${op.montant}`;
  }).join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  const tag = f.from || f.to ? `${f.from || 'debut'}_${f.to || 'fin'}` : 'export';
  a.download = `ultrawash_${tag}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Export CSV téléchargé');
});

// ===== AUTH =====
const loginScreen = document.getElementById('loginScreen');
const formLogin = document.getElementById('formLogin');
const loginError = document.getElementById('loginError');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

function showLogin() {
  document.body.classList.remove('auth-loading', 'authed', 'role-patron', 'role-employe');
  setTimeout(() => document.getElementById('login-email')?.focus(), 50);
}

function applyRoleUI() {
  document.body.classList.remove('role-patron', 'role-employe');
  document.body.classList.add('role-' + (session.role === 'patron' ? 'patron' : 'employe'));
  document.getElementById('userEmail').textContent = session.user?.email || '';
  document.getElementById('userRole').textContent = session.role || '';
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
    .select('role')
    .eq('id', session.user.id)
    .single();
  if (error || !data) {
    console.error('Profil introuvable', error);
    await sb.auth.signOut();
    session.user = null; session.role = null;
    showLogin();
    loginError.textContent = "Aucun profil associé. Contacte l'administrateur.";
    return false;
  }
  session.role = data.role;
  return true;
}

async function startApp() {
  applyRoleUI();
  document.body.classList.remove('auth-loading');
  document.body.classList.add('authed');
  await DB.loadAll();
  // Page de démarrage selon le rôle
  if (isPatron()) {
    goToPage('dashboard');
    renderDashboard();
  } else {
    goToPage('entrees');
    renderEntreesList();
  }
  updateResaBadge();
  refreshDashResaToday();
}

formLogin.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  loginError.textContent = '';
  loginBtn.disabled = true;
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = 'Email ou mot de passe incorrect.';
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

function renderClientsList() {
  const q = (document.getElementById('c-search').value || '').toLowerCase().trim();
  const typeFilter = document.getElementById('c-filter-type').value;
  const tbody = document.getElementById('clientsList');
  const empty = document.getElementById('clientsEmpty');

  const list = cache.clients.filter(c => {
    if (typeFilter && c.type !== typeFilter) return false;
    if (!q) return true;
    if (c.nom.toLowerCase().includes(q)) return true;
    if (c.telephone && c.telephone.toLowerCase().includes(q)) return true;
    const vehs = cache.vehicules.filter(v => v.client_id === c.id);
    return vehs.some(v => v.plaque.toLowerCase().includes(q));
  });

  if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(c => {
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
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

document.getElementById('c-search').addEventListener('input', renderClientsList);
document.getElementById('c-filter-type').addEventListener('change', renderClientsList);
document.getElementById('btnNewClient').addEventListener('click', () => openClientModal(null));

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

document.getElementById('formClient').addEventListener('submit', async (ev) => {
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
        <td>${escapeHtml(e.plaque || '—')}</td>
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
let resaMode = 'existing'; // 'existing' | 'passage'

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
  } else if (r.plaque) {
    label = (label ? label + ' · ' : '') + r.plaque;
  }
  return label || '—';
}

async function renderReservationsPage() {
  // Pour la recherche client dans la modale, on lazy-load les clients aussi
  if (!cache.clientsLoaded) await DB.loadClients();
  renderReservationsList();
}

function renderReservationsList() {
  const period  = document.getElementById('r-period').value;
  const statut  = document.getElementById('r-statut').value;
  const q       = (document.getElementById('r-search').value || '').toLowerCase().trim();
  const tbody   = document.getElementById('resaList');
  const empty   = document.getElementById('resaEmpty');

  const today = todayYmd();
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7);

  let list = cache.reservations.slice();
  if (period === 'today') list = list.filter(r => r.date_prevue === today);
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

  if (list.length === 0) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  tbody.innerHTML = list.map(r => {
    const canDelete = isPatron();
    const heure = (r.heure_prevue || '').slice(0,5);
    return `
      <tr>
        <td>${fmtDate(r.date_prevue)}</td>
        <td>${heure}</td>
        <td>${escapeHtml(clientLabel(r))}</td>
        <td>${escapeHtml(vehiculeLabel(r))}</td>
        <td>${escapeHtml(r.type_lavage || '—')}</td>
        <td>${r.montant_estime ? fmt(r.montant_estime) : '—'}</td>
        <td><span class="statut-pill statut-${r.statut}">${statutLabel(r.statut)}</span></td>
        <td class="resa-actions">
          ${r.statut === 'prevu' ? `<button class="btn-mini btn-ok" data-act="arrive" data-id="${r.id}" title="Marquer arrivé">✓ Arrivé</button>` : ''}
          ${r.statut === 'prevu' ? `<button class="btn-mini btn-edit" data-act="edit" data-id="${r.id}" title="Modifier">✎</button>` : ''}
          ${r.statut === 'prevu' ? `<button class="btn-mini btn-cancel" data-act="annuler" data-id="${r.id}" title="Annuler">⊘</button>` : ''}
          ${canDelete ? `<button class="btn-mini btn-del" data-act="del" data-id="${r.id}" title="Supprimer">✕</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('button[data-act]').forEach(b => {
    b.addEventListener('click', () => onResaAction(b.dataset.act, b.dataset.id));
  });
}

document.getElementById('r-period').addEventListener('change', renderReservationsList);
document.getElementById('r-statut').addEventListener('change', renderReservationsList);
document.getElementById('r-search').addEventListener('input', renderReservationsList);
document.getElementById('btnNewResa').addEventListener('click', () => openResaModal(null));

async function onResaAction(action, id) {
  const r = cache.reservations.find(x => x.id === id);
  if (!r) return;
  if (action === 'edit') return openResaModal(id);
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
  // Construit la ligne entree à partir de la résa
  const now = new Date();
  const row = {
    date: r.date_prevue,
    heure: (r.heure_prevue || now.toTimeString().slice(0,5)).slice(0,5),
    vehicule: r.vehicule_type || 'Voiture',
    type: r.type_lavage || 'Lavage simple',
    montant: Number(r.montant_estime || 0),
    plaque: r.plaque || null,
    notes: r.notes || null,
    client_id: r.client_id || null,
    vehicule_id: r.vehicule_id || null,
  };
  // Si plaque mais pas de vehicule_id → tenter résolution
  if (row.plaque && !row.vehicule_id) {
    const { data } = await sb.from('vehicules').select('id, client_id').eq('plaque', row.plaque).maybeSingle();
    if (data) { row.vehicule_id = data.id; if (!row.client_id) row.client_id = data.client_id; }
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
  document.getElementById('r-client-suggest').innerHTML = '';
  document.getElementById('r-client-selected').innerHTML = '';
  setResaMode('existing');

  if (id) {
    const r = cache.reservations.find(x => x.id === id);
    if (!r) return;
    document.getElementById('r-date').value    = r.date_prevue;
    document.getElementById('r-heure').value   = (r.heure_prevue || '').slice(0,5);
    document.getElementById('r-type').value    = r.type_lavage || 'Lavage simple';
    document.getElementById('r-montant').value = r.montant_estime || '';
    document.getElementById('r-notes').value   = r.notes || '';
    if (r.client_id) {
      setResaMode('existing');
      const c = cache.clients.find(x => x.id === r.client_id);
      document.getElementById('r-client-id').value = r.client_id;
      document.getElementById('r-vehicule-id').value = r.vehicule_id || '';
      if (c) showSelectedClient(c, r.vehicule_id);
    } else {
      setResaMode('passage');
      document.getElementById('r-client-nom').value       = r.client_nom || '';
      document.getElementById('r-client-telephone').value = r.client_telephone || '';
      document.getElementById('r-plaque').value           = r.plaque || '';
      document.getElementById('r-vehicule-type').value    = r.vehicule_type || 'Voiture';
    }
  } else {
    // Defaults : aujourd'hui, heure prochaine
    const now = new Date();
    document.getElementById('r-date').value  = now.toISOString().slice(0,10);
    document.getElementById('r-heure').value = now.toTimeString().slice(0,5);
  }
  // Empêche la sélection d'une date passée dans le date-picker
  document.getElementById('r-date').min = todayYmd();
  resaModal.classList.add('show');
}

function closeResaModal() {
  resaModal.classList.remove('show');
  editingResaId = null;
}
document.getElementById('resaClose').addEventListener('click', closeResaModal);
resaModal.querySelector('[data-modal-cancel]').addEventListener('click', closeResaModal);
resaModal.addEventListener('click', (e) => { if (e.target === resaModal) closeResaModal(); });

function setResaMode(mode) {
  resaMode = mode;
  document.getElementById('resa-mode-existing').style.display = mode === 'existing' ? '' : 'none';
  document.getElementById('resa-mode-passage').style.display  = mode === 'passage'  ? '' : 'none';
  document.querySelectorAll('.resa-client-toggle .btn-toggle').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
}
document.querySelectorAll('.resa-client-toggle .btn-toggle').forEach(b => {
  b.addEventListener('click', () => setResaMode(b.dataset.mode));
});

// Recherche client (debounced) sur cache local
let resaSearchTimer = null;
document.getElementById('r-client-search').addEventListener('input', (ev) => {
  clearTimeout(resaSearchTimer);
  const q = ev.target.value.trim().toLowerCase();
  document.getElementById('r-client-id').value = '';
  document.getElementById('r-vehicule-id').value = '';
  document.getElementById('r-client-selected').innerHTML = '';
  const sug = document.getElementById('r-client-suggest');
  if (q.length < 2) { sug.innerHTML = ''; return; }
  resaSearchTimer = setTimeout(() => {
    const matches = [];
    cache.clients.forEach(c => {
      const vehs = cache.vehicules.filter(v => v.client_id === c.id);
      const hitNom = c.nom.toLowerCase().includes(q) || (c.telephone || '').toLowerCase().includes(q);
      const hitVeh = vehs.find(v => v.plaque.toLowerCase().includes(q));
      if (hitNom || hitVeh) matches.push({ client: c, vehicule: hitVeh || vehs[0] || null });
    });
    if (matches.length === 0) {
      sug.innerHTML = '<div class="resa-suggest-empty">Aucun client trouvé. Bascule sur "Client de passage".</div>';
      return;
    }
    sug.innerHTML = matches.slice(0, 8).map((m, i) => `
      <div class="resa-suggest-item" data-i="${i}">
        <b>${escapeHtml(m.client.nom)}</b>
        ${m.client.telephone ? '· ' + escapeHtml(m.client.telephone) : ''}
        ${m.vehicule ? '· ' + escapeHtml(m.vehicule.plaque) : ''}
      </div>`).join('');
    sug.querySelectorAll('.resa-suggest-item').forEach(el => {
      el.addEventListener('click', () => {
        const m = matches[Number(el.dataset.i)];
        document.getElementById('r-client-id').value = m.client.id;
        document.getElementById('r-vehicule-id').value = m.vehicule ? m.vehicule.id : '';
        document.getElementById('r-client-search').value = '';
        sug.innerHTML = '';
        showSelectedClient(m.client, m.vehicule ? m.vehicule.id : null);
      });
    });
  }, 200);
});

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

document.getElementById('formResa').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const row = {
    date_prevue:  document.getElementById('r-date').value,
    heure_prevue: document.getElementById('r-heure').value,
    type_lavage:  document.getElementById('r-type').value,
    montant_estime: Number(document.getElementById('r-montant').value) || null,
    notes:        document.getElementById('r-notes').value.trim() || null,
  };

  // 1) Refuser une date dans le passé (et une heure passée si c'est aujourd'hui)
  const today = todayYmd();
  if (row.date_prevue < today) {
    toast('Impossible de réserver à une date passée', '#e53935');
    return;
  }
  if (row.date_prevue === today) {
    const nowHM = new Date().toTimeString().slice(0,5);
    if (row.heure_prevue < nowHM) {
      toast(`Heure passée — il est déjà ${nowHM}`, '#e53935');
      return;
    }
  }

  // 2) Refuser un conflit de créneau (même date + même heure, statut prevu)
  const conflict = cache.reservations.find(r =>
    r.id !== editingResaId &&
    r.statut === 'prevu' &&
    r.date_prevue === row.date_prevue &&
    (r.heure_prevue || '').slice(0,5) === row.heure_prevue
  );
  if (conflict) {
    toast(`Conflit de créneau : déjà réservé à ${row.heure_prevue} pour ${clientLabel(conflict)}`, '#e53935');
    return;
  }

  if (resaMode === 'existing') {
    const cid = document.getElementById('r-client-id').value;
    if (!cid) { toast('Sélectionne un client (ou bascule sur "Client de passage")', '#e53935'); return; }
    row.client_id   = cid;
    row.vehicule_id = document.getElementById('r-vehicule-id').value || null;
    // Reset des champs passage
    row.client_nom = null; row.client_telephone = null; row.plaque = null; row.vehicule_type = null;
  } else {
    const nom = document.getElementById('r-client-nom').value.trim();
    if (!nom) { toast('Nom du client requis', '#e53935'); return; }
    const plaque = (document.getElementById('r-plaque').value || '').trim().toUpperCase() || null;

    // 3) Si la plaque saisie est déjà dans la base clients, on bascule en mode "existant"
    if (plaque) {
      // Vérif via cache local d'abord
      let veh = cache.vehicules.find(v => v.plaque === plaque);
      // Filet via Supabase (au cas où le cache n'est pas chargé)
      if (!veh) {
        const { data } = await sb.from('vehicules').select('id, client_id, plaque').eq('plaque', plaque).maybeSingle();
        if (data) veh = data;
      }
      if (veh) {
        const owner = cache.clients.find(c => c.id === veh.client_id);
        const ownerName = owner ? owner.nom : 'un client enregistré';
        if (confirm(`La plaque ${plaque} est déjà rattachée à : ${ownerName}.\nBasculer sur ce client enregistré ?`)) {
          // Bascule automatique
          if (!cache.clientsLoaded) await DB.loadClients();
          setResaMode('existing');
          document.getElementById('r-client-id').value   = veh.client_id;
          document.getElementById('r-vehicule-id').value = veh.id;
          const c = cache.clients.find(x => x.id === veh.client_id);
          if (c) showSelectedClient(c, veh.id);
          toast('Client trouvé — vérifie puis clique Enregistrer', '#1e40af');
        }
        return; // dans tous les cas, on stoppe ici (l'utilisateur valide manuellement)
      }
    }

    row.client_id   = null;
    row.vehicule_id = null;
    row.client_nom        = nom;
    row.client_telephone  = document.getElementById('r-client-telephone').value.trim() || null;
    row.plaque            = plaque;
    row.vehicule_type     = document.getElementById('r-vehicule-type').value;
  }

  let saved;
  if (editingResaId) saved = await DB.updateReservation(editingResaId, row);
  else {
    row.created_by = session.user.id;
    saved = await DB.addReservation(row);
  }
  if (!saved) return;
  closeResaModal();
  renderReservationsList();
  updateResaBadge();
  refreshDashResaToday();
  toast(editingResaId ? 'Réservation mise à jour' : 'Réservation enregistrée');
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
      <td>${r.statut === 'prevu' ? `<button class="btn-mini btn-ok" data-dash-arrive="${r.id}">✓ Arrivé</button>` : ''}</td>
    </tr>`).join('');
  tbody.querySelectorAll('[data-dash-arrive]').forEach(b => {
    b.addEventListener('click', async () => {
      const r = cache.reservations.find(x => x.id === b.dataset.dashArrive);
      if (r) await convertResaToEntree(r);
    });
  });
}

