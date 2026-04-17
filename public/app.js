/* CRC Field Intel -- Mobile Frontend */
let repCode = localStorage.getItem('crc-rep-code') || '';
let repName = localStorage.getItem('crc-rep-name') || '';
let repRole = localStorage.getItem('crc-rep-role') || '';
let selectedAddress = '';
let mapInitialized = false;
let stormsLoaded = false;
let gmap = null, mapMarkers = [], knockMode = false, dropPinMode = false;
let buildMarkers = [];
let buildsOverlayVisible = false;
let _buildsCache = null;
let _activeColorFilter = 'all';
let activeJobContext = null; // For Brain context injection

document.addEventListener('DOMContentLoaded', () => {
  // Dismiss loading screen after animation
  setTimeout(() => {
    const ls = document.getElementById('loading-screen');
    if (ls) { ls.classList.add('fade-out'); setTimeout(() => ls.remove(), 400); }
  }, 1400);
  if (repCode) validateAndEnter(repCode);
  else document.getElementById('gate').style.display = 'flex';
  initAddressAutocomplete();
});

// --- Rep Code Gate ---
async function submitRepCode() { await validateAndEnter(document.getElementById('gate-code').value.trim().toUpperCase()); }
async function validateAndEnter(code) {
  try {
    const data = await fetch(`/api/rep-codes/validate?code=${code}`).then(r => r.json());
    if (!data.valid) { document.getElementById('gate-error').textContent = 'Invalid or deactivated rep code'; document.getElementById('gate').style.display = 'flex'; document.getElementById('app').style.display = 'none'; return; }
    repCode = code; repName = data.name; repRole = data.role;
    localStorage.setItem('crc-rep-code', code); localStorage.setItem('crc-rep-name', data.name); localStorage.setItem('crc-rep-role', data.role);
    document.getElementById('gate').style.display = 'none'; document.getElementById('app').style.display = '';
    // Rep badge shows code only — full name + role live in the dropdown.
    const badge = document.getElementById('rep-badge');
    if (badge) badge.textContent = code;
    const nm = document.getElementById('field-user-name'); if (nm) nm.textContent = data.name;
    const rl = document.getElementById('field-user-role'); if (rl) rl.textContent = String(data.role || 'rep').toUpperCase() + ' · ' + code;
    if (data.role === 'admin') { document.getElementById('nav-admin').style.display = ''; document.getElementById('chat-tab-leadership').style.display = ''; }
    loadLeads();
    initCheckin();
  } catch { document.getElementById('gate-error').textContent = 'Connection error'; }
}
document.getElementById('gate-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitRepCode(); });

// --- Address Autocomplete ---
let acTimeout = null;
function initAddressAutocomplete() {
  const el = document.getElementById('lead-address');
  if (!el) return;
  el.addEventListener('input', () => { clearTimeout(acTimeout); const v = el.value.trim(); if (v.length < 3) { hideSuggestions(); return; } acTimeout = setTimeout(() => fetchSuggestions(v), 300); });
  el.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
}
async function fetchSuggestions(input) {
  try {
    const data = await fetch(`/api/maps/autocomplete?input=${encodeURIComponent(input)}`).then(r => r.json());
    const box = document.getElementById('address-suggestions');
    if (!data.predictions?.length) { hideSuggestions(); return; }
    box.innerHTML = data.predictions.map(p => `<div class="suggestion-item" onmousedown="selectAddress('${p.place_id}','${p.description.replace(/'/g,"&#39;")}')">${p.description}</div>`).join('');
    box.classList.add('show');
  } catch { hideSuggestions(); }
}
function hideSuggestions() { const b = document.getElementById('address-suggestions'); if (b) { b.classList.remove('show'); b.innerHTML = ''; } }
async function selectAddress(placeId, desc) {
  const el = document.getElementById('lead-address'); el.value = desc; selectedAddress = desc; hideSuggestions();
  try {
    const d = await fetch(`/api/maps/place-details?place_id=${placeId}`).then(r => r.json());
    if (d.lat) { selectedAddress = d.address || desc; el.value = selectedAddress; el.dataset.lat = d.lat; el.dataset.lng = d.lng; el.dataset.city = d.city || ''; el.dataset.state = d.state || 'OH'; el.dataset.zip = d.zip || ''; el.dataset.county = d.county || ''; }
  } catch {}
  try { const sv = await fetch(`/api/maps/streetview?address=${encodeURIComponent(selectedAddress)}`).then(r => r.json()); if (sv.url) document.getElementById('street-view-preview').innerHTML = `<img src="${sv.url}" alt="Street View">`; } catch {}
}

// --- Job Type Multi-Select ---
function toggleJobChip(el) {
  const val = el.dataset.val; const row = document.getElementById('job-type-chips');
  if (val === 'Full Exterior') { const on = !el.classList.contains('active'); row.querySelectorAll('.chip').forEach(c => { if (['Roof','Siding','Gutters','Full Exterior'].includes(c.dataset.val)) c.classList.toggle('active', on); }); }
  else { el.classList.toggle('active'); const all3 = ['Roof','Siding','Gutters'].every(v => row.querySelector('[data-val="'+v+'"]').classList.contains('active')); row.querySelector('[data-val="Full Exterior"]').classList.toggle('active', all3); }
}
function getJobTypes() { return [...document.querySelectorAll('#job-type-chips .chip.active')].map(c => c.dataset.val); }
function selectClaimType(el) { document.querySelectorAll('#claim-type-chips .chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); }
function getClaimType() { return document.querySelector('#claim-type-chips .chip.active')?.dataset.val || 'insurance'; }
function selectSource(el) { document.querySelectorAll('#source-chips .chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); }
function getSource() { return document.querySelector('#source-chips .chip.active')?.dataset.val || 'Door Knock'; }

// --- More Menu ---
function toggleMoreMenu() { document.getElementById('more-menu').classList.toggle('open'); }
function closeMoreMenu() { document.getElementById('more-menu').classList.remove('open'); }

// --- View Switching ---
function switchView(name) {
  closeMoreMenu();
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-' + name)?.classList.add('active');
  if (name === 'leads') { document.getElementById('lead-detail').classList.remove('open'); document.getElementById('leads-main').style.display = ''; loadLeads(); }
  if (name === 'jobs') { document.getElementById('job-detail').classList.remove('open'); loadJobs(); }
  if (name === 'map' && !mapInitialized) initMap();
  if (name === 'stats') loadStats();
  if (name === 'feed') initFeed();
  if (name === 'notes') initNotes();
  if (name === 'brain') initBrain();
  if (name === 'admin') loadAdmin();
  if (name === 'booking') {
    const view = document.getElementById('view-booking');
    if (view) {
      const navH = document.querySelector('.bottom-nav')?.offsetHeight || 56;
      const headerH = document.querySelector('.app-header')?.offsetHeight || 56;
      view.style.height = `calc(100vh - ${headerH + navH}px)`;
    }
    if (typeof initBookingView === 'function') initBookingView();
    return;
  }
}

// --- Add Lead ---
async function addLead() {
  const addr = document.getElementById('lead-address').value.trim();
  if (!addr) return alert('Enter a property address');
  const btn = document.getElementById('btn-add-lead'); btn.disabled = true; btn.textContent = 'Adding...';
  try {
    const el = document.getElementById('lead-address');
    const svRes = await fetch(`/api/maps/streetview?address=${encodeURIComponent(selectedAddress || addr)}&size=80x60`).then(r=>r.json()).catch(()=>({}));
    const body = {
      address: selectedAddress || addr, lat: parseFloat(el.dataset.lat) || null, lng: parseFloat(el.dataset.lng) || null,
      city: el.dataset.city || '', state: el.dataset.state || 'OH', zip: el.dataset.zip || '', county: el.dataset.county || '',
      homeowner: document.getElementById('lead-name').value.trim(), phone: document.getElementById('lead-phone').value.trim(),
      jobType: getJobTypes().join(', '), jobTypes: getJobTypes(), jobCategory: getClaimType(),
      source: getSource(), notes: document.getElementById('lead-notes').value.trim(), streetViewUrl: svRes.url || '', repCode,
      pipeline: getClaimType() === 'retail' ? 'retail' : 'insurance',
    };
    const result = await fetch('/api/field/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    const jobId = result.jobId || result.job?.id || '';
    const homeownerName = result.job?.homeownerName || body.homeowner || 'Unknown';
    document.getElementById('lead-confirm').style.display = 'block';
    document.getElementById('lead-confirm').innerHTML = `<div class="checkmark">&#10003;</div><p>Job created in portal &mdash; ${homeownerName} at ${body.address}</p>
      <button onclick="clearLeadForm()" style="background:var(--teal);color:white">Add Another</button>
      <button onclick="switchView('jobs')" style="background:var(--navy);color:white">My Jobs</button>`;
    ['lead-address','lead-name','lead-phone','lead-notes'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
    document.getElementById('street-view-preview').innerHTML = ''; selectedAddress = '';
    loadLeads();
  } catch (e) { alert('Error: ' + e.message); }
  btn.disabled = false; btn.textContent = 'ADD LEAD';
}
function clearLeadForm() { document.getElementById('lead-confirm').style.display = 'none'; document.getElementById('lead-address').focus(); }

// --- Lead List ---
async function loadLeads() {
  const c = document.getElementById('leads-list'); if (!c) return;
  try {
    const url = repRole === 'admin' ? '/api/leads' : `/api/leads?repCode=${repCode}`;
    const leads = await fetch(url).then(r => r.json());
    const today = new Date().toDateString();
    const recent = leads.filter(l => new Date(l.createdAt).toDateString() === today);
    if (!recent.length) { c.innerHTML = '<p style="padding:16px;color:var(--gray);font-size:14px">No leads added today.</p>'; return; }
    c.innerHTML = recent.map(l => {
      const photoCount = (l.photos?.inspection?.length||0)+(l.photos?.build?.length||0)||(l.photos?.length||0);
      const jobChips = (l.jobTypes || [l.jobType]).filter(Boolean).map(t => `<span style="font-size:10px;padding:1px 6px;background:var(--bg);border-radius:8px;color:var(--gray)">${t}</span>`).join(' ');
      const catBadge = l.jobCategory === 'retail' ? '<span style="font-size:10px;padding:1px 6px;background:var(--teal);color:#fff;border-radius:8px">Retail</span>' : l.jobCategory === 'repair' ? '<span style="font-size:10px;padding:1px 6px;background:var(--amber);color:#fff;border-radius:8px">Repair</span>' : '';
      return `<div class="lead-card" onclick="viewLead('${l.id}')" style="border-left:3px solid var(--${l.status === 'won' || l.status === 'appointment' || l.status === 'claim_filed' ? 'green' : l.status === 'not_interested' || l.status === 'lost' ? 'red' : l.status === 'contacted' || l.status === 'not_home' ? 'amber' : 'teal'})">
        <div class="lead-info" style="flex:1">
          <h4>${l.address}</h4>
          <p>${l.homeowner || 'No name'}</p>
          <div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${jobChips} ${catBadge}</div>
        </div>
        <div class="lead-meta">
          <div style="font-size:11px;color:var(--gray)">${timeAgo(l.createdAt)}</div>
          ${photoCount ? '<div style="font-size:10px;color:var(--gray)">&#128247; '+photoCount+'</div>' : ''}
          <div style="font-size:16px;color:var(--border)">&#8250;</div>
        </div>
      </div>`;
    }).join('');
  } catch (e) { c.innerHTML = `<p style="padding:16px;color:var(--red)">${e.message}</p>`; }
}

// --- Lead Detail (uses separate div to preserve leads DOM) ---
async function viewLead(id) {
  try {
    const lead = await fetch(`/api/leads/${id}`).then(r => r.json());
    activeJobContext = { address: lead.address, homeowner: lead.homeowner, jobType: lead.jobType, carrier: lead.jobCategory === 'retail' ? 'Retail' : '', status: lead.status };
    const statuses = ['new','contacted','not_home','not_interested','appointment','claim_filed','won','lost'];
    const sBtns = statuses.map(s => `<button class="chip ${lead.status===s?'active':''}" onclick="updateStatus('${id}','${s}')">${s.replace(/_/g,' ')}</button>`).join('');
    const measHtml = lead.measurements ? `<div style="padding:12px;background:var(--bg);border-radius:6px;margin-top:12px;font-size:13px">
      <strong>Hover Measurements</strong><br>${lead.measurements.totalSquares || '?'} SQ | Ridge: ${lead.measurements.ridgeLength || 0} LF | Pitch: ${lead.measurements.predominantPitch || '?'}</div>` : '';
    const syncHtml = lead.homeownerPortalSync?.lastSync
      ? `Homeowner portal: Synced ${(lead.homeownerPortalSync.inspectionPhotosSynced || 0) + (lead.homeownerPortalSync.buildPhotosSynced || 0)} photos`
      : 'Homeowner portal: Not synced';
    document.getElementById('leads-main').style.display = 'none';
    const detail = document.getElementById('lead-detail');
    detail.classList.add('open');
    detail.scrollTop = 0;
    const sharedCount = (lead.homeownerSharedPhotos || []).length;
    const totalPhotos = (lead.photos?.inspection?.length || 0) + (lead.photos?.build?.length || 0);
    const shareLabel = sharedCount > 0 ? `Homeowner Photos (${sharedCount})` : 'Share Photos with Homeowner';
    detail.innerHTML = `<div style="padding:16px;max-width:500px;margin:0 auto">
      ${lead.streetViewUrl ? `<img src="${lead.streetViewUrl}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:16px" onerror="this.outerHTML='<div class=\\'sv-fallback\\'><div class=\\'sv-fallback-icon\\'>&#127968;</div><div class=\\'sv-fallback-addr\\'>${lead.address.replace(/'/g,'&#39;')}</div></div>'">`
        : `<div class="sv-fallback"><div class="sv-fallback-icon">&#127968;</div><div class="sv-fallback-addr">${lead.address}</div></div>`}
      <h2 style="font-size:18px;margin-bottom:4px">${lead.address}</h2>
      <p style="color:var(--gray);margin-bottom:16px">${lead.homeowner || 'No name'} ${lead.phone ? '- ' + lead.phone : ''}</p>
      <div style="margin-bottom:16px"><strong style="font-size:12px;color:var(--gray)">STATUS</strong><div class="chip-row">${sBtns}</div></div>
      ${lead.status !== 'claim_filed' && lead.status !== 'won' ? `<button class="btn-add" id="btn-file-claim" onclick="fileClaim('${id}',this)" style="margin-bottom:16px">Mark as Claim Filed</button>` : ''}
      <div style="font-size:14px;margin-bottom:16px"><strong>Job:</strong> ${(lead.jobTypes || [lead.jobType]).join(', ')} | <strong>Source:</strong> ${lead.source} | <strong>Type:</strong> ${lead.jobCategory || 'insurance'}</div>
      ${lead.notes ? `<div style="padding:12px;background:var(--bg);border-radius:6px;margin-bottom:16px;font-size:14px">${lead.notes}</div>` : ''}
      ${measHtml}
      <div id="photo-section" style="margin:16px 0"></div>
      ${!lead.measurements ? `<button class="btn-add" style="background:var(--navy);margin-bottom:12px" onclick="orderHover('${id}',this)">Order Hover Measurement</button>` : ''}
      <div id="lead-documents-section" style="margin-bottom:16px"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
        ${lead.phone ? `<a href="tel:${lead.phone}" class="chip" style="text-decoration:none">Call</a><a href="sms:${lead.phone}" class="chip" style="text-decoration:none">Text</a>` : ''}
        ${lead.portalJobId ? `<a href="https://crc-supplements-portal.onrender.com/#job-${lead.portalJobId}" target="_blank" class="chip" style="text-decoration:none;background:var(--navy);color:white">Open in Portal</a>` : ''}
        <button class="chip" style="background:var(--navy);color:white" onclick="switchView('brain')">&#129504; Ask Brain</button>
      </div>
      <div style="margin-bottom:16px">
        <button class="btn-share-homeowner" onclick="openHomeownerShareModal('${id}')">
          <span style="font-size:16px">&#128228;</span> ${shareLabel}
        </button>
        ${sharedCount > 0 ? `<div style="font-size:12px;color:var(--gray);text-align:center;margin-top:4px">${sharedCount} of ${totalPhotos} photos shared with homeowner</div>` : ''}
      </div>
      <button onclick="backToLeads()" style="padding:12px;width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:14px;cursor:pointer">Back to Leads</button>
    </div>`;
    // Load photo system
    loadPhotos(id);
    // Load documents from portal
    if (lead.portalJobId) loadLeadDocuments(lead.portalJobId);
  } catch (e) { alert('Error: ' + e.message); }
}
function backToLeads() {
  document.getElementById('lead-detail').classList.remove('open');
  document.getElementById('leads-main').style.display = '';
  loadLeads();
}
async function updateStatus(id, status) {
  try { await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); viewLead(id); }
  catch (e) { alert('Failed to update status: ' + e.message); }
}
async function fileClaim(id, btn) {
  try {
    const lead = await fetch(`/api/leads/${id}`).then(r => r.json());
    if (!confirm('File claim for ' + (lead.homeowner||'Unknown') + ' at ' + lead.address + '?\n\nSends to CRC Claims and builds the full report.')) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Filing...'; }
    await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'claim_filed' }) });
    alert('Claim filed! Report building automatically.'); viewLead(id);
  } catch (e) { alert('Error filing claim: ' + e.message); if (btn) { btn.disabled = false; btn.textContent = 'Mark as Claim Filed'; } }
}
// Photo modal now handled by photos.js
async function orderHover(leadId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Ordering Hover...'; }
  try {
    const data = await fetch(`/api/hover/order/${leadId}`, { method: 'POST' }).then(r => r.json());
    alert(data.message || 'Hover ordered'); viewLead(leadId);
  } catch (e) { alert('Error: ' + e.message); if (btn) { btn.disabled = false; btn.textContent = 'Order Hover Measurement'; } }
}

// --- Homeowner Photo Share Modal ---
async function openHomeownerShareModal(leadId) {
  try {
    const lead = await fetch(`/api/leads/${leadId}`).then(r => r.json());
    const allPhotos = [...(lead.photos?.inspection || []), ...(lead.photos?.build || [])];
    const shared = lead.homeownerSharedPhotos || [];
    if (!allPhotos.length) { alert('No photos to share yet. Take some photos first.'); return; }

    const modal = document.getElementById('photo-modal');
    modal.style.display = 'flex';
    modal.innerHTML = `<div class="homeowner-share-modal">
      <div class="hsm-header">
        <h3>Share with Homeowner</h3>
        <button onclick="closeHomeownerShareModal()" style="background:none;border:none;color:var(--gray);font-size:24px;cursor:pointer">&times;</button>
      </div>
      <div class="hsm-actions">
        <button class="chip" onclick="hsSelectAll(true)">Select All</button>
        <button class="chip" onclick="hsSelectAll(false)">Deselect All</button>
        <span id="hs-count" style="font-size:12px;color:var(--gray);margin-left:auto">${shared.length} of ${allPhotos.length} selected</span>
      </div>
      <div class="hsm-grid">
        ${allPhotos.map((p, i) => {
          const isShared = shared.includes(p.url || p.thumbnail);
          return `<div class="hsm-thumb ${isShared ? 'selected' : ''}" onclick="hsToggle(this)" data-url="${p.url || p.thumbnail}">
            <img src="${p.thumbnail || p.url}" loading="lazy">
            <div class="hsm-check">${isShared ? '&#10003;' : ''}</div>
            <span class="tag-badge">${(p.tag || 'photo').replace('-',' ')}</span>
          </div>`;
        }).join('')}
      </div>
      <button class="btn-add" onclick="saveHomeownerShare('${leadId}')" style="margin:12px 16px;width:calc(100% - 32px)">Share Selected</button>
    </div>`;
  } catch (e) { alert('Error loading photos: ' + e.message); }
}
function closeHomeownerShareModal() { const m = document.getElementById('photo-modal'); m.style.display = 'none'; m.innerHTML = ''; }
function hsToggle(el) {
  el.classList.toggle('selected');
  el.querySelector('.hsm-check').innerHTML = el.classList.contains('selected') ? '&#10003;' : '';
  updateHsCount();
}
function hsSelectAll(select) {
  document.querySelectorAll('.hsm-thumb').forEach(el => {
    el.classList.toggle('selected', select);
    el.querySelector('.hsm-check').innerHTML = select ? '&#10003;' : '';
  });
  updateHsCount();
}
function updateHsCount() {
  const total = document.querySelectorAll('.hsm-thumb').length;
  const selected = document.querySelectorAll('.hsm-thumb.selected').length;
  const el = document.getElementById('hs-count');
  if (el) el.textContent = `${selected} of ${total} selected`;
}
async function saveHomeownerShare(leadId) {
  const urls = [...document.querySelectorAll('.hsm-thumb.selected')].map(el => el.dataset.url);
  try {
    await fetch(`/api/leads/${leadId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ homeownerSharedPhotos: urls }) });
    closeHomeownerShareModal();
    viewLead(leadId);
  } catch (e) { alert('Error saving: ' + e.message); }
}

// --- Utility ---
function timeAgo(t) { if (!t) return ''; const d = Date.now() - new Date(t).getTime(); if (d < 3600000) return Math.round(d/60000) + 'm ago'; if (d < 86400000) return Math.round(d/3600000) + 'h ago'; return Math.round(d/86400000) + 'd ago'; }

// --- Current Location for Address Entry ---
async function useCurrentLocation() {
  const btn = document.getElementById('btn-current-location');
  const status = document.getElementById('location-status');
  const input = document.getElementById('lead-address');
  
  if (!navigator.geolocation) {
    status.textContent = 'Geolocation not supported';
    status.style.display = 'block';
    return;
  }
  
  btn.style.opacity = '0.5';
  btn.disabled = true;
  status.textContent = 'Getting location...';
  status.style.display = 'block';
  
  navigator.geolocation.getCurrentPosition(
    async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const resp = await fetch(`/api/maps/reverse-geocode?lat=${latitude}&lng=${longitude}`);
        const data = await resp.json();
        if (data.address) {
          input.value = data.address;
          selectedAddress = data.address;
          status.textContent = '📍 Location found';
          // Trigger street view preview if function exists
          if (typeof showStreetView === 'function') showStreetView(data.address);
          if (typeof loadStreetView === 'function') loadStreetView(data.address);
        } else {
          status.textContent = 'Could not resolve address';
        }
      } catch (e) {
        status.textContent = 'Error: ' + e.message;
      }
      btn.style.opacity = '1';
      btn.disabled = false;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    },
    (err) => {
      status.textContent = err.code === 1 ? 'Location access denied' : 'Could not get location';
      status.style.display = 'block';
      btn.style.opacity = '1';
      btn.disabled = false;
      setTimeout(() => { status.style.display = 'none'; }, 3000);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

// ── RECRUIT SHARING ──────────────────
function showRecruitOptions() {
  const url = 'https://crc-field.onrender.com/recruit';
  const modal = document.getElementById('knock-modal');
  modal.style.display = 'flex';
  modal.querySelector('#knock-options').innerHTML = `
    <div style="font-size:14px;font-weight:600;color:var(--navy);margin-bottom:8px">Share the Opportunity</div>
    <button class="btn-add" onclick="shareRecruitLink()" style="background:var(--teal)">Share Recruit Link</button>
    <button class="btn-add" onclick="document.getElementById('knock-modal').style.display='none';window.open('/docs/career-guide','_blank')" style="background:var(--navy)">View Career Guide</button>
    <button onclick="document.getElementById('knock-modal').style.display='none'" style="padding:12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;cursor:pointer;font-size:14px;margin-top:4px;width:100%">Cancel</button>`;
}
function shareRecruitLink() {
  document.getElementById('knock-modal').style.display = 'none';
  const url = 'https://crc-field.onrender.com/recruit';
  const text = 'Join the CRC team -- apply here: ' + url;
  if (navigator.share) { navigator.share({ title: 'Join CRC', text: text, url: url }).catch(() => {}); }
  else { navigator.clipboard.writeText(url).then(() => alert('Link copied to clipboard')).catch(() => alert(url)); }
}

// ── LEAD DOCUMENTS + SIGNATURE ──────────────────
const PORTAL_URL = 'https://crc-supplements-portal.onrender.com';

async function loadLeadDocuments(portalJobId) {
  const el = document.getElementById('lead-documents-section');
  if (!el) return;
  try {
    const docs = await fetch(`${PORTAL_URL}/api/jobs/${portalJobId}/documents`).then(r => r.json());
    if (!docs.length) { el.innerHTML = '<div style="padding:12px;background:var(--bg);border-radius:6px;font-size:13px;color:var(--gray)">No documents yet</div>'; return; }
    let html = '<div style="padding:12px;background:var(--bg);border-radius:6px"><strong style="font-size:12px;color:var(--gray)">DOCUMENTS</strong>';
    for (const d of docs) {
      const sigBadge = d.signatureStatus === 'signed' ? '<span style="background:#16A34A;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700">Signed</span>'
        : d.signatureStatus === 'sent' ? '<span style="background:#B8860B;color:#fff;padding:1px 5px;border-radius:3px;font-size:9px;font-weight:700">Sent</span>'
        : '';
      const isPdf = (d.filename || '').toLowerCase().endsWith('.pdf');
      html += `<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${d.filename} ${sigBadge}</div>
        ${isPdf && !d.signatureStatus ? `<button class="chip" style="font-size:11px" onclick="openSignatureModal('${portalJobId}','${d.id}')">Sign</button>` : ''}
        <a href="${PORTAL_URL}/api/jobs/${portalJobId}/documents/${d.id}/download" target="_blank" class="chip" style="text-decoration:none;font-size:11px">View</a>
      </div>`;
    }
    html += '</div>';
    el.innerHTML = html;
  } catch (e) {
    el.innerHTML = '<div style="padding:12px;background:var(--bg);border-radius:6px;font-size:13px;color:var(--gray)">Could not load documents</div>';
  }
}

function openSignatureModal(portalJobId, docId) {
  const modal = document.createElement('div');
  modal.id = 'sig-modal';
  modal.style.cssText = 'position:fixed;inset:0;background:#fff;z-index:9999;display:flex;flex-direction:column;padding:16px';
  modal.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
      <strong style="font-size:14px">Sign Document</strong>
      <button onclick="closeSignatureModal()" style="font-size:20px;background:none;border:none;cursor:pointer">&times;</button>
    </div>
    <p style="font-size:13px;color:var(--gray);margin-bottom:8px">Sign below with your finger</p>
    <canvas id="sig-canvas" style="flex:1;border:2px solid var(--border);border-radius:8px;touch-action:none;background:#fff"></canvas>
    <div style="display:flex;gap:8px;margin-top:12px">
      <button onclick="clearSignature()" class="chip" style="flex:1;padding:12px;font-size:14px">Clear</button>
      <button onclick="submitSignature('${portalJobId}','${docId}')" class="chip" style="flex:1;padding:12px;font-size:14px;background:var(--teal);color:#fff">Done</button>
    </div>`;
  document.body.appendChild(modal);
  setTimeout(() => initSignatureCanvas(), 50);
}

function closeSignatureModal() {
  const m = document.getElementById('sig-modal');
  if (m) m.remove();
}

let sigCtx = null, sigDrawing = false;
function initSignatureCanvas() {
  const canvas = document.getElementById('sig-canvas');
  if (!canvas) return;
  canvas.width = canvas.offsetWidth * 2;
  canvas.height = canvas.offsetHeight * 2;
  sigCtx = canvas.getContext('2d');
  sigCtx.scale(2, 2);
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round';
  sigCtx.strokeStyle = '#000';
  const getPos = (e) => {
    const r = canvas.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  };
  const start = (e) => { e.preventDefault(); sigDrawing = true; const p = getPos(e); sigCtx.beginPath(); sigCtx.moveTo(p.x, p.y); };
  const move = (e) => { if (!sigDrawing) return; e.preventDefault(); const p = getPos(e); sigCtx.lineTo(p.x, p.y); sigCtx.stroke(); };
  const end = () => { sigDrawing = false; };
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mouseup', end);
}

function clearSignature() {
  const canvas = document.getElementById('sig-canvas');
  if (canvas && sigCtx) sigCtx.clearRect(0, 0, canvas.width, canvas.height);
}

async function submitSignature(portalJobId, docId) {
  try {
    const res = await fetch(`${PORTAL_URL}/api/jobs/${portalJobId}/send-for-signature`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docId, mode: 'in-person' })
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    closeSignatureModal();
    if (data.signers?.[0]?.embedUrl) {
      window.open(data.signers[0].embedUrl, '_blank');
    } else {
      alert('Signature request submitted');
    }
    loadLeadDocuments(portalJobId);
  } catch (e) {
    alert('Signature failed: ' + e.message);
  }
}

// ── PHOTO MARKUP ─────────────────────────────────────────────────────────────
// openFieldPhotoMarkup — opens the drawing canvas from markup.js and overrides
// the save button to POST to field-app endpoints (local lead store + portal sync).
// category is 'inspection' or 'build' (defaults to activePhotoTab).
function openFieldPhotoMarkup(photoUrl, leadId, photoIndex, category) {
  // markup.js openMarkupCanvas sets up the drawing canvas
  openMarkupCanvas(photoUrl, leadId, 'photo');
  // After the canvas loads (image fetch + DOM build), swap the Save button's handler
  setTimeout(() => {
    const saveBtn = document.querySelector('#markup-modal .btn-primary');
    if (saveBtn) {
      const cat = category || (typeof activePhotoTab !== 'undefined' ? activePhotoTab : 'inspection');
      saveBtn.setAttribute('onclick', 'saveFieldPhotoMarkup("' + leadId + '",' + photoIndex + ',"' + cat + '")');
    }
  }, 500);
}

async function saveFieldPhotoMarkup(leadId, photoIndex, category) {
  const { overlayCanvas, canvas, strokes } = markupState; // markupState is from markup.js
  if (!canvas || !overlayCanvas) return;

  // Composite background + overlay into a single PNG
  const composite = document.createElement('canvas');
  composite.width = canvas.width;
  composite.height = canvas.height;
  const compCtx = composite.getContext('2d');
  compCtx.drawImage(canvas, 0, 0);
  compCtx.drawImage(overlayCanvas, 0, 0);
  const markupData = composite.toDataURL('image/png');

  try {
    // Save markup locally on the lead
    await fetch('/api/leads/' + leadId + '/photos/markup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ photoIndex, markupData, strokes, category: category || 'inspection' })
    });

    // If lead has a portalJobId, also sync markup to portal
    const lead = await fetch('/api/leads/' + leadId).then(r => r.json());
    if (lead.portalJobId) {
      await fetch('/api/field/jobs/' + lead.portalJobId + '/photos/markup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ originalIndex: photoIndex, markupData, strokes })
      }).catch(e => console.warn('[Markup] Portal sync failed (non-fatal):', e.message));
    }

    closeMarkupCanvas();
    if (typeof showToast === 'function') showToast('Markup saved');
    // Reload the photo section so the markup indicator appears
    if (typeof loadPhotos === 'function' && leadId) loadPhotos(leadId);
  } catch (e) {
    alert('Save failed: ' + e.message);
  }
}

// ── PROPERTY INSPECTION AUTHORIZATION ──────────────────────────────────────
// Rewritten 2026-04: This is NOT an insurance commitment. It's inspection
// access + liability protection. Seven required acknowledgments + signature.
var _sigAuthCtx = null, _sigAuthDrawing = false, _sigAuthHasStrokes = false;

var AUTH_ITEMS = [
  'I authorize Columbus Roofing Company ("CRC") to access my property for the purpose of conducting a visual inspection of the roof and exterior.',
  'I understand this inspection is provided at no cost and does not obligate me to purchase any services from CRC.',
  'I authorize CRC to photograph and document the condition of my property, including the roof, siding, gutters, and any visible damage, for the sole purpose of assessment and reporting.',
  'I acknowledge that CRC is not responsible for any pre-existing damage, deterioration, or conditions present on the property prior to inspection.',
  'I release CRC and its representatives from liability for any injury sustained during the inspection, provided CRC exercises reasonable care and follows standard safety protocols.',
  'If I choose to file an insurance claim, I authorize CRC to be present during the adjuster\'s inspection to assist with documentation and scope review on my behalf.',
  'I understand that CRC\'s findings and recommendations are professional opinions based on visual inspection only, and that final determination of damage and coverage is made by my insurance carrier.'
];

function openSignatureScreen(jobId, jobAddress, homeownerName) {
  var existing = document.getElementById('sig-auth-overlay');
  if (existing) existing.remove();

  var escHtml = function(s) {
    return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  var inspectorName = (typeof repName !== 'undefined' && repName) ? repName : '';

  var overlay = document.createElement('div');
  overlay.id = 'sig-auth-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:500;background:#fff;display:flex;flex-direction:column;overflow:hidden';

  var itemsHtml = AUTH_ITEMS.map(function(text, i) {
    return ''
      + '<label class="auth-item" data-idx="' + i + '" for="auth-chk-' + i + '" '
      + 'style="display:flex;gap:12px;align-items:flex-start;padding:12px 14px;background:#fff;border:1.5px solid #cbd5e1;border-radius:10px;margin-bottom:10px;cursor:pointer;transition:border-color .15s, background .15s">'
      + '<input type="checkbox" id="auth-chk-' + i + '" onchange="_onAuthItemToggle(this)" '
      + 'style="width:22px;height:22px;margin:0;flex-shrink:0;accent-color:#00B5CC;cursor:pointer">'
      + '<span style="font-size:13px;line-height:1.55;color:#1e293b">' + escHtml(text) + '</span>'
      + '</label>';
  }).join('');

  overlay.innerHTML = ''
    + '<div style="background:#001A4D;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px;flex-shrink:0">'
    + '<div style="font-weight:800;font-size:15px;letter-spacing:1.5px;color:#fff">CRC</div>'
    + '<div style="font-size:14px;font-weight:700;flex:1;text-align:center;letter-spacing:0.3px">Property Inspection Authorization</div>'
    + '<button onclick="document.getElementById(\'sig-auth-overlay\').remove()" style="background:none;border:none;color:#fff;font-size:26px;line-height:1;cursor:pointer;padding:0;flex-shrink:0">&times;</button>'
    + '</div>'
    + '<div style="flex:1;overflow-y:auto;padding:16px;-webkit-overflow-scrolling:touch" id="sig-auth-body">'
    + '<div style="max-width:720px;margin:0 auto">'
    + '<div style="text-align:center;font-size:11px;font-weight:700;color:#64748B;letter-spacing:0.8px;text-transform:uppercase;margin-bottom:4px">Columbus Roofing Company</div>'
    + '<h2 style="text-align:center;font-size:20px;font-weight:800;color:#001A4D;margin:0 0 6px">Property Inspection Authorization</h2>'
    + '<div style="text-align:center;font-size:12px;color:#64748B;margin-bottom:14px">' + escHtml(jobAddress || '') + ' &middot; ' + today + '</div>'
    + '<div style="font-size:12px;font-weight:700;color:#001A4D;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:10px">Please review and check each item</div>'
    + itemsHtml
    + '<div style="margin-top:18px">'
    + '<label for="sig-auth-name" style="display:block;font-size:11px;font-weight:700;color:#001A4D;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Homeowner Printed Name</label>'
    + '<input type="text" id="sig-auth-name" placeholder="Full name" value="' + escHtml(homeownerName) + '" '
    + 'style="width:100%;padding:12px 14px;border:2px solid #cbd5e1;border-radius:8px;font-size:16px;box-sizing:border-box;font-family:inherit;color:#001A4D">'
    + '</div>'
    + '<div style="margin-top:14px">'
    + '<label style="display:block;font-size:11px;font-weight:700;color:#001A4D;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Homeowner Signature</label>'
    + '<canvas id="sig-auth-canvas" style="width:100%;height:200px;background:#fff;border:2px solid #001A4D;border-radius:8px;display:block;touch-action:none"></canvas>'
    + '<div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-top:4px">'
    + '<span>Draw above with finger or Apple Pencil</span>'
    + '<button type="button" onclick="sigAuthClear()" style="background:none;border:none;color:#00B5CC;font-size:11px;font-weight:700;cursor:pointer;padding:0">Clear</button>'
    + '</div>'
    + '</div>'
    + '<div style="margin-top:18px;padding:12px 14px;background:#F0F9FF;border-radius:8px;border-left:3px solid #00B5CC;font-size:12px;color:#334155;line-height:1.6">'
    + '<div><strong>Inspected by:</strong> ' + escHtml(inspectorName || '—') + '</div>'
    + '<div><strong>CRC License:</strong> HIC.L00838 &middot; <strong>GAF Certified:</strong> G09361</div>'
    + '<div>Columbus Roofing Company &middot; crc@columbusroofingco.com &middot; 614-824-7462</div>'
    + '</div>'
    + '<div id="sig-auth-error" style="display:none;color:#DC2626;font-size:13px;font-weight:600;padding:10px 14px;background:#fef2f2;border-radius:6px;margin-top:14px;border-left:3px solid #DC2626"></div>'
    + '<div style="margin-top:18px;margin-bottom:24px">'
    + '<button id="sig-auth-submit-btn" onclick="sigAuthSubmit(\'' + jobId + '\',\'' + escHtml(jobAddress) + '\')" disabled '
    + 'style="width:100%;padding:14px;background:#94A3B8;color:#fff;border:none;border-radius:10px;font-size:15px;font-weight:800;cursor:not-allowed;letter-spacing:0.4px;font-family:inherit">'
    + 'Check all items to continue</button>'
    + '</div>'
    + '</div>'
    + '</div>';

  document.body.appendChild(overlay);
  _sigAuthHasStrokes = false;
  _sigAuthCtx = null;
  _sigAuthDrawing = false;
  setTimeout(function() { sigAuthInitCanvas(); _onAuthItemToggle(); }, 50);
}

// Tracks which acknowledgment items are checked; enables submit only when all 7 + signature.
function _onAuthItemToggle(cb) {
  if (cb) {
    var label = cb.closest('.auth-item');
    if (label) {
      label.style.borderColor = cb.checked ? '#00B5CC' : '#cbd5e1';
      label.style.background  = cb.checked ? '#F0F9FF' : '#fff';
    }
  }
  var checks = document.querySelectorAll('#sig-auth-body input[type="checkbox"]');
  var allChecked = checks.length === AUTH_ITEMS.length
    && Array.prototype.every.call(checks, function(c) { return c.checked; });
  var btn = document.getElementById('sig-auth-submit-btn');
  if (btn) {
    if (allChecked) {
      btn.disabled = false;
      btn.style.background = '#001A4D';
      btn.style.cursor = 'pointer';
      btn.textContent = 'Complete & Sign';
    } else {
      btn.disabled = true;
      btn.style.background = '#94A3B8';
      btn.style.cursor = 'not-allowed';
      var remaining = AUTH_ITEMS.length - Array.prototype.filter.call(checks, function(c){return c.checked;}).length;
      btn.textContent = 'Check all items to continue (' + remaining + ' left)';
    }
  }
}

function sigAuthInitCanvas() {
  var canvas = document.getElementById('sig-auth-canvas');
  if (!canvas) return;
  var dpr = window.devicePixelRatio || 1;
  var rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  _sigAuthCtx = canvas.getContext('2d');
  _sigAuthCtx.scale(dpr, dpr);
  _sigAuthCtx.lineWidth = 2;
  _sigAuthCtx.lineCap = 'round';
  _sigAuthCtx.lineJoin = 'round';
  _sigAuthCtx.strokeStyle = '#000';
  _sigAuthHasStrokes = false;

  function getPos(e) {
    var r = canvas.getBoundingClientRect();
    var t = e.touches ? e.touches[0] : e;
    return { x: t.clientX - r.left, y: t.clientY - r.top };
  }
  function onStart(e) {
    e.preventDefault();
    _sigAuthDrawing = true;
    var p = getPos(e);
    _sigAuthCtx.beginPath();
    _sigAuthCtx.moveTo(p.x, p.y);
  }
  function onMove(e) {
    if (!_sigAuthDrawing) return;
    e.preventDefault();
    var p = getPos(e);
    _sigAuthCtx.lineTo(p.x, p.y);
    _sigAuthCtx.stroke();
    _sigAuthHasStrokes = true;
  }
  function onEnd() { _sigAuthDrawing = false; }

  canvas.addEventListener('touchstart', onStart, { passive: false });
  canvas.addEventListener('touchmove',  onMove,  { passive: false });
  canvas.addEventListener('touchend',   onEnd);
  canvas.addEventListener('mousedown',  onStart);
  canvas.addEventListener('mousemove',  onMove);
  canvas.addEventListener('mouseup',    onEnd);
}

function sigAuthClear() {
  var canvas = document.getElementById('sig-auth-canvas');
  if (canvas && _sigAuthCtx) {
    _sigAuthCtx.clearRect(0, 0, canvas.width, canvas.height);
    _sigAuthHasStrokes = false;
  }
}

async function sigAuthSubmit(jobId, jobAddress) {
  var nameEl  = document.getElementById('sig-auth-name');
  var errEl   = document.getElementById('sig-auth-error');
  var canvas  = document.getElementById('sig-auth-canvas');
  var submitBtn = document.getElementById('sig-auth-submit-btn');
  var signerName = nameEl ? nameEl.value.trim() : '';

  errEl.style.display = 'none';

  if (!signerName) {
    errEl.textContent = 'Please enter the homeowner\'s full name.';
    errEl.style.display = 'block';
    if (nameEl) nameEl.focus();
    return;
  }
  if (!_sigAuthHasStrokes) {
    errEl.textContent = 'Please sign in the box above before submitting.';
    errEl.style.display = 'block';
    return;
  }

  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Submitting\u2026'; }

  try {
    var signatureDataUrl = canvas.toDataURL('image/png');
    var res = await fetch('/api/field/jobs/' + jobId + '/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        signatureDataUrl: signatureDataUrl,
        signedAt: new Date().toISOString(),
        signerName: signerName,
        repName: typeof repName !== 'undefined' ? repName : '',
        authVariant: 'property-inspection',
        acknowledgedItems: AUTH_ITEMS.slice(),
        propertyAddress: jobAddress || ''
      })
    });
    var data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Submission failed');

    var body = document.getElementById('sig-auth-body');
    if (body) {
      body.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:40px;text-align:center">'
        + '<div style="font-size:72px;margin-bottom:16px">&#9989;</div>'
        + '<div style="font-size:24px;font-weight:800;color:#001A4D;margin-bottom:8px">Authorization signed.</div>'
        + '<div style="font-size:14px;color:#64748B;max-width:340px">You may now begin the inspection. A signed PDF has been saved to this job.</div>'
        + '</div>';
    }

    setTimeout(function() {
      var overlay = document.getElementById('sig-auth-overlay');
      if (overlay) overlay.remove();
      if (typeof showToast === 'function') showToast('Authorization saved');
      if (typeof _currentJobDetail !== 'undefined' && _currentJobDetail && _currentJobDetail.id === jobId && typeof openJobDetail === 'function') {
        openJobDetail(jobId);
      }
    }, 1500);

  } catch (e) {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Complete & Sign'; }
    errEl.textContent = 'Error: ' + e.message;
    errEl.style.display = 'block';
  }
}

/* ============================================================
   DAILY CHECK-IN
   ============================================================ */
const CI_KEY = 'crc-checkin-date';

function initCheckin() {
  const banner = document.getElementById('checkin-banner');
  if (!banner || !repCode) return;
  const today = new Date().toISOString().split('T')[0];
  const stored = localStorage.getItem(CI_KEY);
  if (stored === today) {
    // Already submitted today — show done state
    const doneText = localStorage.getItem('crc-checkin-today-text') || '';
    document.getElementById('checkin-banner-prompt').style.display = 'none';
    document.getElementById('checkin-done').style.display = 'block';
    document.getElementById('checkin-done-text').textContent = doneText;
    banner.style.display = 'block';
  } else {
    // Not yet submitted — show prompt
    banner.style.display = 'block';
  }
}

function toggleCheckin() {
  const form = document.getElementById('checkin-form');
  const chevron = document.getElementById('checkin-chevron');
  const open = form.style.display !== 'none';
  form.style.display = open ? 'none' : 'block';
  chevron.textContent = open ? '▼' : '▲';
}

async function submitCheckin() {
  const today = document.getElementById('ci-today').value.trim();
  const errEl = document.getElementById('ci-error');
  if (!today) { errEl.textContent = 'Please fill in what you\'re working on today.'; return; }
  errEl.textContent = '';
  try {
    const res = await fetch('/api/field/checkins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        repCode,
        repName: repName || repCode,
        closedYesterday: document.getElementById('ci-yesterday').value.trim(),
        workingToday: today,
        needHelp: document.getElementById('ci-help').value.trim()
      })
    });
    if (!res.ok) throw new Error('Server error');
    // Mark submitted in localStorage
    const dateStr = new Date().toISOString().split('T')[0];
    localStorage.setItem(CI_KEY, dateStr);
    localStorage.setItem('crc-checkin-today-text', today.substring(0, 80));
    // Swap UI to done state
    document.getElementById('checkin-banner-prompt').style.display = 'none';
    document.getElementById('checkin-form').style.display = 'none';
    document.getElementById('checkin-done').style.display = 'block';
    document.getElementById('checkin-done-text').textContent = today.substring(0, 80);
    if (typeof showToast === 'function') showToast('Check-in submitted ✓');
  } catch (e) {
    errEl.textContent = 'Failed to submit. Try again.';
  }
}

