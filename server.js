require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Routes
const leadsRouter = require('./routes/leads');
const stormsRouter = require('./routes/storms');
const adminRouter = require('./routes/admin');
const mapsRouter = require('./routes/maps');

app.use('/api/leads', leadsRouter);
app.use('/api/storms', stormsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/maps', mapsRouter);

// Phase 2: Direct mail via Lob.com
// POST https://api.lob.com/v1/postcards
// Triggered when rep approves a zone list
// Postcard template: CRC storm mailer
// Cost: ~$0.75 per postcard via Lob

// Rep codes
const { listRepCodes, validateRepCode } = require('./lib/repCodes');
app.get('/api/rep-codes/validate', (req, res) => {
  const code = (req.query.code || '').toUpperCase();
  const rep = validateRepCode(code);
  if (!rep) return res.json({ valid: false });
  res.json({ valid: true, name: rep.name, role: rep.role });
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'crc-field-intel' }));

// SPA fallback
app.get('/{*path}', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`CRC Field Intel on port ${PORT}`));
