// ===== STORAGE =====
const DB = {
  getEntrees: () => JSON.parse(localStorage.getItem('uw_entrees') || '[]'),
  getSorties: () => JSON.parse(localStorage.getItem('uw_sorties') || '[]'),
  saveEntrees: (d) => localStorage.setItem('uw_entrees', JSON.stringify(d)),
  saveSorties: (d) => localStorage.setItem('uw_sorties', JSON.stringify(d)),
};

// ===== NAVIGATION =====
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

  // KPIs aujourd'hui
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

document.getElementById('formEntree').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const entry = {
    id: Date.now(),
    date: document.getElementById('e-date').value,
    heure: document.getElementById('e-heure').value,
    vehicule: document.getElementById('e-vehicule').value,
    type: document.getElementById('e-type').value,
    montant: document.getElementById('e-montant').value,
    plaque: document.getElementById('e-plaque').value,
    notes: document.getElementById('e-notes').value,
  };
  const list = DB.getEntrees();
  list.unshift(entry);
  DB.saveEntrees(list);
  ev.target.reset();
  setDefaultDateTime();
  renderEntreesList();
  toast('Lavage enregistré !');
});

function renderEntreesList() {
  const list = DB.getEntrees().slice(0, 20);
  const tbody = document.getElementById('entreesList');
  tbody.innerHTML = list.map(e => `
    <tr>
      <td>${fmtDate(e.date)} ${e.heure || ''}</td>
      <td>${e.vehicule}</td>
      <td>${e.type}</td>
      <td>${e.plaque || '—'}</td>
      <td class="montant-entree">+${fmt(e.montant)}</td>
      <td><button class="btn-del" onclick="delEntree(${e.id})">✕</button></td>
    </tr>
  `).join('') || '<tr><td colspan="6" class="empty-state">Aucun lavage enregistré</td></tr>';
}

function delEntree(id) {
  if (!confirm('Supprimer cette entrée ?')) return;
  DB.saveEntrees(DB.getEntrees().filter(e => e.id !== id));
  renderEntreesList();
  toast('Entrée supprimée', '#e53935');
}

// ===== SORTIES =====
document.getElementById('formSortie').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const entry = {
    id: Date.now(),
    date: document.getElementById('s-date').value,
    categorie: document.getElementById('s-categorie').value,
    montant: document.getElementById('s-montant').value,
    description: document.getElementById('s-description').value,
  };
  const list = DB.getSorties();
  list.unshift(entry);
  DB.saveSorties(list);
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
      <td><button class="btn-del" onclick="delSortie(${s.id})">✕</button></td>
    </tr>
  `).join('') || '<tr><td colspan="5" class="empty-state">Aucune dépense enregistrée</td></tr>';
}

function delSortie(id) {
  if (!confirm('Supprimer cette dépense ?')) return;
  DB.saveSorties(DB.getSorties().filter(s => s.id !== id));
  renderSortiesList();
  toast('Dépense supprimée', '#e53935');
}

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

// ===== INIT =====
renderDashboard();
