#!/usr/bin/env node
/**
 * CRC Builds Geocoder
 * 
 * Reads JobNimbus YTD data, filters completed/installed jobs,
 * geocodes any that lack lat/lng, and saves to data/crc-builds.json
 * 
 * Run once: node scripts/geocode-builds.js
 * Re-run anytime to pick up new completed jobs (only geocodes new ones)
 * 
 * Completed statuses included:
 *   Job Completed/COC, Paid & Closed, Job Close Out, Job Approved, Job Scheduled, Color Selection
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const MAPS_KEY = process.env.GOOGLE_MAPS_API_KEY;
const JN_PATHS = [
  path.join(__dirname, '../../content-engine/jn-data/jobs-2026-ytd.json'),
  path.join(__dirname, '../data/jobs-2026-ytd.json'),
];
const OUTPUT = path.join(__dirname, '../data/crc-builds.json');

const COMPLETED_STATUSES = new Set([
  'Job Completed/COC',
  'Paid & Closed',
  'Job Close Out',
  'Job Approved',
  'Job Scheduled',
  'Color Selection',
  'Installed',
]);

async function geocode(address) {
  if (!MAPS_KEY) throw new Error('GOOGLE_MAPS_API_KEY not set');
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${MAPS_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.length) return null;
  const loc = data.results[0].geometry.location;
  return { lat: loc.lat, lng: loc.lng };
}

async function run() {
  if (!MAPS_KEY) {
    console.error('ERROR: GOOGLE_MAPS_API_KEY not set in .env');
    process.exit(1);
  }

  // Load JN data
  let jnJobs = [];
  for (const p of JN_PATHS) {
    try {
      if (fs.existsSync(p)) {
        jnJobs = JSON.parse(fs.readFileSync(p, 'utf8'));
        console.log(`Loaded ${jnJobs.length} JN jobs from ${p}`);
        break;
      }
    } catch {}
  }
  if (!jnJobs.length) { console.error('Could not load JN data'); process.exit(1); }

  // Filter to completed jobs with valid addresses
  const completed = jnJobs.filter(j =>
    COMPLETED_STATUSES.has(j.status_name) &&
    j.address_line1 &&
    j.address_line1.trim().length > 5
  );
  console.log(`Found ${completed.length} completed jobs to map`);

  // Load existing builds (to avoid re-geocoding)
  let existing = [];
  try {
    if (fs.existsSync(OUTPUT)) existing = JSON.parse(fs.readFileSync(OUTPUT, 'utf8'));
  } catch {}
  const existingIds = new Set(existing.map(b => b.jnid));
  console.log(`Already have ${existing.length} geocoded builds`);

  const results = [...existing];
  let newCount = 0;
  let failCount = 0;

  for (const job of completed) {
    if (existingIds.has(job.jnid)) continue; // already geocoded

    const fullAddress = [job.address_line1, job.city, job.state_text, job.zip]
      .filter(Boolean).join(', ');

    try {
      const coords = await geocode(fullAddress);
      if (coords) {
        results.push({
          jnid: job.jnid,
          address: fullAddress,
          address_line1: job.address_line1,
          city: job.city || '',
          state: job.state_text || 'OH',
          zip: job.zip || '',
          lat: coords.lat,
          lng: coords.lng,
          status: job.status_name,
          rep: job.sales_rep_name || '',
          type: job.record_type_name || 'Insurance',
          value: job.amount_to_be_paid || 0,
          year: job.date_created
            ? new Date(job.date_created * 1000).getFullYear()
            : new Date().getFullYear(),
        });
        newCount++;
        process.stdout.write(`\r  Geocoded ${newCount} new jobs...`);
      } else {
        failCount++;
      }
      // Rate limit: 50ms between requests (Google allows 50/s)
      await new Promise(r => setTimeout(r, 50));
    } catch (e) {
      failCount++;
      console.warn(`\n  Failed: ${fullAddress} — ${e.message}`);
    }
  }

  // Save
  fs.writeFileSync(OUTPUT, JSON.stringify(results, null, 2));
  console.log(`\nDone. ${newCount} new geocoded, ${failCount} failed.`);
  console.log(`Total builds: ${results.length} → saved to ${OUTPUT}`);
}

run().catch(e => { console.error(e); process.exit(1); });
