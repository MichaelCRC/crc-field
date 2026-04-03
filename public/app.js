/* CRC Field Intel -- Mobile Frontend */
let repCode = localStorage.getItem('crc-rep-code') || '';
let repName = localStorage.getItem('crc-rep-name') || '';
let repRole = localStorage.getItem('crc-rep-role') || '';
let selectedAddress = '';
let mapInitialized = false;
let stormsLoaded = false;
let gmap = null, mapMarkers = [], knockMode = false, dropPinMode = false;
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
    document.getElementById('rep-badge').textContent = `${code} - ${data.name}`;
    if (data.role === 'admin') { document.getElementById('nav-admin').style.display = ''; document.getElementById('nav-stats').style.display = ''; document.getElementById('chat-tab-leadership').style.display = ''; }
    loadLeads();
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
  if (name === 'leads') { document.getElementById('lead-detail').style.display = 'none'; document.getElementById('leads-main').style.display = ''; loadLeads(); }
  if (name === 'storms') { /* Redirect storms to map view with overlay */ document.getElementById('view-storms').classList.remove('active'); document.getElementById('view-map').classList.add('active'); document.getElementById('nav-storms')?.classList.add('active'); document.getElementById('nav-map')?.classList.add('active'); if (!mapInitialized) initMap(); setTimeout(() => { if (!stormsLoaded) loadStorms(); showStormOverlay(); }, 300); return; }
  if (name === 'map' && !mapInitialized) initMap();
  if (name === 'stats') loadStats();
  if (name === 'chat') initChat();
  if (name === 'brain') initBrain();
  if (name === 'admin') loadAdmin();
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
    };
    const lead = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json());
    document.getElementById('lead-confirm').style.display = 'block';
    document.getElementById('lead-confirm').innerHTML = `<div class="checkmark">&#10003;</div><p>Lead added -- ${lead.homeowner || 'Unknown'} at ${lead.address}</p>
      <button onclick="clearLeadForm()" style="background:var(--teal);color:white">Add Another</button>
      <button onclick="switchView('map')" style="background:var(--navy);color:white">View on Map</button>`;
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
    c.innerHTML = recent.map(l => `<div class="lead-card" onclick="viewLead('${l.id}')">
      ${l.streetViewUrl ? `<img class="lead-thumb" src="${l.streetViewUrl}">` : '<div class="lead-thumb"></div>'}
      <div class="lead-info"><h4>${l.address}</h4><p>${l.homeowner || 'No name'} ${l.phone ? '- ' + l.phone : ''}</p></div>
      <div class="lead-meta"><span class="status-dot status-${l.status}"></span>
        <div style="font-size:11px;color:var(--gray);margin-top:4px">${l.jobType || ''}</div>
        ${(l.photos?.inspection?.length || l.photos?.length) ? '<div style="font-size:10px;color:var(--gray)">&#128247; '+((l.photos?.inspection?.length||0)+(l.photos?.build?.length||0)||(l.photos?.length||0))+'</div>' : ''}
        <div style="font-size:10px;color:var(--gray)">${new Date(l.createdAt).toLocaleTimeString([],{hour:'numeric',minute:'2-digit'})}</div>
      </div></div>`).join('');
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
    detail.style.display = 'block';
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
  document.getElementById('lead-detail').style.display = 'none';
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

