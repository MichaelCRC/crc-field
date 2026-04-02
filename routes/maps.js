/** Google Maps API proxies -- keeps API key server-side */
const express = require('express');
const router = express.Router();

const API_KEY = process.env.GOOGLE_MAPS_API_KEY || '';
const MAPS_BASE = 'https://maps.googleapis.com/maps/api';

// Places Autocomplete
router.get('/autocomplete', async (req, res) => {
  if (!API_KEY) return res.json({ predictions: [] });
  const input = req.query.input;
  if (!input || input.length < 3) return res.json({ predictions: [] });
  try {
    const url = `${MAPS_BASE}/place/autocomplete/json?input=${encodeURIComponent(input)}&types=address&components=country:us&key=${API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    res.json({ predictions: (data.predictions || []).map(p => ({ description: p.description, place_id: p.place_id })) });
  } catch (e) { res.json({ predictions: [], error: e.message }); }
});

// Place Details (get lat/lng from place_id)
router.get('/place-details', async (req, res) => {
  if (!API_KEY) return res.json({});
  try {
    const url = `${MAPS_BASE}/place/details/json?place_id=${req.query.place_id}&fields=geometry,formatted_address,address_components&key=${API_KEY}`;
    const resp = await fetch(url);
    const data = await resp.json();
    const result = data.result || {};
    const loc = result.geometry?.location || {};
    const comps = result.address_components || [];
    const city = comps.find(c => c.types.includes('locality'))?.long_name || '';
    const state = comps.find(c => c.types.includes('administrative_area_level_1'))?.short_name || 'OH';
    const zip = comps.find(c => c.types.includes('postal_code'))?.long_name || '';
    const county = comps.find(c => c.types.includes('administrative_area_level_2'))?.long_name?.replace(' County', '') || '';
    res.json({ address: result.formatted_address, lat: loc.lat, lng: loc.lng, city, state, zip, county });
  } catch (e) { res.json({ error: e.message }); }
});

// Street View image URL
router.get('/streetview', (req, res) => {
  if (!API_KEY) return res.json({ url: '' });
  const addr = req.query.address || '';
  const size = req.query.size || '400x200';
  const url = `${MAPS_BASE}/streetview?size=${size}&location=${encodeURIComponent(addr)}&key=${API_KEY}`;
  res.json({ url });
});

// Maps JS API key (for embedding maps on frontend)
router.get('/key', (req, res) => {
  res.json({ key: API_KEY ? API_KEY : null });
});

module.exports = router;
