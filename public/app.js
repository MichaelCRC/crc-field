/* CRC Field Intel -- Mobile Frontend */
let repCode = localStorage.getItem('crc-rep-code') || '';
let repName = localStorage.getItem('crc-rep-name') || '';
let repRole = localStorage.getItem('crc-rep-role') || '';
let selectedAddress = '';
let mapInitialized = false;
let stormsLoaded = false;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
  if (repCode) { validateAndEnter(repCode); } else { document.getElementById('gate').style.display = 'flex'; }
  initChips();
});

// --- Rep Code Gate ---
async function submitRepCode() {
  const code = document.getElementById('gate-code').value.trim().toUpperCase();
  if (!code) return;
  await validateAndEnter(code);
}
async function validateAndEnter(code) {
  try {
    const res = await fetch(`/api/rep-codes/validate?code=${code}`);
    const data = await res.json();
    if (!data.valid) {
      document.getElementById('gate-error').textContent = 'Invalid or deactivated rep code';
      document.getElementById('gate').style.display = 'flex';
      document.getElementById('app').style.display = 'none';
      return;
    }
    repCode = code; repName = data.name; repRole = data.role;
    localStorage.setItem('crc-rep-code', code);
    localStorage.setItem('crc-rep-name', data.name);
    localStorage.setItem('crc-rep-role', data.role);
    document.getElementById('gate').style.display = 'none';
    document.getElementById('app').style.display = '';
    document.getElementById('rep-badge').textContent = `${code} - ${data.name}`;
    if (data.role === 'admin') document.getElementById('nav-admin').style.display = '';
    loadLeads();
  } catch { document.getElementById('gate-error').textContent = 'Connection error'; }
}

// --- Address Autocomplete ---
let acTimeout = null;
document.addEventListener('DOMContentLoaded', () => {
  const addrInput = document.getElementById('lead-address');
  if (addrInput) {
    addrInput.addEventListener('input', () => {
      clearTimeout(acTimeout);
      const val = addrInput.value.trim();
      if (val.length < 3) { hideSuggestions(); return; }
      acTimeout = setTimeout(() => fetchSuggestions(val), 300);
    });
    addrInput.addEventListener('blur', () => setTimeout(hideSuggestions, 200));
  }
});
async function fetchSuggestions(input) {
  try {
    const res = await fetch(`/api/maps/autocomplete?input=${encodeURIComponent(input)}`);
    const data = await res.json();
    const box = document.getElementById('address-suggestions');
    if (!data.predictions?.length) { hideSuggestions(); return; }
    box.innerHTML = data.predictions.map(p => `<div class="suggestion-item" onmousedown="selectAddress('${p.place_id}','${p.description.replace(/'/g,"&#39;")}')">${p.description}</div>`).join('');
    box.classList.add('show');
  } catch { hideSuggestions(); }
}
function hideSuggestions() { const b = document.getElementById('address-suggestions'); if (b) { b.classList.remove('show'); b.innerHTML = ''; } }
async function selectAddress(placeId, desc) {
  document.getElementById('lead-address').value = desc;
  selectedAddress = desc;
  hideSuggestions();
  // Get details (lat/lng, city, zip, county)
  try {
    const res = await fetch(`/api/maps/place-details?place_id=${placeId}`);
    const details = await res.json();
    if (details.lat) {
      selectedAddress = details.address || desc;
      document.getElementById('lead-address').value = selectedAddress;
      document.getElementById('lead-address').dataset.lat = details.lat;
      document.getElementById('lead-address').dataset.lng = details.lng;
      document.getElementById('lead-address').dataset.city = details.city || '';
      document.getElementById('lead-address').dataset.state = details.state || 'OH';
      document.getElementById('lead-address').dataset.zip = details.zip || '';
      document.getElementById('lead-address').dataset.county = details.county || '';
    }
  } catch {}
  // Load Street View preview
  try {
    const sv = await fetch(`/api/maps/streetview?address=${encodeURIComponent(selectedAddress)}`);
    const svData = await sv.json();
    if (svData.url) {
      document.getElementById('street-view-preview').innerHTML = `<img src="${svData.url}" alt="Street View">`;
    }
  } catch {}
}

// --- Chip Selection ---
function initChips() {
  document.querySelectorAll('.chip-row').forEach(row => {
    row.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        row.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      });
    });
  });
}
function getChipVal(rowId) {
  const row = document.getElementById(rowId);
  return row?.querySelector('.chip.active')?.dataset.val || '';
}

// --- View Switching ---
function switchView(name) {
  document.querySelectorAll('.app-view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-' + name)?.classList.add('active');
  if (name === 'leads') loadLeads();
  if (name === 'map' && !mapInitialized) initMap();
  if (name === 'storms' && !stormsLoaded) loadStorms();
  if (name === 'admin') loadAdmin();
}

// --- Leads ---
async function addLead() {
  const addr = document.getElementById('lead-address').value.trim();
  if (!addr) return alert('Enter a property address');
  const btn = document.getElementById('btn-add-lead');
  btn.disabled = true; btn.textContent = 'Adding...';
  try {
    const addrEl = document.getElementById('lead-address');
    const svRes = await fetch(`/api/maps/streetview?address=${encodeURIComponent(selectedAddress || addr)}&size=80x60`).then(r=>r.json()).catch(()=>({}));
    const body = {
      address: selectedAddress || addr,
      lat: parseFloat(addrEl.dataset.lat) || null,
      lng: parseFloat(addrEl.dataset.lng) || null,
      city: addrEl.dataset.city || '',
      state: addrEl.dataset.state || 'OH',
      zip: addrEl.dataset.zip || '',
      county: addrEl.dataset.county || '',
      homeowner: document.getElementById('lead-name').value.trim(),
      phone: document.getElementById('lead-phone').value.trim(),
      jobType: getChipVal('job-type-chips'),
      source: getChipVal('source-chips'),
      notes: document.getElementById('lead-notes').value.trim(),
      streetViewUrl: svRes.url || '',
      repCode,
    };
    const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const lead = await res.json();
    // Show confirmation
    const confirm = document.getElementById('lead-confirm');
    confirm.style.display = 'block';
    confirm.innerHTML = `<div class="checkmark">&#10003;</div><p>Lead added -- ${lead.homeowner || 'Unknown'} at ${lead.address}</p>
      <button onclick="clearLeadForm()" style="background:var(--teal);color:white">Add Another</button>
      <button onclick="switchView('map')" style="background:var(--navy);color:white">View on Map</button>`;
    // Clear form
    document.getElementById('lead-address').value = '';
    document.getElementById('lead-name').value = '';
    document.getElementById('lead-phone').value = '';
    document.getElementById('lead-notes').value = '';
    document.getElementById('street-view-preview').innerHTML = '';
    selectedAddress = '';
    loadLeads();
  } catch (e) { alert('Error: ' + e.message); }
  btn.disabled = false; btn.textContent = 'ADD LEAD';
}

function clearLeadForm() {
  document.getElementById('lead-confirm').style.display = 'none';
  document.getElementById('lead-address').focus();
}

async function loadLeads() {
  const c = document.getElementById('leads-list');
  if (!c) return;
  try {
    const url = repRole === 'admin' ? '/api/leads' : `/api/leads?repCode=${repCode}`;
    const leads = await (await fetch(url)).json();
    const today = new Date().toDateString();
    const recent = leads.filter(l => new Date(l.createdAt).toDateString() === today);
    if (!recent.length) { c.innerHTML = '<p style="padding:16px;color:var(--gray);font-size:14px">No leads added today. Start adding!</p>'; return; }
    c.innerHTML = recent.map(l => `
      <div class="lead-card" onclick="viewLead('${l.id}')">
        ${l.streetViewUrl ? `<img class="lead-thumb" src="${l.streetViewUrl}" alt="">` : '<div class="lead-thumb"></div>'}
        <div class="lead-info">
          <h4>${l.address}</h4>
          <p>${l.homeowner || 'No name'} ${l.phone ? '- ' + l.phone : ''}</p>
        </div>
        <div class="lead-meta">
          <span class="status-dot status-${l.status}"></span>
          <div style="font-size:11px;color:var(--gray);margin-top:4px">${l.jobType}</div>
          <div style="font-size:10px;color:var(--gray)">${new Date(l.createdAt).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'})}</div>
        </div>
      </div>
    `).join('');
  } catch (e) { c.innerHTML = `<p style="padding:16px;color:var(--red)">${e.message}</p>`; }
}

async function viewLead(id) {
  try {
    const lead = await (await fetch(`/api/leads/${id}`)).json();
    const statuses = ['new','contacted','not_home','not_interested','appointment','won','lost'];
    const statusBtns = statuses.map(s => `<button class="chip ${lead.status===s?'active':''}" onclick="updateLeadStatus('${id}','${s}')">${s.replace('_',' ')}</button>`).join('');
    const html = `<div style="padding:16px;max-width:500px;margin:0 auto">
      ${lead.streetViewUrl ? `<img src="${lead.streetViewUrl}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;margin-bottom:16px">` : ''}
      <h2 style="font-size:18px;margin-bottom:4px">${lead.address}</h2>
      <p style="color:var(--gray);margin-bottom:16px">${lead.homeowner || 'No name'} ${lead.phone ? '- ' + lead.phone : ''}</p>
      <div style="margin-bottom:16px"><strong style="font-size:12px;color:var(--gray)">STATUS</strong><div class="chip-row">${statusBtns}</div></div>
      <div style="margin-bottom:16px;font-size:14px"><strong>Job Type:</strong> ${lead.jobType}<br><strong>Source:</strong> ${lead.source}<br><strong>Rep:</strong> ${lead.repCode}<br><strong>Added:</strong> ${new Date(lead.createdAt).toLocaleString()}</div>
      ${lead.notes ? `<div style="margin-bottom:16px;font-size:14px;padding:12px;background:var(--bg);border-radius:6px">${lead.notes}</div>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${lead.phone ? `<a href="tel:${lead.phone}" class="chip" style="text-decoration:none">Call</a><a href="sms:${lead.phone}" class="chip" style="text-decoration:none">Text</a>` : ''}
        ${lead.portalJobId ? `<a href="https://crc-supplements-portal.onrender.com/#job-${lead.portalJobId}" target="_blank" class="chip" style="text-decoration:none;background:var(--navy);color:white">Open in Portal</a>` : ''}
      </div>
      <button onclick="switchView('leads')" style="margin-top:16px;padding:12px;width:100%;background:var(--bg);border:1px solid var(--border);border-radius:8px;font-size:14px;cursor:pointer">Back to Leads</button>
    </div>`;
    const view = document.getElementById('view-leads');
    view.innerHTML = html;
  } catch (e) { alert('Error: ' + e.message); }
}

async function updateLeadStatus(id, status) {
  await fetch(`/api/leads/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
  viewLead(id);
}

// --- Map ---
let gmap = null;
let mapMarkers = [];
let knockMode = false;
async function initMap() {
  mapInitialized = true;
  try {
    const keyRes = await fetch('/api/maps/key');
    const keyData = await keyRes.json();
    if (!keyData.key) { showMapPlaceholder(); return; }
    // Load Google Maps JS
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${keyData.key}&callback=onMapsLoaded`;
    script.async = true; script.defer = true;
    window.onMapsLoaded = () => {
      gmap = new google.maps.Map(document.getElementById('map-container'), {
        center: { lat: 39.96, lng: -82.99 }, zoom: 11,
        mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      });
      // Try GPS
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
          gmap.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          gmap.setZoom(13);
        }, () => {}, { timeout: 5000 });
      }
      loadMapPins();
      // Door knock: click on map to add lead
      gmap.addListener('click', (e) => {
        if (!knockMode) return;
        const lat = e.latLng.lat(), lng = e.latLng.lng();
        const status = prompt('What happened at this door?\n\nType: not_home, not_interested, interested, no_answer');
        if (!status) return;
        fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng, source: 'Door Knock', status: status.toLowerCase().replace(/ /g,'_'), repCode })
        }).then(() => loadMapPins());
      });
    };
    document.head.appendChild(script);
  } catch { showMapPlaceholder(); }
}
function showMapPlaceholder() {
  document.getElementById('map-container').innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--gray)">Map requires Google Maps API key</div>';
}
async function loadMapPins() {
  if (!gmap) return;
  mapMarkers.forEach(m => m.setMap(null));
  mapMarkers = [];
  const leads = await (await fetch('/api/leads')).json();
  const colors = { new: '#3B82F6', contacted: '#F59E0B', not_home: '#F59E0B', appointment: '#16A34A', won: '#16A34A', not_interested: '#DC2626', lost: '#64748B' };
  leads.forEach(l => {
    if (!l.lat || !l.lng) return;
    const marker = new google.maps.Marker({
      position: { lat: l.lat, lng: l.lng }, map: gmap,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: colors[l.status] || '#3B82F6', fillOpacity: 0.9, strokeColor: '#FFF', strokeWeight: 2 },
    });
    const info = new google.maps.InfoWindow({
      content: `<div style="font-size:13px;max-width:200px"><strong>${l.address}</strong><br>${l.homeowner||''}${l.phone?' - '+l.phone:''}<br><span style="color:${colors[l.status]}">${l.status}</span><br><a href="#" onclick="viewLead('${l.id}');return false" style="color:#00B5CC">View Lead</a></div>`
    });
    marker.addListener('click', () => info.open(gmap, marker));
    mapMarkers.push(marker);
  });
}
function centerOnMe() {
  if (!gmap) return;
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(pos => {
      gmap.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      gmap.setZoom(15);
    });
  }
}
function toggleKnockMode() {
  knockMode = !knockMode;
  const btn = document.getElementById('btn-knock-mode');
  btn.classList.toggle('active', knockMode);
  btn.textContent = knockMode ? 'Knock Mode ON' : 'Door Knock Mode';
}

// --- Storms ---
async function loadStorms() {
  stormsLoaded = true;
  const list = document.getElementById('storm-list');
  const alert = document.getElementById('storm-alert');
  try {
    const data = await (await fetch('/api/storms')).json();
    const events = data.events || [];
    // Check for recent significant storms
    const weekAgo = Date.now() - 7 * 86400000;
    const recent = events.filter(e => new Date(e.date).getTime() > weekAgo && e.hailSize >= 1.0);
    if (recent.length > 0) {
      const newest = recent[0];
      alert.style.display = 'block';
      alert.innerHTML = `&#9928; New storm detected -- ${newest.date}<br>${newest.hailSize}" hail near ${newest.location}`;
    }
    // Render list
    list.innerHTML = events.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => {
      const sev = e.hailSize >= 2.0 ? 'severe' : e.hailSize >= 1.5 ? 'significant' : e.hailSize >= 1.0 ? 'moderate' : 'minor';
      return `<div class="storm-card">
        <div class="storm-size hail-${sev}">${e.hailSize}"</div>
        <div style="flex:1">
          <div style="font-weight:600;font-size:14px">${e.location}, ${e.county} Co.</div>
          <div style="font-size:12px;color:var(--gray)">${e.date} -- ${e.source}</div>
        </div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:${sev==='minor'?'var(--amber)':sev==='moderate'?'#EA580C':'var(--red)'}">${sev}</div>
      </div>`;
    }).join('');
    // Storm filter chips
    document.querySelectorAll('#storm-filter .chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#storm-filter .chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterStorms(chip.dataset.val, events);
      });
    });
  } catch (e) { list.innerHTML = `<p style="padding:16px;color:var(--red)">${e.message}</p>`; }
}

function filterStorms(val, allEvents) {
  let filtered = allEvents;
  if (val === '30') filtered = allEvents.filter(e => (Date.now() - new Date(e.date).getTime()) < 30*86400000);
  else if (val === '90') filtered = allEvents.filter(e => (Date.now() - new Date(e.date).getTime()) < 90*86400000);
  else if (parseFloat(val) > 0) filtered = allEvents.filter(e => e.hailSize >= parseFloat(val));
  document.getElementById('storm-list').innerHTML = filtered.sort((a,b) => new Date(b.date) - new Date(a.date)).map(e => {
    const sev = e.hailSize >= 2.0 ? 'severe' : e.hailSize >= 1.5 ? 'significant' : e.hailSize >= 1.0 ? 'moderate' : 'minor';
    return `<div class="storm-card"><div class="storm-size hail-${sev}">${e.hailSize}"</div><div style="flex:1"><div style="font-weight:600;font-size:14px">${e.location}, ${e.county} Co.</div><div style="font-size:12px;color:var(--gray)">${e.date}</div></div><div style="font-size:11px;font-weight:700;text-transform:uppercase;color:${sev==='minor'?'var(--amber)':'var(--red)'}">${sev}</div></div>`;
  }).join('');
}

// --- Admin ---
async function loadAdmin() {
  if (repRole !== 'admin') return;
  try {
    const [reps, leads, core] = await Promise.all([
      fetch(`/api/admin/reps?repCode=${repCode}`).then(r => r.json()),
      fetch('/api/leads').then(r => r.json()),
      fetch(`/api/admin/data-core?repCode=${repCode}`).then(r => r.json()),
    ]);
    // Stats
    document.getElementById('admin-stats').innerHTML = `
      <div class="admin-stat"><div class="val">${core.metadata?.total_contacts || 0}</div><div class="label">Contacts</div></div>
      <div class="admin-stat"><div class="val">${core.metadata?.total_properties || 0}</div><div class="label">Properties</div></div>
      <div class="admin-stat"><div class="val">${leads.length}</div><div class="label">Total Leads</div></div>
      <div class="admin-stat"><div class="val">${leads.filter(l=>l.status==='won').length}</div><div class="label">Won</div></div>`;
    // Rep performance
    document.getElementById('admin-reps').innerHTML = reps.map(r => `
      <div style="display:flex;justify-content:space-between;padding:12px 16px;background:var(--white);border-bottom:1px solid var(--border)">
        <div><strong>${r.name}</strong> (${r.code})</div>
        <div style="font-size:13px;color:var(--gray)">${r.thisWeek} this week / ${r.totalLeads} total / ${r.conversionRate}% close</div>
      </div>`).join('');
    // Rep codes management
    const allCodes = await fetch(`/api/admin/rep-codes?repCode=${repCode}`).then(r => r.json());
    document.getElementById('admin-rep-codes').innerHTML = `
      <div id="add-rep-form" style="display:none;padding:12px 16px;background:var(--white);border-bottom:1px solid var(--border)">
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input type="text" id="new-rep-code" placeholder="Code" style="width:100px;padding:8px;border:1px solid var(--border);border-radius:4px;text-transform:uppercase">
          <input type="text" id="new-rep-name" placeholder="Full Name" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:4px">
          <select id="new-rep-role" style="padding:8px;border:1px solid var(--border);border-radius:4px"><option value="rep">Rep</option><option value="admin">Admin</option></select>
          <button class="chip active" onclick="addRepCode()">Add</button>
          <button class="chip" onclick="document.getElementById('add-rep-form').style.display='none'">Cancel</button>
        </div>
      </div>` +
      allCodes.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--white);border-bottom:1px solid var(--border)">
        <div><strong>${c.code}</strong> -- ${c.name} <span style="font-size:11px;color:var(--gray)">(${c.role})</span></div>
        <div>${c.active ? (c.role !== 'admin' ? `<button class="chip" style="font-size:11px;padding:4px 10px" onclick="toggleRepCode('${c.code}',false)">Deactivate</button>` : '') : `<span style="color:var(--red);font-size:12px;margin-right:8px">Inactive</span><button class="chip" style="font-size:11px;padding:4px 10px" onclick="toggleRepCode('${c.code}',true)">Reactivate</button>`}</div>
      </div>`).join('');
    // Recent leads
    document.getElementById('admin-leads').innerHTML = leads.slice(0, 50).map(l => `
      <div style="display:flex;justify-content:space-between;padding:10px 16px;background:var(--white);border-bottom:1px solid var(--border);font-size:13px">
        <div>${l.address?.substring(0,30)} -- ${l.homeowner || 'No name'}</div>
        <div style="color:var(--gray)">${l.repCode} / ${l.status}</div>
      </div>`).join('');
  } catch (e) { console.error('Admin load error:', e); }
}

async function addRepCode() {
  const code = document.getElementById('new-rep-code')?.value?.trim();
  const name = document.getElementById('new-rep-name')?.value?.trim();
  const role = document.getElementById('new-rep-role')?.value || 'rep';
  if (!code || !name) return alert('Code and name required');
  await fetch(`/api/admin/rep-codes?repCode=${repCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rep-code': repCode }, body: JSON.stringify({ code, name, role }) });
  loadAdmin();
}
async function toggleRepCode(code, active) {
  if (!active && !confirm('Deactivate ' + code + '? They will be locked out immediately.')) return;
  await fetch(`/api/admin/rep-codes/${code}?repCode=${repCode}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'x-rep-code': repCode }, body: JSON.stringify({ active }) });
  loadAdmin();
}

// Enter key on gate input
document.getElementById('gate-code')?.addEventListener('keydown', e => { if (e.key === 'Enter') submitRepCode(); });
