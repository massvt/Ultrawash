// ===== SUPABASE =====
const SUPABASE_URL = 'https://hajnttnlyoftxgqsjyjl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_maWkeTvWo7H3aQzFwzyp8w_8OvgzSXf';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// État session + rôle courant
const session = { user: null, role: null };
const isPatron = () => session.role === 'patron';

// In-memory cache (rempli au chargement, mis à jour après chaque mutation)
const cache = { entrees: [], sorties: [] };

const DB = {
  getEntrees: () => cache.entrees,
  getSorties: () => cache.sorties,

  async loadAll() {
    const [{ data: e, error: ee }, { data: s, error: se }] = await Promise.all([
      sb.from('entrees').select('*').order('date', { ascending: false }).order('heure', { ascending: false }),
      sb.from('sorties').select('*').order('date', { ascending: false }),
    ]);
    if (ee) console.error('entrees:', ee);
    if (se) console.error('sorties:', se);
    cache.entrees = e || [];
    cache.sorties = s || [];
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
    if (btn.dataset.page === 'dashboard') renderDashboard();
    if (btn.dataset.page === 'entrees') renderEntreesList();
    if (btn.dataset.page === 'sorties') renderSortiesList();
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
function inPeriod(dateStr, period) {
  const d = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') {
    return d >= today && d < new Date(today.getTime() + 86400000);
  }
  if (period === 'week') {
    const start = new Date(today); start.setDate(today.getDate() - today.getDay());
    return d >= start;
  }
  if (period === 'month') {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
  if (period === 'year') {
    return d.getFullYear() === now.getFullYear();
  }
  return true;
}

// ===== DASHBOARD =====
let chartCA = null, chartTypes = null;

function renderDashboard() {
  const period = document.getElementById('dashPeriod').value;
  const entrees = DB.getEntrees().filter(e => inPeriod(e.date, period));
  const sorties = DB.getSorties().filter(s => inPeriod(s.date, period));

  const ca = entrees.reduce((a, e) => a + Number(e.montant), 0);
  const dep = sorties.reduce((a, s) => a + Number(s.montant), 0);
  const ben = ca - dep;
  const marge = ca > 0 ? Math.round((ben / ca) * 100) : 0;

  const todayEntrees = DB.getEntrees().filter(e => inPeriod(e.date, 'today'));
  const caToday = todayEntrees.reduce((a, e) => a + Number(e.montant), 0);

  document.getElementById('kpi-ca').textContent = fmt(ca);
  document.getElementById('kpi-ca-count').textContent = entrees.length + ' lavage' + (entrees.length > 1 ? 's' : '');
  document.getElementById('kpi-depenses').textContent = fmt(dep);
  document.getElementById('kpi-dep-count').textContent = sorties.length + ' opération' + (sorties.length > 1 ? 's' : '');
  document.getElementById('kpi-benefice').textContent = fmt(ben);
  document.getElementById('kpi-marge').textContent = 'Marge : ' + marge + '%';
  document.getElementById('kpi-today').textContent = todayEntrees.length;
  document.getElementById('kpi-today-ca').textContent = fmt(caToday);

  renderChartCA(entrees, period);
  renderChartTypes(entrees);
  renderRecentTable();
}

function renderChartCA(entrees, period) {
  const ctx = document.getElementById('chartCA').getContext('2d');
  if (chartCA) chartCA.destroy();

  const grouped = {};
  entrees.forEach(e => {
    const d = new Date(e.date);
    let key;
    if (period === 'today') key = e.heure ? e.heure.slice(0,2) + 'h' : '?';
    else if (period === 'week' || period === 'month') key = d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    else key = d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
    grouped[key] = (grouped[key] || 0) + Number(e.montant);
  });

  const labels = Object.keys(grouped);
  const values = Object.values(grouped);

  chartCA = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'CA (FCFA)',
        data: values,
        backgroundColor: '#1a73e8',
        borderRadius: 6,
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
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

document.getElementById('dashPeriod').addEventListener('change', renderDashboard);

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
  const row = {
    date: document.getElementById('e-date').value,
    heure: document.getElementById('e-heure').value,
    vehicule: document.getElementById('e-vehicule').value,
    type: document.getElementById('e-type').value,
    montant: Number(document.getElementById('e-montant').value),
    plaque: document.getElementById('e-plaque').value || null,
    notes: document.getElementById('e-notes').value || null,
  };
  const saved = await DB.addEntree(row);
  if (!saved) return;
  ev.target.reset();
  setDefaultDateTime();
  renderEntreesList();
  toast('Lavage enregistré !');
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
function renderHistorique() {
  const month = document.getElementById('filterMonth').value;
  let all = [
    ...DB.getEntrees().map(e => ({ ...e, kind: 'entree' })),
    ...DB.getSorties().map(s => ({ ...s, kind: 'sortie' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (month) {
    all = all.filter(op => op.date && op.date.startsWith(month));
  }

  const tbody = document.getElementById('historiqueTable');
  const empty = document.getElementById('historiqueEmpty');
  if (all.length === 0) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = all.map(op => `
      <tr>
        <td>${fmtDate(op.date)}</td>
        <td><span class="badge badge-${op.kind}">${op.kind === 'entree' ? 'Lavage' : 'Dépense'}</span></td>
        <td>${op.kind === 'entree' ? (op.vehicule + ' – ' + op.type + (op.plaque ? ' [' + op.plaque + ']' : '')) : (op.categorie + (op.description ? ' – ' + op.description : ''))}</td>
        <td class="montant-${op.kind}">${op.kind === 'entree' ? '+' : '-'}${fmt(op.montant)}</td>
      </tr>
    `).join('');
  }
}

document.getElementById('filterMonth').addEventListener('change', renderHistorique);

// ===== EXPORT CSV =====
document.getElementById('exportBtn').addEventListener('click', () => {
  const month = document.getElementById('filterMonth').value;
  let all = [
    ...DB.getEntrees().map(e => ({ ...e, kind: 'Lavage' })),
    ...DB.getSorties().map(s => ({ ...s, kind: 'Dépense' }))
  ].sort((a, b) => new Date(b.date) - new Date(a.date));
  if (month) all = all.filter(op => op.date && op.date.startsWith(month));

  const header = 'Date,Type,Détail,Montant (FCFA)\n';
  const rows = all.map(op => {
    const detail = op.kind === 'Lavage'
      ? `${op.vehicule} - ${op.type}${op.plaque ? ' [' + op.plaque + ']' : ''}`
      : `${op.categorie}${op.description ? ' - ' + op.description : ''}`;
    const sign = op.kind === 'Lavage' ? '' : '-';
    return `${op.date},${op.kind},"${detail}",${sign}${op.montant}`;
  }).join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `ultrawash_${month || 'export'}.csv`;
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
