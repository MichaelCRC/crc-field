let pendingKnock = null;
async function completeKnock(status) {
  if (!pendingKnock) return;
  const { lat, lng } = pendingKnock;
  closeKnockModal();
  try {
    const addr = await reverseGeocode(lat, lng);
    await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, lat, lng, source: 'Door Knock', status, repCode }) });
    loadMapPins();
  } catch (e) { alert('Error saving knock: ' + e.message); }
}
function closeKnockModal() { document.getElementById('knock-modal').style.display = 'none'; pendingKnock = null; }

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
      gmap = new google.maps.Map(document.getElementById('map-container'), {
        center: { lat: 39.9612, lng: -82.9988 },
        zoom: 11,
        // greedy = one-finger pan on mobile (no "use two fingers to move" overlay).
        // Default 'auto' enables cooperative gestures on touch devices which
        // requires two-finger pan; reps found that unusable while walking a
        // neighborhood. Pinch-to-zoom still works with two fingers.
        gestureHandling: 'greedy',
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
      });
      if (navigator.geolocation) {
        // Use cached position if fresh (< 60s) to avoid repeated permission prompts
        const _cached = window._lastKnownPos;
        const _age = _cached ? (Date.now() - _cached.ts) : Infinity;
        if (_cached && _age < 60000) {
          gmap.setCenter({ lat: _cached.lat, lng: _cached.lng }); gmap.setZoom(13);
        } else {
          navigator.geolocation.getCurrentPosition(pos => {
            window._lastKnownPos = { lat: pos.coords.latitude, lng: pos.coords.longitude, ts: Date.now() };
            gmap.setCenter({ lat: pos.coords.latitude, lng: pos.coords.longitude }); gmap.setZoom(13);
          }, () => {}, { timeout: 5000, maximumAge: 60000 });
        }
      }
      loadMapPins();
      gmap.addListener('click', async (e) => {
        const lat = e.latLng.lat(), lng = e.latLng.lng();
        if (knockMode) { pendingKnock = { lat, lng }; document.getElementById('knock-modal').style.display = 'flex'; return; }
        // Always show quick mark popup when zoomed in enough (zoom >= 15)
        if (gmap.getZoom() >= 15) { showQuickMarkPopup(lat, lng); }
      });
    };
    document.head.appendChild(script);
  } catch { document.getElementById('map-container').innerHTML = '<div class="map-placeholder">Map load failed</div>'; }
}
async function reverseGeocode(lat, lng) { try { const d = await fetch(`/api/maps/reverse-geocode?lat=${lat}&lng=${lng}`).then(r=>r.json()); return d.address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`; } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; } }
async function loadMapPins() {
  if (!gmap) return; mapMarkers.forEach(m => m.setMap(null)); mapMarkers = [];
  try {
  const url = repRole === 'admin' ? '/api/leads' : `/api/leads?repCode=${repCode}`;
  const leads = await fetch(url).then(r => r.json());
  const colors = { new:'#3B82F6', contacted:'#F59E0B', not_home:'#F59E0B', appointment:'#16A34A', claim_filed:'#16A34A', won:'#16A34A', not_interested:'#DC2626', lost:'var(--text-muted)' };
  leads.forEach(l => {
    if (!l.lat || !l.lng) return;
    const m = new google.maps.Marker({ position: { lat: l.lat, lng: l.lng }, map: gmap, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 8, fillColor: colors[l.status] || '#3B82F6', fillOpacity: 0.9, strokeColor: '#FFF', strokeWeight: 2 } });
    const info = new google.maps.InfoWindow({ content: `<div style="font-size:13px;max-width:200px"><strong>${l.address}</strong><br>${l.homeowner||''}<br><span style="color:${colors[l.status]}">${l.status}</span><br><a href="#" onclick="viewLead('${l.id}');return false" style="color:#00B5CC">View</a></div>` });
    m.addListener('click', () => info.open(gmap, m)); mapMarkers.push(m);
  });
  } catch (e) { console.error('Map pins error:', e); }
}
function centerOnMe() {
  if (!gmap || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(p => {
    window._lastKnownPos = { lat: p.coords.latitude, lng: p.coords.longitude, ts: Date.now() };
    gmap.setCenter({ lat: p.coords.latitude, lng: p.coords.longitude }); gmap.setZoom(15);
  }, () => {}, { timeout: 8000, maximumAge: 30000 });
}
function toggleKnockMode() { knockMode = !knockMode; dropPinMode = false; document.getElementById('btn-knock-mode').classList.toggle('active', knockMode); document.getElementById('btn-drop-pin').classList.remove('active'); }
function toggleDropPin() { dropPinMode = !dropPinMode; knockMode = false; document.getElementById('btn-drop-pin').classList.toggle('active', dropPinMode); document.getElementById('btn-knock-mode').classList.remove('active'); }

// --- Storms (integrated into Map view) ---
// Rewired to hit /api/storms/near with a viewport-based radius so reps see
// pins only for storms that actually hit whatever area they're looking at
// (HailRecon-style). Pin icon depends on eventType; size scales with
// magnitude. Legacy hail-only list panel still renders -- now it just
// reflects the viewport results rather than a fixed 25-event snapshot.
let viewportStorms = [], stormMarkers = [], stormOverlayVisible = false;
let stormIdleListener = null, stormRefreshTimer = null;
let stormSearchMarker = null; // pin dropped at searched address

async function loadStorms() { stormsLoaded = true; await refreshStormsInViewport(); }

// Map zoom → radius heuristic. At zoom 13+ reps are looking at a
// neighborhood; zoomed way out, pull a larger radius so pins still appear.
function stormRadiusForZoom(z) {
  if (z == null) return 5;
  if (z >= 14) return 2;
  if (z >= 12) return 5;
  if (z >= 10) return 12;
  return 25;
}

function toggleStormOverlay() { stormOverlayVisible ? hideStormOverlay() : showStormOverlay(); }

function showStormOverlay() {
  stormOverlayVisible = true;
  document.getElementById('btn-storm-overlay')?.classList.add('active');
  const panel = document.getElementById('storm-panel');
  if (panel) panel.style.display = '';
  // Bind viewport idle listener once. Debounce so panning doesn't hammer
  // /api/storms/near while the user's still moving the map.
  if (gmap && !stormIdleListener) {
    stormIdleListener = gmap.addListener('idle', () => {
      clearTimeout(stormRefreshTimer);
      stormRefreshTimer = setTimeout(refreshStormsInViewport, 500);
    });
  }
  // Wire period chips (12/6/3 mo) once.
  document.querySelectorAll('#storm-filter .chip').forEach(chip => {
    if (chip.dataset._wired) return;
    chip.dataset._wired = '1';
    chip.addEventListener('click', () => {
      document.querySelectorAll('#storm-filter .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      refreshStormsInViewport();
    });
  });
  refreshStormsInViewport();
}

function hideStormOverlay() {
  stormOverlayVisible = false;
  document.getElementById('btn-storm-overlay')?.classList.remove('active');
  const panel = document.getElementById('storm-panel');
  if (panel) panel.style.display = 'none';
  clearStormMarkers();
  if (stormIdleListener) { google.maps.event.removeListener(stormIdleListener); stormIdleListener = null; }
  clearTimeout(stormRefreshTimer);
}

function clearStormMarkers() {
  stormMarkers.forEach(m => m.setMap(null));
  stormMarkers = [];
}

function currentStormMonths() {
  const active = document.querySelector('#storm-filter .chip.active');
  const v = active?.dataset.val;
  if (v === '90') return 3;
  if (v === '180') return 6;
  return 12;
}

async function refreshStormsInViewport() {
  if (!gmap || !stormOverlayVisible) return;
  const c = gmap.getCenter();
  if (!c) return;
  const lat = c.lat(), lng = c.lng();
  const radius = stormRadiusForZoom(gmap.getZoom());
  const months = currentStormMonths();
  const url = `/api/storms/near?lat=${lat.toFixed(4)}&lng=${lng.toFixed(4)}&radius=${radius}&months=${months}`;
  const list = document.getElementById('storm-list');
  try {
    const res = await fetch(url);
    if (res.status === 503) {
      const err = await res.json().catch(() => ({}));
      if (list) list.innerHTML = `<p style="padding:16px;color:var(--red)">${err.message || 'Storm data temporarily unavailable'}</p>`;
      return;
    }
    const data = await res.json();
    viewportStorms = data.storms || [];
    renderStormPins(viewportStorms);
    renderStormList(viewportStorms, data);
    renderStormAlert(viewportStorms, data);
  } catch (e) {
    if (list) list.innerHTML = `<p style="padding:16px;color:var(--red)">${e.message}</p>`;
  }
}

function renderStormAlert(events, data) {
  const el = document.getElementById('storm-alert');
  if (!el) return;
  // Most-recent severe event (1in+ hail or 65+mph wind) within 30 days.
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const severe = events.find(e => {
    const ts = new Date(e.date).getTime();
    if (ts < thirtyDaysAgo) return false;
    if (e.eventType === 'hail') return e.magnitudeValue >= 1.0;
    return e.magnitudeValue >= 65;
  });
  if (!severe) { el.style.display = 'none'; return; }
  const icon = severe.eventType === 'hail' ? '&#9928;' : '&#128168;';
  el.style.display = 'block';
  el.innerHTML = `${icon} ${severe.date} -- ${severe.magnitude} ${stormTypeLabel(severe.eventType)} near ${severe.location}`;
}

function stormTypeLabel(t) {
  if (t === 'hail') return 'hail';
  if (t === 'thunderstorm_wind') return 'T-storm wind';
  if (t === 'high_wind') return 'high wind';
  return t;
}

function renderStormList(events, data) {
  const el = document.getElementById('storm-list');
  if (!el) return;
  if (!events.length) {
    const notice = data?.notice ? `<div style="padding:6px 16px;font-size:11px;color:var(--text-muted);background:rgba(0,0,0,0.03)">${data.notice}</div>` : '';
    el.innerHTML = `${notice}<p style="padding:16px;color:var(--gray);font-size:13px">No storms in current viewport within ${currentStormMonths()} months.</p>`;
    return;
  }
  const notice = data?.notice ? `<div style="padding:6px 16px;font-size:11px;color:var(--text-muted);background:rgba(0,0,0,0.03)">${data.notice}</div>` : '';
  el.innerHTML = notice + events.map(e => {
    const severe = e.eventType === 'hail' ? e.magnitudeValue >= 1.5 : e.magnitudeValue >= 70;
    const color = stormPinColor(e);
    return `<div class="storm-card" style="cursor:pointer" onclick="zoomToStorm(${e.lat},${e.lng})">
      <div class="storm-size" style="background:${color};color:#fff;min-width:54px;text-align:center">${e.magnitude}</div>
      <div style="flex:1">
        <div style="font-weight:600">${e.location}</div>
        <div style="font-size:12px;color:var(--gray)">${e.date} &middot; ${e.distanceMiles} mi</div>
      </div>
      <div style="font-size:11px;font-weight:700;color:${severe?'var(--red)':'var(--amber)'}">${stormTypeLabel(e.eventType).toUpperCase()}</div>
    </div>`;
  }).join('');
}

// Pin color by event type. Hail = teal/navy gradient; Wind = orange/red.
function stormPinColor(e) {
  if (e.eventType === 'hail') {
    if (e.magnitudeValue >= 2.0) return '#1B2360';
    if (e.magnitudeValue >= 1.5) return '#0369A1';
    if (e.magnitudeValue >= 1.0) return '#0891B2';
    return '#00B5CC';
  }
  // wind
  if (e.magnitudeValue >= 80) return '#7F1D1D';
  if (e.magnitudeValue >= 70) return '#DC2626';
  return '#EA580C';
}

// Pin scale (google.maps.Symbol.scale): small-to-large by magnitude.
function stormPinScale(e) {
  if (e.eventType === 'hail') {
    // hail inches → scale 7-14
    return Math.max(7, Math.min(14, 6 + e.magnitudeValue * 3));
  }
  // wind mph → scale 7-13
  return Math.max(7, Math.min(13, 5 + (e.magnitudeValue - 55) / 5));
}

function renderStormPins(events) {
  if (!gmap || typeof google === 'undefined') return;
  clearStormMarkers();
  events.forEach(e => {
    if (e.lat == null || e.lng == null) return;
    const color = stormPinColor(e);
    const scale = stormPinScale(e);
    // Hail = filled circle; wind = diamond (BACKWARD_CLOSED_ARROW approximates
    // a wind-blown arrow). Distinct shapes so reps can tell them apart at a
    // glance without reading the popup.
    const path = e.eventType === 'hail'
      ? google.maps.SymbolPath.CIRCLE
      : google.maps.SymbolPath.BACKWARD_CLOSED_ARROW;
    const marker = new google.maps.Marker({
      position: { lat: e.lat, lng: e.lng },
      map: gmap,
      icon: { path, scale, fillColor: color, fillOpacity: 0.9, strokeColor: '#FFFFFF', strokeWeight: 2 },
      zIndex: 3,
      title: `${e.magnitude} ${stormTypeLabel(e.eventType)} on ${e.date}`,
    });
    const info = new google.maps.InfoWindow({
      content: `<div style="font-size:13px;min-width:180px">
        <strong>${e.magnitude} ${stormTypeLabel(e.eventType).toUpperCase()}</strong><br>
        ${e.location}<br>
        <span style="color:#64748B">${e.date} &middot; ${e.distanceMiles} mi from map center</span>
        ${e.narrative ? `<div style="margin-top:6px;font-size:12px;color:#475569;line-height:1.4">${e.narrative.replace(/</g,'&lt;')}</div>` : ''}
      </div>`,
    });
    marker.addListener('click', () => info.open(gmap, marker));
    stormMarkers.push(marker);
  });
}

// ── Map address search (HailRecon-style "pull up a property") ─────────────
let _mapSearchTimer = null;
function initMapSearch() {
  const input = document.getElementById('map-address-input');
  if (!input || input.dataset._wired) return;
  input.dataset._wired = '1';
  input.addEventListener('input', () => {
    clearTimeout(_mapSearchTimer);
    const v = input.value.trim();
    document.getElementById('btn-map-search-clear').style.display = v ? '' : 'none';
    if (v.length < 3) { hideMapSearchSuggestions(); return; }
    _mapSearchTimer = setTimeout(() => fetchMapSearchSuggestions(v), 300);
  });
  input.addEventListener('blur', () => setTimeout(hideMapSearchSuggestions, 200));
}

async function fetchMapSearchSuggestions(input) {
  try {
    const data = await fetch(`/api/maps/autocomplete?input=${encodeURIComponent(input)}`).then(r => r.json());
    const box = document.getElementById('map-address-suggestions');
    if (!box) return;
    if (!data.predictions?.length) { hideMapSearchSuggestions(); return; }
    box.innerHTML = data.predictions.map(p => `<div class="suggestion-item" onmousedown="selectMapAddress('${p.place_id}','${p.description.replace(/'/g,"&#39;")}')">${p.description}</div>`).join('');
    box.classList.add('show');
  } catch { hideMapSearchSuggestions(); }
}
function hideMapSearchSuggestions() {
  const b = document.getElementById('map-address-suggestions');
  if (b) { b.classList.remove('show'); b.innerHTML = ''; }
}

async function selectMapAddress(placeId, desc) {
  const input = document.getElementById('map-address-input');
  if (input) input.value = desc;
  hideMapSearchSuggestions();
  const status = document.getElementById('map-search-status');
  if (status) { status.style.display = ''; status.textContent = 'Loading storm history...'; }
  try {
    // Grab lat/lng up front so we can pan + drop a marker while /for-address
    // is running. Drops a temp "searched" pin to anchor the view.
    const details = await fetch(`/api/maps/place-details?place_id=${placeId}`).then(r => r.json());
    if (!details.lat || !details.lng) throw new Error('Could not resolve address');
    if (gmap) {
      gmap.panTo({ lat: details.lat, lng: details.lng });
      gmap.setZoom(13);
    }
    if (stormSearchMarker) stormSearchMarker.setMap(null);
    stormSearchMarker = new google.maps.Marker({
      position: { lat: details.lat, lng: details.lng },
      map: gmap,
      icon: { path: google.maps.SymbolPath.BACKWARD_POINTING_ARROW, scale: 6, fillColor: '#00B5CC', fillOpacity: 1, strokeColor: '#FFFFFF', strokeWeight: 2, rotation: 180 },
      zIndex: 10,
      title: details.address || desc,
    });

    // Make sure the storm overlay is on so pins actually show.
    if (!stormOverlayVisible) showStormOverlay();

    // Ask for address-specific storms with the canonical 5mi / 12mo defaults.
    const addr = details.address || desc;
    const data = await fetch(`/api/storms/for-address?address=${encodeURIComponent(addr)}`).then(r => r.json());
    if (data.error) throw new Error(data.error);
    viewportStorms = data.storms || [];
    renderStormPins(viewportStorms);
    renderStormList(viewportStorms, data);
    renderStormAlert(viewportStorms, data);
    if (status) {
      status.textContent = `Found ${data.totalMatched} storm${data.totalMatched === 1 ? '' : 's'} within ${data.params.radiusMiles} miles in the last ${data.params.months} months`;
    }
  } catch (e) {
    if (status) status.textContent = 'Storm search failed: ' + e.message;
  }
}

function clearMapSearch() {
  const input = document.getElementById('map-address-input');
  if (input) input.value = '';
  document.getElementById('btn-map-search-clear').style.display = 'none';
  const status = document.getElementById('map-search-status');
  if (status) status.style.display = 'none';
  if (stormSearchMarker) { stormSearchMarker.setMap(null); stormSearchMarker = null; }
  hideMapSearchSuggestions();
  // Fall back to viewport-based storms.
  if (stormOverlayVisible) refreshStormsInViewport();
}

function toggleStormPanel() {
  const panel = document.getElementById('storm-panel');
  if (panel) panel.classList.toggle('collapsed');
}

// --- Parcel Data Lookup (Franklin County Auditor GIS) ---
// Free public ArcGIS REST API -- no key needed, CORS allowed.
// Falls back gracefully if outside Franklin County or API unavailable.
async function fetchParcelData(lat, lng) {
  const FIELDS = 'OWNERNME1,OWNERNME2,MAILNME1,MAILNME2,SITEADDRESS,SALEDATE,SALEPRICE,RESYRBLT,RESFLRAREA_AG,ACRES,OWNEROCCUPIED,BEDRMS,BATHS,CLASSDSCRP,TOTVALUEBASE,PSTLADDRES,PSTLCITYSTZIP';
  const url = `https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features_WebMercator/FeatureServer/0/query`
    + `?geometry=${lng},${lat}&geometryType=esriGeometryPoint&inSR=4326`
    + `&spatialRel=esriSpatialRelIntersects&outFields=${FIELDS}&returnGeometry=false&f=json`;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    const data = await r.json();
    const feat = data.features && data.features[0];
    return feat ? feat.attributes : null;
  } catch (e) {
    console.warn('[Parcel] lookup failed:', e.message);
    return null;
  }
}

function _fmtParcelDate(ms) {
  if (!ms) return null;
  return new Date(ms).toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
}
function _fmtMoney(n) {
  if (!n) return null;
  return '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function _fmtSqft(n) {
  if (!n) return null;
  return Number(n).toLocaleString('en-US') + ' sq ft';
}

function _buildParcelCard(p, addr) {
  if (!p) return '';
  const owner = [p.OWNERNME1, p.OWNERNME2].filter(Boolean).map(n => _titleCase(n)).join(' & ');
  const mailLine1 = p.MAILNME1 ? _titleCase(p.MAILNME1) : null;
  const mailLine2 = p.MAILNME2 ? _titleCase(p.MAILNME2) : null;
  const nonOwnerOccupied = p.OWNEROCCUPIED === 'N';
  const saleDate = _fmtParcelDate(p.SALEDATE);
  const salePrice = _fmtMoney(p.SALEPRICE);
  const assessed = _fmtMoney(p.TOTVALUEBASE);
  const sqft = _fmtSqft(p.RESFLRAREA_AG);
  const acres = p.ACRES ? Number(p.ACRES).toFixed(2) + ' ac' : null;
  const yearBuilt = p.RESYRBLT || null;
  const beds = p.BEDRMS || null;
  const baths = p.BATHS || null;

  const rows = [];
  if (owner) rows.push(['Owner', owner + (nonOwnerOccupied ? ' <span style="background:#F59E0B;color:#fff;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:700;vertical-align:middle">Non-OO</span>' : '')]);
  if (mailLine1 && nonOwnerOccupied) rows.push(['Mailing', [mailLine1, mailLine2].filter(Boolean).join(', ')]);
  if (yearBuilt) rows.push(['Year Built', yearBuilt]);
  const details = [sqft, beds ? beds + ' bed' : null, baths ? baths + ' bath' : null].filter(Boolean).join(' · ');
  if (details) rows.push(['Home', details]);
  if (acres) rows.push(['Lot Size', acres]);
  if (saleDate && salePrice) rows.push(['Last Sale', `${salePrice} (${saleDate})`]);
  if (assessed) rows.push(['Assessed', assessed]);

  if (!rows.length) return '';

  return `<div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;padding:10px 12px;margin-bottom:10px" data-parcel-owner="${owner.replace(/"/g,'&quot;')}">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:8px">
      <span style="font-size:10px;font-weight:700;color:#fff;background:#001A4D;padding:2px 7px;border-radius:4px;letter-spacing:0.4px">PROPERTY INFO</span>
      <span style="font-size:10px;color:#94A3B8">Franklin Co. Auditor</span>
    </div>
    ${rows.map(([label, val]) => `
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:3px 0;border-bottom:1px solid #F1F5F9">
        <span style="font-size:11px;color:#64748B;flex-shrink:0;margin-right:8px">${label}</span>
        <span style="font-size:12px;font-weight:600;color:#1e293b;text-align:right">${val}</span>
      </div>`).join('')}
  </div>`;
}

function _titleCase(str) {
  return (str || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

// --- Quick Mark (drop pin without full lead form) ---
let quickMarkPin = null;
async function showQuickMarkPopup(lat, lng) {
  const modal = document.getElementById('knock-modal');
  const opts = modal.querySelector('#knock-options');
  modal.style.display = 'flex';

  if (quickMarkPin) quickMarkPin.setMap(null);
  quickMarkPin = new google.maps.Marker({ position: { lat, lng }, map: gmap, icon: { path: google.maps.SymbolPath.CIRCLE, scale: 10, fillColor: '#00B5CC', fillOpacity: 1, strokeColor: '#FFF', strokeWeight: 3 }, zIndex: 100 });

  // Show loading state immediately so popup appears fast
  opts.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
      <div style="font-size:12px;color:#64748B">Loading property data...</div>
      <button onclick="cancelQuickMark()" style="background:none;border:none;font-size:24px;color:var(--gray);cursor:pointer;padding:0 4px;line-height:1;flex-shrink:0">&times;</button>
    </div>
    <div style="height:4px;background:#E2E8F0;border-radius:2px;margin-bottom:10px">
      <div style="height:4px;background:#00B5CC;border-radius:2px;width:60%;animation:none"></div>
    </div>`;

  // Fetch address + parcel data in parallel
  const [addr, parcel] = await Promise.all([
    reverseGeocode(lat, lng),
    fetchParcelData(lat, lng)
  ]);

  const safeAddr = addr.replace(/'/g, "\\'");
  const parcelCard = _buildParcelCard(parcel, addr);

  // Use parcel address if we got one (more accurate than reverse geocode)
  const displayAddr = (parcel && parcel.SITEADDRESS)
    ? _titleCase(parcel.SITEADDRESS) + (parcel.ZIPCD ? ', ' + parcel.ZIPCD : '')
    : addr;

  opts.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:var(--navy);flex:1;word-break:break-word;line-height:1.3">${displayAddr}</div>
      <button onclick="cancelQuickMark()" style="background:none;border:none;font-size:24px;color:var(--gray);cursor:pointer;padding:0 4px 0 8px;line-height:1;flex-shrink:0">&times;</button>
    </div>
    ${parcelCard}
    <button class="btn-add" onclick="quickMark(${lat},${lng},'${safeAddr}','not_home')" style="background:#F59E0B;color:#fff;width:100%;margin-bottom:6px">Not Home</button>
    <button class="btn-add" onclick="quickMark(${lat},${lng},'${safeAddr}','not_interested')" style="background:#DC2626;color:#fff;width:100%;margin-bottom:6px">Not Interested</button>
    <button class="btn-add" onclick="quickMarkToFull(${lat},${lng},'${safeAddr}')" style="background:#00B5CC;color:#fff;width:100%;margin-bottom:6px">Add New Lead</button>
    <button class="btn-add" onclick="quickMark(${lat},${lng},'${safeAddr}','pinned')" style="background:#001A4D;color:#fff;width:100%">Drop Pin</button>`;
}
async function quickMark(lat, lng, addr, status) {
  document.getElementById('knock-modal').style.display = 'none';
  if (quickMarkPin) { quickMarkPin.setMap(null); quickMarkPin = null; }
  try {
    await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ address: addr, lat, lng, source: 'Door Knock', status, repCode, type: 'door_knock' }) });
    loadMapPins();
  } catch (e) { alert('Error: ' + e.message); }
  dropPinMode = false;
  document.getElementById('btn-drop-pin').classList.remove('active');
}
function quickMarkToFull(lat, lng, addr) {
  document.getElementById('knock-modal').style.display = 'none';
  if (quickMarkPin) { quickMarkPin.setMap(null); quickMarkPin = null; }
  document.getElementById('lead-address').value = addr;
  selectedAddress = addr;
  document.getElementById('lead-address').dataset.lat = lat;
  document.getElementById('lead-address').dataset.lng = lng;
  // Pre-fill owner name if parcel card was showing
  const ownerEl = document.querySelector('#knock-options [data-parcel-owner]');
  if (ownerEl) {
    const nameEl = document.getElementById('lead-name');
    if (nameEl && !nameEl.value) nameEl.value = ownerEl.dataset.parcelOwner;
  }
  switchView('leads');
  dropPinMode = false;
  document.getElementById('btn-drop-pin')?.classList.remove('active');
}
function cancelQuickMark() {
  document.getElementById('knock-modal').style.display = 'none';
  if (quickMarkPin) { quickMarkPin.setMap(null); quickMarkPin = null; }
}

function zoomToStorm(lat, lng) {
  if (!gmap) return;
  gmap.panTo({ lat, lng });
  gmap.setZoom(13);
  // Collapse the panel so user can see the map
  const panel = document.getElementById('storm-panel');
  if (panel) panel.classList.add('collapsed');
}

// --- Stats + Leaderboard ---
async function loadStats(period) {
  period = period || 'week';
  document.querySelectorAll('#stats-period .chip').forEach(c => c.classList.toggle('active', c.dataset.val === period));
  
  // Load company scoreboard from claims dashboard (real JN data)
  try {
    const dashboard = await fetch('/api/claims-dashboard').then(r => r.json());
    const co = dashboard.company_totals || {};
    const scoreEl = document.getElementById('company-scoreboard');
    if (scoreEl) {
      scoreEl.innerHTML = `
        <div class="admin-stat"><div class="val" style="color:var(--teal)">$${((co.total_value||0)/1000).toFixed(0)}K</div><div class="label">Revenue YTD</div></div>
        <div class="admin-stat"><div class="val">${co.total_jobs||0}</div><div class="label">Total Jobs</div></div>
        <div class="admin-stat"><div class="val">${co.total_claims||0}</div><div class="label">Claims Filed</div></div>
        <div class="admin-stat"><div class="val">${co.total_active||0}</div><div class="label">Active Pipeline</div></div>`;
    }
    // Also update leaderboard with real data
    const repData = dashboard.by_rep || [];
    if (repData.length > 0) {
      const lbEl = document.getElementById('leaderboard');
      if (lbEl) {
        lbEl.innerHTML = `<table style="width:100%;font-size:13px;border-collapse:collapse"><thead><tr style="font-size:11px;text-transform:uppercase;color:var(--gray);border-bottom:2px solid var(--navy)"><th style="padding:8px;text-align:left">#</th><th style="text-align:left">Rep</th><th style="text-align:right">Jobs</th><th style="text-align:right">Claims</th><th style="text-align:right">Value</th></tr></thead><tbody>` +
          repData.slice(0, 15).map((r, i) => {
            const isMe = r.rep_name && r.rep_name.toLowerCase().includes(repName.split(' ')[0]?.toLowerCase());
            return `<tr style="border-bottom:1px solid var(--border);${isMe?'background:#E0F7FA;font-weight:700':''}"><td style="padding:8px">${i === 0 ? '&#127942;' : i+1}</td><td><a href="/rep-card/${r.rep_code||''}" style="color:inherit;text-decoration:none">${r.rep_name}</a></td><td style="text-align:right">${r.total_jobs}</td><td style="text-align:right">${r.claims_filed}</td><td style="text-align:right">$${((r.total_value||0)/1000).toFixed(0)}K</td></tr>`;
          }).join('') + '</tbody></table>';
      }
    }
  } catch (e) { console.error('Scoreboard error:', e); }

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
    // Load chat threads
    loadChatThreads();
  } catch (e) { console.error('Admin error:', e); }
}
async function loadChatThreads() {
  const c = document.getElementById('admin-chat-threads'); if (!c) return;
  try {
    const threads = await fetch(`/api/admin/chat/threads?repCode=${repCode}`, { headers: { 'x-rep-code': repCode } }).then(r => r.json());
    c.innerHTML = threads.map(t => `<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--white);border-bottom:1px solid var(--border)">
      <div><strong>${t.name}</strong> <span style="font-size:11px;color:var(--gray)">(${t.type || 'group'})</span>
        <div style="font-size:12px;color:var(--gray)">${(t.members || []).length} members | ${t.messageCount || 0} messages</div>
      </div>
      <button class="chip" style="font-size:11px;padding:4px 10px" onclick="manageChatThread('${t.id}','${t.name.replace(/'/g,"\\'")}')">Manage</button>
    </div>`).join('');
  } catch (e) { c.innerHTML = '<p style="padding:16px;color:var(--gray)">Could not load threads</p>'; }
}
async function manageChatThread(threadId, threadName) {
  try {
    const threads = await fetch(`/api/admin/chat/threads?repCode=${repCode}`, { headers: { 'x-rep-code': repCode } }).then(r => r.json());
    const thread = threads.find(t => t.id === threadId);
    const allReps = await fetch(`/api/admin/rep-codes?repCode=${repCode}`, { headers: { 'x-rep-code': repCode } }).then(r => r.json());
    const members = thread?.members || [];
    const memberHtml = members.length ? members.map(m => {
      const rep = allReps.find(r => r.code === m);
      return `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:13px"><span>${rep ? rep.name : m} (${m})</span><button class="chip" style="font-size:10px;padding:2px 8px;color:var(--red);border-color:var(--red)" onclick="removeChatMember('${threadId}','${m}')">Remove</button></div>`;
    }).join('') : '<p style="font-size:12px;color:var(--gray)">No members set (all can access)</p>';
    const nonMembers = allReps.filter(r => r.active && !members.includes(r.code));
    const addOptions = nonMembers.map(r => `<option value="${r.code}">${r.name} (${r.code})</option>`).join('');
    const c = document.getElementById('admin-chat-threads');
    c.innerHTML = `<div style="padding:16px;background:var(--white)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="font-size:15px">${threadName}</h4>
        <button class="chip" style="font-size:11px" onclick="loadChatThreads()">Back</button>
      </div>
      <div style="margin-bottom:12px"><strong style="font-size:12px;color:var(--gray)">MEMBERS</strong>${memberHtml}</div>
      ${addOptions ? `<div style="display:flex;gap:8px;align-items:center"><select id="add-member-select" style="flex:1;padding:8px;border:1px solid var(--border);border-radius:4px;font-size:13px"><option value="">Add member...</option>${addOptions}</select><button class="chip active" style="font-size:11px" onclick="addChatMember('${threadId}')">Add</button></div>` : ''}
    </div>`;
  } catch (e) { alert('Error loading thread: ' + e.message); }
}
async function addChatMember(threadId) {
  const code = document.getElementById('add-member-select')?.value;
  if (!code) return;
  try { await fetch(`/api/admin/chat/threads/${threadId}/members?repCode=${repCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rep-code': repCode }, body: JSON.stringify({ repCode: code }) }); manageChatThread(threadId, threadId); }
  catch (e) { alert('Failed: ' + e.message); }
}
async function removeChatMember(threadId, code) {
  if (!confirm('Remove ' + code + ' from this thread?')) return;
  try { await fetch(`/api/admin/chat/threads/${threadId}/members/${code}?repCode=${repCode}`, { method: 'DELETE', headers: { 'x-rep-code': repCode } }); manageChatThread(threadId, threadId); }
  catch (e) { alert('Failed: ' + e.message); }
}
function showCreateThreadForm() { document.getElementById('create-thread-form').style.display = ''; }
async function createChatThread() {
  const name = document.getElementById('new-thread-name')?.value?.trim();
  const type = document.getElementById('new-thread-type')?.value || 'group';
  if (!name) return alert('Thread name required');
  try {
    await fetch(`/api/admin/chat/threads?repCode=${repCode}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-rep-code': repCode }, body: JSON.stringify({ name, type, adminOnly: type === 'announcement' }) });
    document.getElementById('new-thread-name').value = '';
    document.getElementById('create-thread-form').style.display = 'none';
    loadChatThreads();
  } catch (e) { alert('Failed: ' + e.message); }
}
async function addRepCode() {
  const code = document.getElementById('new-rep-code')?.value?.trim(); const name = document.getElementById('new-rep-name')?.value?.trim();
  if (!code||!name) return alert('Code and name required');
  try { await fetch(`/api/admin/rep-codes?repCode=${repCode}`, { method:'POST', headers:{'Content-Type':'application/json','x-rep-code':repCode}, body:JSON.stringify({code,name,role:'rep'}) }); loadAdmin(); }
  catch(e) { alert('Failed to add rep code: ' + e.message); }
}
async function toggleRepCode(code, active) {
  if (!active && !confirm('Deactivate '+code+'?')) return;
  try { await fetch(`/api/admin/rep-codes/${code}?repCode=${repCode}`, { method:'PATCH', headers:{'Content-Type':'application/json','x-rep-code':repCode}, body:JSON.stringify({active}) }); loadAdmin(); }
  catch(e) { alert('Failed to update rep code: ' + e.message); }
}

// --- Chat (user-facing) removed; superseded by the CRC Activity Feed below.
// Admin-side chat thread management (loadChatThreads / manageChatThread /
// addChatMember / removeChatMember / createChatThread) above still operates
// on the legacy /api/chat/* routes so historical threads stay manageable.

// --- Brain ---
let brainHistory = [], brainStreaming = false;

// Tiny markdown renderer for assistant responses. Escapes HTML first so
// stray angle brackets in AI output can't inject markup, then applies
// bold / italic / inline code / links / paragraph + line breaks. User
// messages stay literal (escaped, no formatting).
function _brainEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function brainMd(text) {
  let s = _brainEsc(text);
  // Bold first so its inner * doesn't trigger italic.
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/__(.+?)__/g, '<strong>$1</strong>');
  // Italic: *foo* / _foo_ — guarded so adjacent word chars don't false-match.
  s = s.replace(/(^|[^\w*])\*([^*\n]+?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/(^|[^\w_])_([^_\n]+?)_(?!\w)/g, '$1<em>$2</em>');
  // Inline code.
  s = s.replace(/`([^`\n]+?)`/g, '<code style="background:rgba(255,255,255,0.15);padding:1px 5px;border-radius:3px;font-family:ui-monospace,Menlo,monospace;font-size:12px">$1</code>');
  // Markdown links [text](url).
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer" style="color:#7DD3FC;text-decoration:underline">$1</a>');
  // Bullet lines starting with "- " or "* ".
  s = s.replace(/(^|\n)[*-]\s+(.+)/g, '$1• $2');
  // Paragraph break (blank line) → two <br>; single newline → one <br>.
  s = s.replace(/\n{2,}/g, '<br><br>');
  s = s.replace(/\n/g, '<br>');
  return s;
}

function initBrain() { const s=localStorage.getItem('crc-brain-'+repCode); if(s){try{brainHistory=JSON.parse(s);}catch{brainHistory=[];}} renderBrain(); }
function renderBrain() {
  const c = document.getElementById('brain-messages');
  if (!c) return;
  c.innerHTML = brainHistory.map((m, i) => {
    const mine = m.role === 'user';
    const bg = mine ? 'var(--teal)' : 'var(--navy)';
    const al = mine ? 'flex-end' : 'flex-start';
    const body = mine ? _brainEsc(m.content) : brainMd(m.content);
    const copyBtn = mine ? '' : '<button onclick="copyBrainMsg(' + i + ')" style="background:none;border:none;color:rgba(255,255,255,0.5);font-size:11px;cursor:pointer;padding:2px 6px;margin-top:2px">Copy</button>';
    return '<div style="display:flex;flex-direction:column;align-items:' + al + ';margin-bottom:12px">'
      + (mine ? '' : '<div style="font-size:10px">&#129504; CRC Brain</div>')
      + '<div style="background:' + bg + ';color:white;padding:10px 16px;border-radius:16px;max-width:85%;font-size:14px;line-height:1.55">' + body + '</div>'
      + copyBtn
      + '</div>';
  }).join('');
  c.scrollTop = c.scrollHeight;
  if (brainHistory.length) document.getElementById('brain-suggestions').style.display = 'none';
}
function copyBrainMsg(i) { if(brainHistory[i]) navigator.clipboard.writeText(brainHistory[i].content).then(()=>{ const btns=document.querySelectorAll('#brain-messages button'); const b=btns[Math.floor(i/2)]; if(b){b.textContent='Copied!';setTimeout(()=>b.textContent='Copy',1500);} }).catch(()=>{}); }
function askBrain(t) { document.getElementById('brain-input').value=t; sendBrainMessage(); }
async function sendBrainMessage() {
  const i=document.getElementById('brain-input'); const t=i.value.trim(); if(!t||brainStreaming)return; i.value='';
  brainHistory.push({role:'user',content:t}); renderBrain(); brainStreaming=true;
  const c=document.getElementById('brain-messages');
  c.innerHTML+='<div style="display:flex;flex-direction:column;align-items:flex-start;margin-bottom:12px"><div style="font-size:10px">&#129504; CRC Brain</div><div id="brain-stream" style="background:var(--navy);color:white;padding:10px 16px;border-radius:16px;max-width:85%;font-size:14px;line-height:1.5;white-space:pre-wrap">...</div></div>';
  c.scrollTop=c.scrollHeight;
  try {
    const resp=await fetch('/api/brain/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({repCode,message:t,jobContext:activeJobContext,conversationHistory:brainHistory.slice(-10)})});
    if(!resp.ok){ const err=await resp.text().catch(()=>'Unknown error'); throw new Error(err); }
    const reader=resp.body.getReader(); const dec=new TextDecoder(); let full='',buf=''; const el=document.getElementById('brain-stream');
    while(true){ const{done,value}=await reader.read(); if(done)break; buf+=dec.decode(value,{stream:true}); const lines=buf.split('\n'); buf=lines.pop()||'';
      for(const line of lines){ if(!line.startsWith('data: '))continue; try{const d=JSON.parse(line.slice(6)); if(d.type==='delta'){full+=d.text; if(el)el.textContent=full; c.scrollTop=c.scrollHeight;} if(d.type==='done')full=d.fullText||full;}catch{} }
    }
    brainHistory.push({role:'assistant',content:full}); localStorage.setItem('crc-brain-'+repCode,JSON.stringify(brainHistory.slice(-50))); renderBrain();
  } catch(e) { brainHistory.push({role:'assistant',content:'Error: '+e.message}); renderBrain(); }
  brainStreaming=false;
}

// ── Builds overlay (ABC deliveries + manual adds) ─────────────────────────
const BUILDS_COMMON_COLORS = ['Charcoal','Pewter Gray','Weathered Wood','Driftwood','Barkwood','Hunter Green','Shakewood','Hickory','Slate'];

let _buildsCacheAt = 0;
const BUILDS_CACHE_TTL = 5 * 60 * 1000;

async function toggleBuildsOverlay() {
  buildsOverlayVisible = !buildsOverlayVisible;
  const btn = document.getElementById('btn-builds');
  const chips = document.getElementById('builds-color-filters');
  if (btn) btn.classList.toggle('active', buildsOverlayVisible);

  if (!buildsOverlayVisible) {
    // Toggle OFF: clear markers, hide UI; keep cache for instant re-enable.
    buildMarkers.forEach(m => m.setMap(null));
    buildMarkers = [];
    if (chips) chips.style.display = 'none';
    hideBuildsStatus();
    setBuildsBtnLoading(false);
    return;
  }

  // Toggle ON: instant render from cache if fresh (< 5 min old).
  const cacheFresh = _buildsCache && (Date.now() - _buildsCacheAt < BUILDS_CACHE_TTL);
  if (cacheFresh) {
    renderBuildsChips();
    plotBuildsPins();
    updateBuildsStatus();
    // Still progress geocoding if there's unfinished work.
    if ((_buildsCache || []).some(p => !p.lat || !p.lng)) nudgeBuildsGeocode();
    return;
  }

  setBuildsBtnLoading(true);
  await loadBuildsPins();

  if (!(_buildsCache || []).length) {
    setBuildsBtnLoading(false);
    showBuildsToast('No builds data. Import ABC deliveries first.');
    return;
  }
  // Plot any geocoded pins immediately; then nudge the backlog.
  setBuildsBtnLoading(false);
  await nudgeBuildsGeocode();
}

// Loop up to 3 quick batches to pull the first ~30 pins in on first open.
async function nudgeBuildsGeocode() {
  const maxRounds = 3;
  for (let i = 0; i < maxRounds; i++) {
    const remaining = (_buildsCache || []).filter(p => !p.lat || !p.lng).length;
    if (!remaining) return;
    try {
      const r = await fetch('/api/builds-map/geocode', { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      await loadBuildsPins();
      if (!data || data.geocoded === 0) return;  // no progress; back off
    } catch { return; }
  }
}

function setBuildsBtnLoading(loading) {
  const btn = document.getElementById('btn-builds');
  if (!btn) return;
  if (loading) {
    btn.dataset.origLabel = btn.dataset.origLabel || btn.innerHTML;
    btn.innerHTML = 'Loading...';
    btn.disabled = true;
  } else if (btn.dataset.origLabel) {
    btn.innerHTML = btn.dataset.origLabel;
    btn.disabled = false;
  }
}

function showBuildsToast(msg) {
  let t = document.getElementById('builds-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'builds-toast';
    t.style.cssText = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#001A4D;color:#fff;padding:10px 18px;border-radius:10px;font-size:13px;font-weight:600;z-index:300;box-shadow:0 4px 14px rgba(0,0,0,0.25)';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  clearTimeout(showBuildsToast._t);
  showBuildsToast._t = setTimeout(() => { t && t.remove(); }, 3500);
}

async function loadBuildsPins() {
  try {
    const data = await fetch('/api/builds-map/pins').then(r => r.json());
    _buildsCache = data.pins || [];
    _buildsCacheAt = Date.now();
    renderBuildsChips();
    plotBuildsPins();
    updateBuildsStatus();
  } catch (e) { console.error('Builds load failed:', e); }
}

function renderBuildsChips() {
  const wrap = document.getElementById('builds-color-filters');
  if (!wrap) return;
  const colorSet = new Set();
  (_buildsCache || []).forEach(p => { if (p.shingleColor) colorSet.add(String(p.shingleColor)); });
  // Hide the chip row entirely until at least one pin has a color set.
  if (colorSet.size === 0) {
    wrap.style.display = 'none';
    wrap.innerHTML = '';
    return;
  }
  wrap.style.display = 'block';
  const colors = Array.from(colorSet).sort();
  const chipHtml = (label, key) =>
    `<button class="build-filter-chip ${_activeColorFilter === key ? 'active' : ''}" onclick="filterBuilds('${key.replace(/'/g, "\\'")}')">${label}</button>`;
  let html = chipHtml('All', 'all');
  colors.forEach(c => { html += chipHtml(c, c); });
  html += chipHtml('No Color Set', 'unset');
  wrap.innerHTML = html;
}

function updateBuildsStatus() {
  const total = (_buildsCache || []).length;
  const ready = (_buildsCache || []).filter(p => p.lat && p.lng).length;
  if (!total || ready === total) { hideBuildsStatus(); return; }
  let el = document.getElementById('builds-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'builds-status';
    el.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);background:rgba(27,35,96,0.92);color:#fff;padding:6px 12px;border-radius:14px;font-size:12px;font-weight:600;z-index:5;box-shadow:0 2px 8px rgba(0,0,0,0.2)';
    const mc = document.getElementById('map-container');
    if (mc) mc.appendChild(el);
  }
  el.textContent = 'Geocoding builds: ' + ready + ' of ' + total + ' ready';
}

function hideBuildsStatus() {
  const el = document.getElementById('builds-status');
  if (el) el.remove();
}

function plotBuildsPins() {
  if (!gmap) return;
  buildMarkers.forEach(m => m.setMap(null));
  buildMarkers = [];
  const pins = filterBuildsList(_buildsCache || [], _activeColorFilter);
  pins.forEach(p => {
    if (!p.lat || !p.lng) return;
    const m = new google.maps.Marker({
      position: { lat: p.lat, lng: p.lng },
      map: gmap,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#001A4D',
        fillOpacity: 0.85,
        strokeColor: '#FFFFFF',
        strokeWeight: 2
      }
    });
    const info = new google.maps.InfoWindow({ content: buildInfoHtml(p) });
    m.addListener('click', () => info.open(gmap, m));
    m._pinId = p.id;
    buildMarkers.push(m);
  });
}

function filterBuildsList(pins, key) {
  if (key === 'all') return pins;
  if (key === 'unset') return pins.filter(p => !p.shingleColor);
  const needle = String(key).toLowerCase();
  return pins.filter(p => p.shingleColor && String(p.shingleColor).toLowerCase() === needle);
}

function filterBuilds(key) {
  _activeColorFilter = key;
  renderBuildsChips();
  plotBuildsPins();
}

function buildInfoHtml(p) {
  const esc = s => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const colorDot = p.shingleColor
    ? `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${shingleDotColor(p.shingleColor)};margin-right:6px;vertical-align:middle;border:1px solid #999"></span>${esc(p.shingleColor)}`
    : '<em style="color:var(--text-muted)">Not set &mdash; tap Set Color</em>';
  return `<div style="font-size:13px;max-width:240px">
    <div style="font-weight:700;margin-bottom:2px">${esc(p.name || '(no name)')}</div>
    <div style="color:#475569;margin-bottom:4px">${esc(p.address)}</div>
    ${p.deliveryDate ? `<div style="font-size:11px;color:var(--text-muted)">Delivered: ${esc(p.deliveryDate)}</div>` : ''}
    ${p.total ? `<div style="font-size:11px;color:var(--text-muted)">Total: ${esc(p.total)}</div>` : ''}
    <div style="margin-top:6px;font-size:12px">Color: ${colorDot}</div>
    ${p.notes ? `<div style="font-size:11px;color:#475569;margin-top:4px">${esc(p.notes)}</div>` : ''}
    <div style="margin-top:8px">
      <button onclick="setBuildsColor('${p.id}')" style="background:#00B5CC;color:#fff;border:none;padding:6px 12px;border-radius:4px;font-size:12px;font-weight:600;cursor:pointer">Set Color</button>
    </div>
  </div>`;
}

function shingleDotColor(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('charcoal')) return '#2a2d2f';
  if (n.includes('pewter')) return '#707a7e';
  if (n.includes('weathered')) return '#5a4a3a';
  if (n.includes('driftwood')) return '#9a8872';
  if (n.includes('barkwood')) return '#4a3524';
  if (n.includes('hunter')) return '#2e5b3e';
  if (n.includes('shakewood')) return '#8c6f4c';
  if (n.includes('hickory')) return '#6e4f32';
  if (n.includes('slate')) return '#4f5b66';
  return 'var(--text-muted)';
}

async function setBuildsColor(pinId) {
  const options = BUILDS_COMMON_COLORS.join(', ');
  const choice = prompt('Shingle color — pick one of:\n' + options + '\n\nOr type a custom color.', '');
  if (!choice || !choice.trim()) return;
  try {
    const res = await fetch('/api/builds-map/pins/' + encodeURIComponent(pinId), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ shingleColor: choice.trim() })
    });
    if (!res.ok) { alert('Update failed'); return; }
    await loadBuildsPins();
  } catch (e) { alert('Error: ' + e.message); }
}
