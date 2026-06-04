/**
 * Native booking flow for the CRC field app.
 * Replaces the iframe to /book with a design-native, mobile-first UI.
 * Talks to the portal at https://crc-supplements-dev.onrender.com
 */
(function () {
  const PORTAL = 'https://crc-supplements-dev.onrender.com';
  const APP_KEY = 'crc-field-2026';

  const bookingState = {
    step: 1,
    types: [],
    selectedType: null,
    selectedDate: null,
    selectedTime: null,
    availableDates: [],
    availableSlots: [],
    homeowner: { name: '', email: '', phone: '', address: '' },
    notes: '',
    confirmation: null,
  };

  const CATEGORY_GROUPS = [
    { key: 'getting-started', label: 'Getting Started', typeIds: ['connect-call', 'in-person-meeting'] },
    { key: 'homeowner', label: 'Homeowner Appointments', typeIds: ['roof-inspection', 'retail-consultation'] },
    { key: 'existing', label: 'Existing Customers', typeIds: ['adjuster-meeting', 'scope-review', 'final-walkthrough'] },
  ];

  // ── Styles injected once ──
  function injectStyles() {
    if (document.getElementById('booking-native-styles')) return;
    const s = document.createElement('style');
    s.id = 'booking-native-styles';
    s.textContent = `
#view-booking { overflow-y: auto; -webkit-overflow-scrolling: touch; }
.bn-wrap { padding: 16px; max-width: 520px; margin: 0 auto; color: var(--text-primary); }
.bn-steps { display: flex; align-items: center; gap: 6px; margin-bottom: 20px; }
.bn-step { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text-muted); font-weight: 600; }
.bn-step .bn-num { width: 26px; height: 26px; border-radius: 50%; background: var(--surface-card); border: 1px solid var(--surface-border); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.bn-step.active { color: var(--teal); }
.bn-step.active .bn-num { background: var(--teal); color: #fff; border-color: var(--teal); }
.bn-step.done .bn-num { background: var(--teal); color: #fff; border-color: var(--teal); }
.bn-step-sep { flex: 1 1 auto; height: 2px; background: var(--surface-border); }
.bn-step-sep.done { background: var(--teal); }

.bn-back { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--teal); font-weight: 600; font-size: 14px; padding: 8px 0; cursor: pointer; min-height: 44px; }
.bn-h1 { font-size: 20px; color: var(--navy); font-weight: 700; margin: 4px 0 6px; }
[data-theme="dark"] .bn-h1 { color: var(--text-primary); }
.bn-sub { font-size: 13px; color: var(--text-muted); margin-bottom: 18px; }

.bn-group { margin-bottom: 22px; }
.bn-group-label { font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 10px; }

.bn-card { display: block; width: 100%; text-align: left; background: var(--surface-card); border: 1px solid var(--surface-border); border-left: 3px solid transparent; border-radius: 10px; padding: 14px 16px; margin-bottom: 10px; cursor: pointer; font: inherit; color: var(--text-primary); min-height: 44px; transition: border-color 0.15s; }
.bn-card:active, .bn-card:hover { border-left-color: var(--teal); }
.bn-card-title { font-size: 16px; font-weight: 700; color: var(--text-primary); margin-bottom: 4px; }
.bn-card-desc { font-size: 13px; color: var(--text-muted); line-height: 1.4; margin-bottom: 8px; }
.bn-card-meta { display: flex; align-items: center; gap: 8px; }
.bn-card-duration { font-size: 12px; color: var(--teal); font-weight: 600; }
.bn-tag { display: inline-block; font-size: 10px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; color: #fff; }
.bn-tag.teal { background: var(--teal); }
.bn-tag.navy { background: var(--navy); }

.bn-summary { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 10px; padding: 12px 14px; margin-bottom: 14px; font-size: 13px; color: var(--text-primary); }
.bn-summary strong { color: var(--teal); }

.bn-date-scroll { display: flex; gap: 8px; overflow-x: auto; padding-bottom: 6px; margin-bottom: 16px; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch; }
.bn-date-scroll::-webkit-scrollbar { display: none; }
.bn-date-pill { flex: 0 0 auto; scroll-snap-align: start; background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 10px; padding: 8px 12px; min-width: 64px; text-align: center; cursor: pointer; font: inherit; color: var(--text-primary); min-height: 44px; position: relative; }
.bn-date-pill:disabled { opacity: 0.3; cursor: not-allowed; }
.bn-date-pill.selected { background: var(--teal); color: #fff; border-color: var(--teal); }
.bn-date-pill.today::after { content: ''; position: absolute; bottom: 4px; left: 50%; transform: translateX(-50%); width: 6px; height: 6px; border-radius: 50%; background: var(--teal); }
.bn-date-pill.selected.today::after { background: #fff; }
.bn-date-dow { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
.bn-date-pill.selected .bn-date-dow { color: rgba(255,255,255,0.8); }
.bn-date-num { font-size: 18px; font-weight: 700; line-height: 1.1; }
.bn-date-mo { font-size: 10px; color: var(--text-muted); }
.bn-date-pill.selected .bn-date-mo { color: rgba(255,255,255,0.8); }

.bn-slots-label { font-size: 12px; color: var(--text-muted); margin: 10px 0 8px; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600; }
.bn-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
.bn-slot { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 999px; padding: 10px 6px; min-height: 44px; font: inherit; font-size: 13px; font-weight: 500; color: var(--text-primary); cursor: pointer; }
.bn-slot.selected { background: var(--teal); color: #fff; border-color: var(--teal); }

.bn-btn { display: block; width: 100%; background: var(--teal); color: #fff; border: none; border-radius: 12px; padding: 12px 16px; min-height: 44px; font: inherit; font-family: 'Inter', sans-serif; font-weight: 700; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
.bn-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bn-btn-ghost { background: transparent; color: var(--teal); border: 1px solid var(--surface-border); }

.bn-form { display: flex; flex-direction: column; gap: 12px; margin-bottom: 16px; }
.bn-form label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text-muted); font-weight: 600; }
.bn-form input, .bn-form textarea { background: var(--surface-secondary, var(--surface-card)); color: var(--text-primary); border: 1px solid var(--surface-border); border-radius: 10px; padding: 12px 14px; font: inherit; min-height: 44px; }
.bn-form textarea { min-height: 72px; }
.bn-form input:focus, .bn-form textarea:focus { outline: none; border-color: var(--teal); }

.bn-callout { background: rgba(0,181,204,0.1); border-left: 3px solid var(--teal); padding: 10px 12px; border-radius: 8px; font-size: 13px; color: var(--text-primary); margin-bottom: 12px; line-height: 1.4; }

.bn-loading, .bn-error { padding: 20px; text-align: center; font-size: 13px; color: var(--text-muted); }
.bn-error { color: #f87171; }

.bn-confirm { text-align: center; padding: 20px 8px; }
.bn-check { width: 60px; height: 60px; margin: 0 auto 16px; background: var(--teal); color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 700; }
.bn-confirm-h { font-size: 22px; font-weight: 700; color: var(--text-primary); margin-bottom: 16px; }
.bn-confirm-card { background: var(--surface-card); border: 1px solid var(--surface-border); border-radius: 10px; padding: 14px; margin-bottom: 16px; text-align: left; }
.bn-confirm-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
.bn-confirm-row span { color: var(--text-muted); }
.bn-confirm-row strong { color: var(--text-primary); }
.bn-confirm-id { font-size: 11px; color: var(--text-muted); margin: 8px 0 16px; }
.bn-btn-row { display: flex; flex-direction: column; gap: 8px; }

@media (max-width: 360px) {
  .bn-slots { grid-template-columns: repeat(2, 1fr); }
}
    `;
    document.head.appendChild(s);
  }

  // ── Utils ──
  function h(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function humanDur(m) { if (m >= 60 && m % 60 === 0) return (m/60) + ' hour' + (m === 60 ? '' : 's'); if (m > 60) return (Math.round(m/60*10)/10) + ' hours'; return m + ' min'; }
  function parseYMD(s) { const [y,m,d] = s.split('-').map(n => parseInt(n, 10)); return new Date(y, m-1, d); }
  function fmtDateLabel(ymd) {
    const d = parseYMD(ymd);
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function headers() {
    return {
      'Content-Type': 'application/json',
      'X-Field-App-Key': APP_KEY,
      'X-Field-Rep': (window.repCode || '').toUpperCase()
    };
  }
  function apiUrl(path) { return PORTAL + path; }
  function root() { return document.getElementById('view-booking'); }

  // ── Init ──
  async function initBookingView() {
    injectStyles();
    const view = root();
    if (!view) return;
    view.style.display = '';
    view.style.padding = '0';
    // Reset to step 1 when entering fresh (but allow returning to in-progress if desired)
    if (!bookingState.types.length) {
      renderLoading('Loading appointment types...');
      try {
        const r = await fetch(apiUrl('/api/booking/types'));
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load');
        bookingState.types = (data.types || []).filter(t => t.isPublic !== false);
      } catch (e) {
        renderError(e.message);
        return;
      }
    }
    bookingState.step = 1;
    renderStep1();
  }
  window.initBookingView = initBookingView;

  function renderLoading(msg) { root().innerHTML = '<div class="bn-wrap"><div class="bn-loading">' + h(msg || 'Loading...') + '</div></div>'; }
  function renderError(msg) { root().innerHTML = '<div class="bn-wrap"><div class="bn-error">' + h(msg) + '</div></div>'; }

  function stepsHtml(active) {
    const labels = ['Type', 'Date & Time', 'Info'];
    let html = '<div class="bn-steps">';
    labels.forEach((lbl, i) => {
      const n = i + 1;
      const cls = n === active ? 'active' : (n < active ? 'done' : '');
      html += '<div class="bn-step ' + cls + '"><span class="bn-num">' + (n < active ? '✓' : n) + '</span> ' + lbl + '</div>';
      if (i < labels.length - 1) html += '<div class="bn-step-sep' + (n < active ? ' done' : '') + '"></div>';
    });
    return html + '</div>';
  }

  // ── Step 1: Type ──
  function renderStep1() {
    const byId = new Map(bookingState.types.map(t => [t.id, t]));
    const used = new Set();
    let groupsHtml = '';
    CATEGORY_GROUPS.forEach(g => {
      const items = g.typeIds.map(id => byId.get(id)).filter(Boolean);
      if (!items.length) return;
      items.forEach(t => used.add(t.id));
      groupsHtml += '<div class="bn-group"><div class="bn-group-label">' + h(g.label) + '</div>'
        + items.map(typeCardHtml).join('')
        + '</div>';
    });
    const extras = bookingState.types.filter(t => !used.has(t.id));
    if (extras.length) {
      groupsHtml += '<div class="bn-group"><div class="bn-group-label">Other</div>' + extras.map(typeCardHtml).join('') + '</div>';
    }
    root().innerHTML = '<div class="bn-wrap">' + stepsHtml(1)
      + '<h2 class="bn-h1">What would you like to book?</h2>'
      + '<p class="bn-sub">Tap an appointment type to continue.</p>'
      + groupsHtml + '</div>';
    document.querySelectorAll('.bn-card[data-type-id]').forEach(el => {
      el.addEventListener('click', () => pickType(el.dataset.typeId));
    });
  }

  function typeCardHtml(t) {
    let tag = '';
    if (t.category === 'insurance') tag = '<span class="bn-tag teal">Insurance</span>';
    else if (t.category === 'retail') tag = '<span class="bn-tag navy">Retail</span>';
    return '<button class="bn-card" data-type-id="' + h(t.id) + '">'
      + '<div class="bn-card-title">' + h(t.name) + '</div>'
      + '<div class="bn-card-desc">' + h(t.shortDescription || '') + '</div>'
      + '<div class="bn-card-meta">'
      +   '<span class="bn-card-duration">~' + humanDur(t.duration) + '</span>'
      +   tag
      + '</div>'
      + '</button>';
  }

  function pickType(id) {
    const t = bookingState.types.find(x => x.id === id);
    if (!t) return;
    bookingState.selectedType = t;
    bookingState.selectedDate = null;
    bookingState.selectedTime = null;
    bookingState.step = 2;
    renderStep2();
  }

  // ── Step 2: Date & Time ──
  async function renderStep2() {
    const t = bookingState.selectedType;
    root().innerHTML = '<div class="bn-wrap">'
      + stepsHtml(2)
      + '<button class="bn-back" onclick="window.__bnBack(1)">← Back</button>'
      + '<h2 class="bn-h1">Pick a date &amp; time</h2>'
      + '<div class="bn-summary"><strong>' + h(t.name) + '</strong> · ' + humanDur(t.duration) + '</div>'
      + '<div class="bn-slots-label">Date</div>'
      + '<div class="bn-date-scroll" id="bn-dates"><div class="bn-loading">Loading dates...</div></div>'
      + '<div id="bn-slots-wrap" style="display:none">'
      + '<div class="bn-slots-label">Time</div>'
      + '<div class="bn-slots" id="bn-slots"></div>'
      + '</div>'
      + '<button class="bn-btn" id="bn-continue" disabled>Continue</button>'
      + '</div>';
    document.getElementById('bn-continue').addEventListener('click', () => { bookingState.step = 3; renderStep3(); });
    try {
      const r = await fetch(apiUrl('/api/booking/available-dates?type=' + encodeURIComponent(t.id) + '&weeks=2'));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      bookingState.availableDates = data.dates || [];
      renderDatePills();
    } catch (e) {
      document.getElementById('bn-dates').innerHTML = '<div class="bn-error">' + h(e.message) + '</div>';
    }
  }

  function renderDatePills() {
    const host = document.getElementById('bn-dates');
    const today = new Date(); today.setHours(0,0,0,0);
    const todayYmd = today.getFullYear() + '-' + String(today.getMonth()+1).padStart(2,'0') + '-' + String(today.getDate()).padStart(2,'0');
    let html = '';
    for (let i = 0; i < 14; i++) {
      const d = new Date(today); d.setDate(d.getDate() + i);
      const ymd = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      const available = bookingState.availableDates.includes(ymd);
      const isSun = d.getDay() === 0;
      const isToday = ymd === todayYmd;
      html += '<button class="bn-date-pill' + (isToday ? ' today' : '') + '" data-date="' + ymd + '"' + (!available || isSun ? ' disabled' : '') + '>'
        + '<div class="bn-date-dow">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + '</div>'
        + '<div class="bn-date-num">' + d.getDate() + '</div>'
        + '<div class="bn-date-mo">' + d.toLocaleDateString('en-US', { month: 'short' }) + '</div>'
        + '</button>';
    }
    host.innerHTML = html;
    host.querySelectorAll('.bn-date-pill:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => selectDate(btn.dataset.date, btn));
    });
  }

  async function selectDate(ymd, btn) {
    bookingState.selectedDate = ymd;
    bookingState.selectedTime = null;
    document.querySelectorAll('.bn-date-pill').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    document.getElementById('bn-continue').disabled = true;
    const wrap = document.getElementById('bn-slots-wrap');
    const slots = document.getElementById('bn-slots');
    wrap.style.display = 'block';
    slots.innerHTML = '<div class="bn-loading" style="grid-column:1/-1">Loading times...</div>';
    try {
      const r = await fetch(apiUrl('/api/booking/available-slots?type=' + encodeURIComponent(bookingState.selectedType.id) + '&date=' + ymd));
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Failed');
      const list = data.slots || [];
      if (!list.length) { slots.innerHTML = '<div class="bn-loading" style="grid-column:1/-1">No times available. Pick another day.</div>'; return; }
      slots.innerHTML = list.map(s => '<button class="bn-slot" data-time="' + h(s) + '">' + h(s) + '</button>').join('');
      slots.querySelectorAll('.bn-slot').forEach(b => {
        b.addEventListener('click', () => {
          bookingState.selectedTime = b.dataset.time;
          slots.querySelectorAll('.bn-slot').forEach(x => x.classList.remove('selected'));
          b.classList.add('selected');
          document.getElementById('bn-continue').disabled = false;
        });
      });
    } catch (e) {
      slots.innerHTML = '<div class="bn-error" style="grid-column:1/-1">' + h(e.message) + '</div>';
    }
  }

  // ── Step 3: Info ──
  function renderStep3() {
    const t = bookingState.selectedType;
    const dateLbl = fmtDateLabel(bookingState.selectedDate);
    let callouts = '';
    if (t.decisionMakersRequired) callouts += '<div class="bn-callout">👥 Please ensure all decision-makers are present.</div>';
    if (t.referralNote) callouts += '<div class="bn-callout">🏷️ Referred by someone? Mention them in the notes.</div>';
    root().innerHTML = '<div class="bn-wrap">'
      + stepsHtml(3)
      + '<button class="bn-back" onclick="window.__bnBack(2)">← Back</button>'
      + '<h2 class="bn-h1">Your information</h2>'
      + '<div class="bn-summary"><strong>' + h(t.name) + '</strong><br>' + h(dateLbl) + ' at ' + h(bookingState.selectedTime) + ' · ' + humanDur(t.duration) + '</div>'
      + callouts
      + '<form class="bn-form" id="bn-form">'
      + '<label>Name<input required name="name" autocomplete="name" value="' + h(bookingState.homeowner.name) + '"></label>'
      + '<label>Email<input required type="email" name="email" autocomplete="email" value="' + h(bookingState.homeowner.email) + '"></label>'
      + '<label>Phone<input required type="tel" name="phone" autocomplete="tel" value="' + h(bookingState.homeowner.phone) + '"></label>'
      + '<label>Property Address<input required name="address" autocomplete="street-address" value="' + h(bookingState.homeowner.address) + '"></label>'
      + '<label>Notes (optional)<textarea name="notes">' + h(bookingState.notes) + '</textarea></label>'
      + '<button type="submit" class="bn-btn" id="bn-book">Book Appointment</button>'
      + '</form>'
      + '</div>';
    document.getElementById('bn-form').addEventListener('submit', submitBooking);
  }

  async function submitBooking(ev) {
    ev.preventDefault();
    const btn = document.getElementById('bn-book');
    btn.disabled = true; btn.textContent = 'Booking...';
    const fd = new FormData(ev.target);
    const homeowner = {
      name: (fd.get('name') || '').trim(),
      email: (fd.get('email') || '').trim(),
      phone: (fd.get('phone') || '').trim(),
      address: (fd.get('address') || '').trim(),
    };
    bookingState.homeowner = homeowner;
    bookingState.notes = (fd.get('notes') || '').trim();
    const body = {
      typeId: bookingState.selectedType.id,
      date: bookingState.selectedDate,
      time: bookingState.selectedTime,
      homeowner,
      notes: bookingState.notes,
      repId: window.repCode || undefined,
    };
    try {
      const r = await fetch(apiUrl('/api/booking/book'), { method: 'POST', headers: headers(), body: JSON.stringify(body) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Booking failed');
      bookingState.confirmation = data.booking;
      renderConfirmation();
    } catch (e) {
      alert('Booking failed: ' + e.message);
      btn.disabled = false; btn.textContent = 'Book Appointment';
    }
  }

  // ── Step 4: Confirmation ──
  function renderConfirmation() {
    const b = bookingState.confirmation || {};
    const t = bookingState.selectedType;
    const ho = bookingState.homeowner;
    const dateLbl = fmtDateLabel(bookingState.selectedDate);
    const gcalLink = b.htmlLink || buildGcalLink(b, t, ho);
    root().innerHTML = '<div class="bn-wrap">'
      + '<div class="bn-confirm">'
      + '<div class="bn-check">✓</div>'
      + '<div class="bn-confirm-h">You\'re all set!</div>'
      + '<div class="bn-confirm-card">'
      +   '<div class="bn-confirm-row"><span>Type</span><strong>' + h(t.name) + '</strong></div>'
      +   '<div class="bn-confirm-row"><span>Date</span><strong>' + h(dateLbl) + '</strong></div>'
      +   '<div class="bn-confirm-row"><span>Time</span><strong>' + h(bookingState.selectedTime) + '</strong></div>'
      +   '<div class="bn-confirm-row"><span>Homeowner</span><strong>' + h(ho.name) + '</strong></div>'
      + '</div>'
      + (b.confirmationId ? '<div class="bn-confirm-id">Confirmation: ' + h(b.confirmationId) + '</div>' : '')
      + '<div class="bn-btn-row">'
      +   (gcalLink ? '<a class="bn-btn" href="' + h(gcalLink) + '" target="_blank" rel="noreferrer" style="text-decoration:none;text-align:center">Add to Google Calendar</a>' : '')
      +   '<button class="bn-btn bn-btn-ghost" onclick="window.__bnReset()">Book Another</button>'
      + '</div>'
      + '</div></div>';
  }

  function buildGcalLink(b, t, ho) {
    if (!bookingState.selectedDate || !bookingState.selectedTime) return '';
    const match = bookingState.selectedTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
    if (!match) return '';
    let hh = parseInt(match[1], 10);
    const mm = parseInt(match[2], 10);
    if (match[3].toUpperCase() === 'PM' && hh !== 12) hh += 12;
    if (match[3].toUpperCase() === 'AM' && hh === 12) hh = 0;
    const d = parseYMD(bookingState.selectedDate); d.setHours(hh, mm, 0, 0);
    const end = new Date(d.getTime() + (t.duration || 60) * 60000);
    const fmt = x => x.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: 'CRC ' + t.name + ' — ' + (ho.name || ''),
      dates: fmt(d) + '/' + fmt(end),
      details: 'Appointment with Columbus Roofing Company.' + (b.confirmationId ? '\nConfirmation: ' + b.confirmationId : ''),
      location: ho.address || ''
    });
    return 'https://calendar.google.com/calendar/render?' + params.toString();
  }

  // ── Back/reset hooks ──
  window.__bnBack = function (step) {
    bookingState.step = step;
    if (step === 1) renderStep1();
    if (step === 2) renderStep2();
    if (step === 3) renderStep3();
  };
  window.__bnReset = function () {
    bookingState.selectedType = null;
    bookingState.selectedDate = null;
    bookingState.selectedTime = null;
    bookingState.availableDates = [];
    bookingState.availableSlots = [];
    bookingState.confirmation = null;
    bookingState.step = 1;
    renderStep1();
  };
})();
