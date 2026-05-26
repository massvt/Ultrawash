// ===== Réservation publique UltraWash =====
// Page sans login : la clé "publishable" (anon) n'a accès qu'aux 3 fonctions
// SECURITY DEFINER définies dans public_booking.sql (créneaux, services, résa).
const SUPABASE_URL = 'https://hajnttnlyoftxgqsjyjl.supabase.co';
const SUPABASE_KEY = 'sb_publishable_maWkeTvWo7H3aQzFwzyp8w_8OvgzSXf';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const MONTHS = ['janvier','février','mars','avril','mai','juin','juillet','août',
                'septembre','octobre','novembre','décembre'];
const DOW = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

// État de la réservation en cours
const state = { date: null, heure: null, services: [] };

// Aujourd'hui (heure locale du navigateur) à minuit
const today = new Date(); today.setHours(0, 0, 0, 0);
let viewYear = today.getFullYear();
let viewMonth = today.getMonth();

const $ = (id) => document.getElementById(id);
function ymd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function frDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmtPrix(n) {
  return Number(n).toLocaleString('fr-FR') + ' FCFA';
}

// ---------- Calendrier ----------
function renderDow() {
  $('calDow').innerHTML = DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');
}

function renderCalendar() {
  $('calMonth').textContent = `${MONTHS[viewMonth]} ${viewYear}`;
  // Empêcher de naviguer avant le mois courant
  $('calPrev').disabled = (viewYear === today.getFullYear() && viewMonth === today.getMonth());

  const first = new Date(viewYear, viewMonth, 1);
  // getDay(): 0=dim..6=sam → on veut lundi=0
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  let cells = '';
  for (let i = 0; i < lead; i++) cells += '<div class="cal-day empty"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(viewYear, viewMonth, d);
    const key = ymd(date);
    const isPast = date < today;
    const isToday = date.getTime() === today.getTime();
    const isSel = state.date === key;
    const cls = ['cal-day'];
    if (isPast) cls.push('past');
    if (isToday) cls.push('today');
    if (isSel) cls.push('selected');
    cells += `<div class="${cls.join(' ')}" ${isPast ? '' : `data-date="${key}"`}>${d}</div>`;
  }
  $('calGrid').innerHTML = cells;
  $('calGrid').querySelectorAll('[data-date]').forEach(el => {
    el.addEventListener('click', () => selectDate(el.dataset.date));
  });
}

$('calPrev').addEventListener('click', () => {
  if ($('calPrev').disabled) return;
  viewMonth--; if (viewMonth < 0) { viewMonth = 11; viewYear--; }
  renderCalendar();
});
$('calNext').addEventListener('click', () => {
  viewMonth++; if (viewMonth > 11) { viewMonth = 0; viewYear++; }
  renderCalendar();
});

// ---------- Fil d'étapes ----------
function setStep(n) {
  document.querySelectorAll('#stepper .step').forEach(el => {
    const s = Number(el.dataset.step);
    el.classList.toggle('is-active', s === n);
    el.classList.toggle('is-done', s < n);
  });
}

// ---------- Créneaux ----------
async function selectDate(key) {
  state.date = key;
  state.heure = null;
  renderCalendar();
  setStep(2);
  $('cardForm').classList.add('hidden');
  $('cardSlots').classList.remove('hidden');
  $('slotsEmpty').classList.add('hidden');
  $('slots').innerHTML = '';
  $('slotsLoader').classList.remove('hidden');
  $('cardSlots').scrollIntoView({ behavior: 'smooth', block: 'start' });

  const { data, error } = await sb.rpc('public_available_slots', { p_date: key });
  $('slotsLoader').classList.add('hidden');

  if (error) {
    $('slotsEmpty').textContent = 'Erreur de chargement. Réessayez plus tard.';
    $('slotsEmpty').classList.remove('hidden');
    return;
  }
  const slots = (data || []).map(r => r.heure);
  if (slots.length === 0) {
    $('slotsEmpty').textContent = 'Aucun créneau disponible ce jour-là. Choisissez une autre date.';
    $('slotsEmpty').classList.remove('hidden');
    return;
  }
  $('slots').innerHTML = slots.map(h => `<button type="button" class="slot" data-h="${h}">${h}</button>`).join('');
  $('slots').querySelectorAll('.slot').forEach(b => {
    b.addEventListener('click', () => selectSlot(b.dataset.h));
  });
}

function selectSlot(h) {
  state.heure = h;
  $('slots').querySelectorAll('.slot').forEach(b => {
    b.classList.toggle('selected', b.dataset.h === h);
  });
  openForm();
}

// ---------- Formulaire ----------
function openForm() {
  updateRecap();
  setStep(3);
  $('cardForm').classList.remove('hidden');
  $('formError').classList.add('hidden');
  $('cardForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Lien « Changer la date ou le créneau » → revient à l'étape 1
$('recapEdit').addEventListener('click', () => {
  setStep(1);
  $('cardDate').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// Libellé complet de la prestation : "Lavage <type>" (ex: "Lavage 4x4")
function serviceLabel(type) {
  return type ? 'Lavage ' + type : '';
}

function updateRecap() {
  const type = $('f-vehtype').value;
  $('recap').innerHTML =
    `📅 <b>${frDate(state.date)}</b> à <b>${state.heure}</b>` +
    (type ? `<br>🧽 ${escapeHtml(serviceLabel(type))}` : '');
}

$('f-vehtype').addEventListener('change', updateRecap);

$('bookForm').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const err = $('formError');
  err.classList.add('hidden');

  const nom = $('f-nom').value.trim();
  const tel = $('f-tel').value.trim();
  if (!nom) return showError('Merci d\'indiquer votre nom.');
  if (!tel) return showError('Merci d\'indiquer votre téléphone.');
  if (!state.date || !state.heure) return showError('Sélectionnez une date et un créneau.');

  const btn = $('submitBtn');
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Réservation en cours…';

  const { data, error } = await sb.rpc('public_create_booking', {
    p_nom: nom,
    p_telephone: tel,
    p_plaque: null,
    p_vehicule_type: $('f-vehtype').value || null,
    p_date: state.date,
    p_heure: state.heure,
    p_type_lavage: null,
    p_notes: $('f-notes').value.trim() || null,
  });

  btn.disabled = false;
  btn.textContent = original;

  if (error) {
    return showError('Une erreur est survenue. Vérifiez votre connexion et réessayez.');
  }
  if (!data || !data.ok) {
    // Créneau pris entre-temps → on rafraîchit la liste des dispos
    showError((data && data.error) || 'Réservation impossible.');
    if (state.date) selectDate(state.date);
    return;
  }
  showConfirmation();
});

function showError(msg) {
  const err = $('formError');
  err.textContent = msg;
  err.classList.remove('hidden');
  err.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showConfirmation() {
  const type = $('f-vehtype').value;
  setStep(4); // toutes les étapes terminées
  $('flow').classList.add('hidden');
  $('confirm').classList.remove('hidden');
  $('confirmDetail').innerHTML =
    `Le <b>${frDate(state.date)}</b> à <b>${state.heure}</b>` +
    (type ? `<br>${escapeHtml(serviceLabel(type))}` : '');
  $('confirm').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('againBtn').addEventListener('click', () => {
  state.date = null; state.heure = null;
  $('bookForm').reset();
  $('confirm').classList.add('hidden');
  $('flow').classList.remove('hidden');
  $('cardSlots').classList.add('hidden');
  $('cardForm').classList.add('hidden');
  setStep(1);
  viewYear = today.getFullYear(); viewMonth = today.getMonth();
  renderCalendar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---------- Boot : vérifier l'ouverture puis charger les types ----------
async function boot() {
  renderDow();
  renderCalendar();

  setStep(1);

  // Réservations fermées par l'équipe (forte affluence) ?
  const { data: status } = await sb.rpc('public_booking_status');
  const st = status && status[0];
  if (st && st.is_open === false) {
    $('flow').classList.add('hidden');
    $('stepper').classList.add('hidden');
    $('closedMessage').textContent = st.closed_message || 'Les réservations en ligne sont momentanément fermées.';
    $('closedBanner').classList.remove('hidden');
    return;
  }

  const { data: vt } = await sb.rpc('public_vehicule_types');

  const sel = $('f-vehtype');
  sel.innerHTML = '<option value="">— Choisir —</option>' +
    (vt || []).map(t => `<option value="${escapeHtml(t.nom)}">${escapeHtml(t.nom)}</option>`).join('');
}

boot();
