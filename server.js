require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/leads', require('./routes/leads'));
app.use('/api/leads', require('./routes/photos'));
app.use('/api/storms', require('./routes/storms'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/maps', require('./routes/maps'));
app.use('/api/stats', require('./routes/stats'));
app.use('/api/hover', require('./routes/hover'));
app.use('/api/chat', require('./routes/chat'));
app.use('/api/brain', require('./routes/brain'));
app.use('/api/claims-dashboard', require('./routes/claims-dashboard'));
app.use('/api/referrals', require('./routes/referrals'));
app.use('/', require('./routes/rep-card'));
app.use('/', require('./routes/recruit'));

// Rep codes
const { validateRepCode } = require('./lib/repCodes');
app.get('/api/rep-codes/validate', (req, res) => {
  const code = (req.query.code || '').toUpperCase();
  const rep = validateRepCode(code);
  if (!rep) return res.json({ valid: false });
  res.json({ valid: true, name: rep.name, role: rep.role });
});

// Reverse geocode
app.get('/api/maps/reverse-geocode', async (req, res) => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.json({ address: '' });
  try {
    const { lat, lng } = req.query;
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`;
    const data = await fetch(url).then(r => r.json());
    res.json({ address: data.results?.[0]?.formatted_address || '' });
  } catch (e) { res.json({ address: '', error: e.message }); }
});

// Health
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'crc-field-intel' }));

// Claims dashboard page
app.get('/claims-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'claims-dashboard.html')));

// SPA fallback
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CRC Field Intel on port ${PORT}`));
