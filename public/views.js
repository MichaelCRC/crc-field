// --- Map ---
async function initMap() {
  mapInitialized = true;
  try {
    const keyData = await fetch('/api/maps/key').then(r => r.json());
    if (!keyData.key) { document.getElementById('map-container').innerHTML = '<div class="map-placeholder">Map requires Google Maps API key</div>'; return; }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${keyData.key}&callback=onMapsLoaded`;
    script.async = true;
    window.onMapsLoaded = () => {
      gmap = new google.maps.Map(document.getElementById('map-container'), { center: { lat: 39.96, lng: -82.99 }, zoom: 11, mapTypeControl: false, streetViewControl: false, fullscreenControl: false, styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }] });
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(pos => { gmap.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); gmap.setZoom(13); }, () => {}, { timeout: 5000 });
      loadMapPins();
      gmap.addListener('click', async (e) => {
        if (knockMode) { const status = prompt('Door result?\n\nnot_home, not_interested, interested, no_answer'); if (!status) return; const addr = await reverseGeocode(e.latLng.lat(), e.latLng.lng()); fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, lat: e.latLng.lat(), lng: e.latLng.lng(), source: 'Door Knock', status: status.toLowerCase().replace(/ /g,'_'), repCode }) }).then(() => loadMapPins()); }
        if (dropPinMode) { const addr = await reverseGeocode(e.latLng.lat(), e.latLng.lng()); if (addr && confirm(`Add lead at:\n${addr}?`)) { document.getElementById('lead-address').value = addr; selectedAddress = addr; document.getElementById('lead-address').dataset.lat = e.latLng.lat(); document.getElementById('lead-address').dataset.lng = e.latLng.lng(); switchView('leads'); } dropPinMode = false; document.getElementById('btn-drop-pin').classList.remove('active'); }
      });
    };
    document.head.appendChild(script);
  } catch { document.getElementById('map-container').innerHTML = '<div class="map-placeholder">Map load failed</div>'; }
}
async function reverseGeocode(lat, lng) { try { const d = await fetch(`/api/maps/reverse-geocode?lat=${lat}&lng=${lng}`).then(r=>r.json()); return d.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`; } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; } }
async function loadMapPins() {
  if (!gmap) return; mapMarkers.forEach(m => m.setMap(null)); mapMarkers = [];
  const leads = await fetch('/api/leads').then(r => r.json());
  const colors = { new:'#3B82F6', contacted:'#F59E0B', not_home:'#F59E0B', appointment:'#16A34A', claim_filed:'#16A34A', won:'#16A34A', not_interested:'#DC2626', lost:'#64748B' };
  leads.forEach(l => {
    if (!l.lat || !l.lng) return;
    const m = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map: gmap, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: colors[l.status] || '#3B82F6', fillOpacity: 0.9, strokeColor: '#FFF', strokeWeight: 2 } });
    const info = new google.maps.InfoWindow({ content: `<div style="font-size:13px;max-width:200px"><strong>${l.address}</strong><br>${l.homeowner||''}<br><span style="color:${colors[l.status]}">${l.status}</span><br><a href="#" onclick="viewLead('${l.id}');return false" style="color:#00B5CC">View</a></div>` });
    m.addListener('click', () => info.open(gmap, m)); mapMarkers.push(m);
  });
}
function centerOnMe() { if (gmap && navigator.geolocation) navigator.geolocation.getCurrentPosition(p => { gmap.setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); gmap.setZoom(15); }); }
function toggleKnockMode() { knockMode = !knockMode; dropPinMode = false; document.getElementById('btn-knock-mode').classList.toggle('active', knockMode); document.getElementById('btn-drop-pin').classList.remove('active'); }
function toggleDropPin() { dropPinMode = !dropPinMode; knockMode = false; document.getElementById('btn-drop-pin').classList.toggle('active', dropPinMode); document.getElementById('btn-knock-mode').classList.remove('active'); }

// --- Storms ---
async function loadStorms() {
  stormsLoaded = true;
  const list = document.getElementById('storm-list');
  try {
    const data = await fetch('/api/storms').then(r => r.json());
    const events = data.events || [];
    const weekAgo = Date.now() - 7*86400000;
    const recent = events.filter(e => new Date(e.date).getTime() > weekAgo && e.hailSize >= 1.0);
    if (recent.length) { const n = recent[0]; document.getElementById('storm-alert').style.display = 'block'; document.getElementById('storm-alert').innerHTML = `&#9928; Storm -- ${n.date}<br>${n.hailSize}" hail near ${n.location}`; }
    renderStormList(events);
    document.querySelectorAll('#storm-filter .chip').forEach(chip => chip.addEventListener('click', () => { document.querySelectorAll('#storm-filter .chip').forEach(c => c.classList.remove('active')); chip.classList.add('active'); filterStormList(chip.dataset.val, events); }));
  } catch (e) { list.innerHTML = `<p style="padding:16px;color:var(--red)">${e.message}</p>`; }
}
function renderStormList(events) {
  document.getElementById('storm-list').innerHTML = events.sort((a,b) => new Date(b.date)-new Date(a.date)).map(e => {
    const sev = e.hailSize >= 2.0 ? 'severe' : e.hailSize >= 1.5 ? 'significant' : e.hailSize >= 1.0 ? 'moderate' : 'minor';
    return `<div class="storm-card"><div class="storm-size hail-${sev}">${e.hailSize}"</div><div style="flex:1"><div style="font-weight:600">${e.location}, ${e.county} Co.</div><div style="font-size:12px;color:var(--gray)">${e.date}</div></div><div style="font-size:11px;font-weight:700;color:${sev==='minor'?'var(--amber)':'var(--red)'}">${sev}</div></div>`;
  }).join('');
}
function filterStormList(val, all) {
  let f = all;
  if (val === '30') f = all.filter(e => Date.now()-new Date(e.date).getTime() < 30*86400000);
  else if (val === '90') f = all.filter(e => Date.now()-new Date(e.date).getTime() < 90*86400000);
  else if (parseFloat(val) > 0) f = all.filter(e => e.hailSize >= parseFloat(val));
  renderStormList(f);
}

// --- Stats + Leaderboard ---
async function loadStats(period) {
  period = period || 'week';
  document.querySelectorAll('#stats-period .chip').forEach(c => c.classList.toggle('active', c.dataset.val === period));
  try {
    const [stats, board] = await Promise.all([
      fetch(`/api/stats/${repCode}?period=${period}`).then(r => r.json()),
      fetch(`/api/stats?period=${period}`).then(r => r.json()),
    ]);
    const trend = (cur, prev) => cur > prev ? '<span style="color:var(--green)">&#9650;</span>' : cur < prev ? '<span style="color:var(--red)">&#9660;</span>' : '<span style="color:var(--gray)">&#8212;</span>';
    document.getElementById('my-stats').innerHTML = `
      <div class="admin-stat"><div class="val">${stats.leadsAdded}</div><div class="label">Leads ${trend(stats.leadsAdded, stats.prevLeadsAdded)}</div></div>
      <div class="admin-stat"><div class="val">${stats.claimsFiled}</div><div class="label">Claims ${trend(stats.claimsFiled, stats.prevClaimsFiled)}</div></div>
      <div class="admin-stat"><div class="val">${stats.conversionRate}%</div><div class="label">Conv Rate</div></div>
      <div class="admin-stat"><div class="val">${stats.photosTaken}</div><div class="label">Photos</div></div>`;
    const bd = stats.statusBreakdown || {};
    document.getElementById('status-breakdown').innerHTML = Object.entries(bd).map(([s,n]) => `<div style="display:flex;justify-content:space-between;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border)"><span>${s.replace(/_/g,' ')}</span><strong>${n}</strong></div>`).join('');
    document.getElementById('recent-activity').innerHTML = (stats.recentActivity || []).map(a => `<div style="padding:10px 16px;background:var(--white);border-bottom:1px solid var(--border);font-size:13px">${a.action} -- ${a.address || ''} ${a.homeowner ? '('+a.homeowner+')' : ''}<div style="font-size:11px;color:var(--gray)">${timeAgo(a.time)}</div></div>`).join('');
    document.getElementById('leaderboard').innerHTML = `<table style="width:100%;font-size:13px;border-collapse:collapse"><thead><tr style="font-size:11px;text-transform:uppercase;color:var(--gray);border-bottom:2px solid var(--navy)"><th style="padding:8px;text-align:left">#</th><th style="text-align:left">Rep</th><th style="text-align:right">Leads</th><th style="text-align:right">Claims</th><th style="text-align:right">Conv%</th></tr></thead><tbody>` +
      board.map(r => `<tr style="border-bottom:1px solid var(--border);${r.code===repCode?'background:#E0F7FA;font-weight:700':''}"><td style="padding:8px">${r.rank === 1 ? '&#127942;' : r.rank}</td><td>${r.name}</td><td style="text-align:right">${r.leads}</td><td style="text-align:right">${r.claimsFiled}</td><td style="text-align:right">${r.conversionRate}%</td></tr>`).join('') + '</tbody></table>';
  } catch (e) { console.error('Stats error:', e); }
}
function timeAgo(t) { if (!t) return ''; const d = Date.now() - new Date(t).getTime(); if (d < 3600000) return Math.round(d/60000) + 'm ago'; if (d < 86400000) return Math.round(d/3600000) + 'h ago'; return Math.round(d/86400000) + 'd ago'; }

// --- Admin ---
async function loadAdmin() {
  if (repRole !== 'admin') return;
  try {
    const [reps, leads, core] = await Promise.all([fetch(`/api/admin/reps?repCode=${repCode}`).then(r=>r.json()), fetch('/api/leads').then(r=>r.json()), fetch(`/api/admin/data-core?repCode=${repCode}`).then(r=>r.json())]);
    document.getElementById('admin-stats').innerHTML = `<div class="admin-stat"><div class="val">${core.metadata?.total_contacts||0}</div><div class="label">Contacts</div></div><div class="admin-stat"><div class="val">${core.metadata?.total_properties||0}</div><div class="label">Properties</div></div><div class="admin-stat"><div class="val">${leads.length}</div><div class="label">Total Leads</div></div><div class="admin-stat"><div class="val">${leads.filter(l=>l.status==='won').length}</div><div class="label">Won</div></div>`;
    document.getElementById('admin-reps').innerHTML = reps.map(r => `<div style="display:flex;justify-content:space-between;padding:12px 16px;background:var(--white);border-bottom:1px solid var(--border)"><div><strong>${r.name}</strong> (${r.code})</div><div style="font-size:13px;color:var(--gray)">${r.thisWeek} this week / ${r.totalLeads} total</div></div>`).join('');
    const allCodes = await fetch(`/api/admin/rep-codes?repCode=${repCode}`).then(r=>r.json());
    document.getElementById('admin-rep-codes').innerHTML = `<div id="add-rep-form" style="display:none;padding:12px 16px;background:var(--white);border-bottom:1px solid var(--border)"><div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><input type="text" id="new-rep-code" placeholder="Code" style="width:100px;padding:8px;border:1px solid var(--border);border-radius:4px;text-transform:uppercase"><input type="text" id="new-rep-name" placeholder="Name" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:4px"><button class="chip active" onclick="addRepCode()">Add</button></div></div>` + allCodes.map(c => `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--white);border-bottom:1px solid var(--border)"><div><strong>${c.code}</strong> -- ${c.name} (${c.role})</div><div>${c.active ? (c.role!=='admin'?`<button class="chip" style="font-size:11px;padding:4px 10px" onclick="toggleRepCode('${c.code}',false)">Deactivate</button>`:'') : `<span style="color:var(--red);font-size:12px">Inactive</span> <button class="chip" style="font-size:11px;padding:4px 10px" onclick="toggleRepCode('${c.code}',true)">Reactivate</button>`}</div></div>`).join('');
    document.getElementById('admin-leads').innerHTML = leads.slice(0,50).map(l => `<div style="display:flex;justify-content:space-between;padding:10px 16px;background:var(--white);border-bottom:1px solid var(--border);font-size:13px"><div>${l.address?.substring(0,30)} -- ${l.homeowner||''}</div><div style="color:var(--gray)">${l.repCode} / ${l.status}</div></div>`).join('');
  } catch (e) { console.error('Admin error:', e); }
}
async function addRepCode() { const code = document.getElementById('new-rep-code')?.value?.trim(); const name = document.getElementById('new-rep-name')?.value?.trim(); if (!code||!name) return alert('Code and name required'); await fetch(`/api/admin/rep-codes?repCode=${repCode}`, { method:'POST', headers:{'Content-Type':'application/json','x-rep-code':repCode}, body:JSON.stringify({code,name,role:'rep'}) }); loadAdmin(); }
async function toggleRepCode(code, active) { if (!active && !confirm('Deactivate '+code+'?')) return; await fetch(`/api/admin/rep-codes/${code}?repCode=${repCode}`, { method:'PATCH', headers:{'Content-Type':'application/json','x-rep-code':repCode}, body:JSON.stringify({active}) }); loadAdmin(); }
