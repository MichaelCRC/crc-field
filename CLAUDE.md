# CRC Field Intel

## What This Is
Mobile-first field tool for CRC sales reps. Leads entry, territory mapping, storm tracking.

## Architecture
Single Express server (`server.js`). SPA frontend in `public/`. Deployed to Render at `crc-field.onrender.com`.

## Key Files
- `server.js` -- Express app, route mounting
- `routes/leads.js` -- Lead CRUD + CSV export
- `routes/storms.js` -- NOAA storm data + cache
- `routes/admin.js` -- Admin dashboard, rep stats, data core
- `routes/maps.js` -- Google Maps API proxies
- `lib/store.js` -- JSON file storage + data core upsert
- `lib/repCodes.js` -- Rep code validation
- `lib/portalSync.js` -- Sync leads to supplement portal
- `public/app.js` -- Frontend SPA
- `public/style.css` -- Mobile-first styles

## Data Storage
- `data/leads.json` -- All leads
- `data/zones.json` -- Storm zones for future direct mail
- `data/crc-data-core.json` -- Master contact/property database
- `data/rep-codes.json` -- Active rep codes
- `data/storm-cache.json` -- Cached NOAA storm data

## Environment Variables
```
PORT, GOOGLE_MAPS_API_KEY, SUPPLEMENT_PORTAL_URL, HERMES_API_SECRET, LOB_API_KEY
```

## Running Locally
```
npm install
node server.js
```
