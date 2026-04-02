/** Simple JSON file store -- same pattern as supplement portal */
const fs = require('fs');
const path = require('path');
const DATA_DIR = path.join(__dirname, '..', 'data');

function read(file, fallback) {
  const fp = path.join(DATA_DIR, file);
  try { if (fs.existsSync(fp)) return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch {}
  return fallback;
}

function write(file, data) {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// Leads
function listLeads() { return read('leads.json', []); }
function getLead(id) { return listLeads().find(l => l.id === id) || null; }
function createLead(data) {
  const leads = listLeads();
  const lead = {
    id: Date.now().toString(),
    address: data.address || '',
    city: data.city || '',
    state: data.state || 'OH',
    zip: data.zip || '',
    lat: data.lat || null,
    lng: data.lng || null,
    county: data.county || '',
    homeowner: data.homeowner || '',
    phone: data.phone || '',
    email: data.email || '',
    jobType: data.jobType || 'Roof',
    source: data.source || 'Door Knock',
    notes: data.notes || '',
    status: data.status || 'new',
    repCode: data.repCode || '',
    ownerName: data.ownerName || '',
    mailingAddress: data.mailingAddress || '',
    yearBuilt: data.yearBuilt || null,
    assessedValue: data.assessedValue || null,
    propertyClass: data.propertyClass || 'residential',
    absenteeOwner: data.absenteeOwner || false,
    streetViewUrl: data.streetViewUrl || '',
    portalJobId: data.portalJobId || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  leads.unshift(lead);
  write('leads.json', leads);
  upsertDataCore(lead);
  return lead;
}
function updateLead(id, updates) {
  const leads = listLeads();
  const idx = leads.findIndex(l => l.id === id);
  if (idx === -1) return null;
  Object.assign(leads[idx], updates, { updatedAt: new Date().toISOString() });
  write('leads.json', leads);
  return leads[idx];
}

// Zones
function listZones() { return read('zones.json', { zones: [] }).zones; }
function createZone(data) {
  const file = read('zones.json', { zones: [] });
  const zone = { id: 'zone-' + Date.now(), ...data, createdAt: new Date().toISOString() };
  file.zones.push(zone);
  write('zones.json', file);
  return zone;
}

// Data Core upsert
function upsertDataCore(lead) {
  const core = read('crc-data-core.json', { contacts: [], properties: [], lists: { storm_zones: [], active_leads: [], past_customers: [], commercial_targets: [], direct_mail_campaigns: [] }, metadata: { total_contacts: 0, total_properties: 0, last_updated: '', version: '1.0' } });
  const contactId = 'c-' + (lead.phone || lead.id);
  const existing = core.contacts.find(c => c.id === contactId);
  if (existing) {
    Object.assign(existing, { phone: lead.phone || existing.phone, updatedAt: new Date().toISOString() });
  } else {
    const parts = (lead.homeowner || '').split(' ');
    core.contacts.push({ id: contactId, type: 'homeowner', firstName: parts[0] || '', lastName: parts.slice(1).join(' ') || '', phone: lead.phone, email: lead.email, properties: [lead.id], source: 'field-app', repCode: lead.repCode, tags: [lead.source], interactions: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  const propExists = core.properties.find(p => p.address === lead.address);
  if (!propExists) {
    core.properties.push({ id: 'p-' + lead.id, address: lead.address, city: lead.city, state: lead.state, zip: lead.zip, lat: lead.lat, lng: lead.lng, county: lead.county, ownerName: lead.ownerName, mailingAddress: lead.mailingAddress, yearBuilt: lead.yearBuilt, estimatedRoofAge: lead.yearBuilt ? new Date().getFullYear() - lead.yearBuilt : null, assessedValue: lead.assessedValue, propertyClass: lead.propertyClass, absenteeOwner: lead.absenteeOwner, stormHistory: [], crcHistory: [{ event: 'lead_created', date: new Date().toISOString(), repCode: lead.repCode }], streetViewUrl: lead.streetViewUrl, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
  core.metadata.total_contacts = core.contacts.length;
  core.metadata.total_properties = core.properties.length;
  core.metadata.last_updated = new Date().toISOString();
  write('crc-data-core.json', core);
}

function getDataCore() { return read('crc-data-core.json', { contacts: [], properties: [], lists: {}, metadata: {} }); }

module.exports = { listLeads, getLead, createLead, updateLead, listZones, createZone, getDataCore, read, write };
