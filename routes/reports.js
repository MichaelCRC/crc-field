const express = require('express');
const router = express.Router();
const { getLead, updateLead } = require('../lib/store');
const { migratePhotos } = require('../lib/photoStorage');

// Generate a report from selected photos
router.post('/:id/report', async (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead) return res.status(404).json({ error: 'Lead not found' });

  const { type, reportType, photoIds, photos: selectedPhotos, repCode } = req.body;
  if (!selectedPhotos?.length) return res.status(400).json({ error: 'No photos selected' });

  const portalUrl = process.env.SUPPLEMENT_PORTAL_URL;

  // If portal is connected, try to generate via portal API
  if (portalUrl && lead.portalJobId) {
    try {
      const endpoint = type === 'inspection'
        ? `${portalUrl}/api/jobs/${lead.portalJobId}/property-damage-report`
        : `${portalUrl}/api/jobs/${lead.portalJobId}/build-report`;

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          photos: selectedPhotos,
          reportType: reportType || 'insurance',
          repCode: repCode || lead.repCode,
          address: lead.address,
          homeowner: lead.homeowner,
          source: 'crc-field',
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.url || data.reportUrl) {
          // Save report to lead record
          const reports = lead.reports || [];
          reports.push({
            id: `rpt-${Date.now()}`,
            type,
            reportType: reportType || 'insurance',
            url: data.url || data.reportUrl,
            photoCount: selectedPhotos.length,
            generatedAt: new Date().toISOString(),
            generatedBy: repCode,
          });
          updateLead(req.params.id, { reports });

          return res.json({
            success: true,
            reportUrl: data.url || data.reportUrl,
            reportName: `${type === 'inspection' ? 'Inspection' : 'Build'} Report - ${lead.address}`,
          });
        }
      }
    } catch (e) {
      console.error('[Reports] Portal report generation failed:', e.message);
    }
  }

  // Fallback: generate a simple HTML report that can be printed/saved as PDF
  const title = type === 'inspection' ? 'Property Inspection Report' : 'Build Completion Report';
  const reportHtml = buildReportHtml(lead, selectedPhotos, type, reportType, repCode);

  // Save report HTML as a data URL (works on mobile Safari for download)
  const reportId = `rpt-${Date.now()}`;
  const reports = lead.reports || [];
  reports.push({
    id: reportId,
    type,
    reportType: reportType || 'insurance',
    htmlGenerated: true,
    photoCount: selectedPhotos.length,
    generatedAt: new Date().toISOString(),
    generatedBy: repCode,
  });
  updateLead(req.params.id, { reports, lastReportHtml: reportHtml });

  res.json({
    success: true,
    reportUrl: `/api/leads/${req.params.id}/report/${reportId}`,
    reportName: `${title} - ${lead.address}`,
  });
});

// Serve a generated report
router.get('/:id/report/:reportId', (req, res) => {
  const lead = getLead(req.params.id);
  if (!lead || !lead.lastReportHtml) return res.status(404).send('Report not found');
  res.setHeader('Content-Type', 'text/html');
  res.send(lead.lastReportHtml);
});

function buildReportHtml(lead, photos, type, reportType, repCode) {
  const title = type === 'inspection' ? 'Property Inspection Report' : 'Build Completion Report';
  const subtitle = reportType === 'client' ? 'Client Overview' : (type === 'inspection' ? 'Insurance Documentation' : 'Completion Documentation');
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // Group photos by tag
  const grouped = {};
  for (const p of photos) {
    const tag = p.tag || 'other';
    if (!grouped[tag]) grouped[tag] = [];
    grouped[tag].push(p);
  }

  let photoSections = '';
  for (const [tag, tagPhotos] of Object.entries(grouped)) {
    const label = tag.charAt(0).toUpperCase() + tag.slice(1).replace('-', ' ');
    photoSections += `
      <h3 style="color:#1B2360;margin:20px 0 10px;font-size:16px;border-bottom:2px solid #00B5CC;padding-bottom:4px">${label}</h3>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${tagPhotos.map(p => `<div>
          <img src="${p.url}" style="width:100%;height:200px;object-fit:cover;border-radius:4px">
          ${p.caption ? `<p style="font-size:11px;color:#666;margin:4px 0">${p.caption}</p>` : ''}
        </div>`).join('')}
      </div>
    `;
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} - ${lead.address}</title>
<style>
  body { font-family: -apple-system, system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; color: #1E293B; }
  @media print { body { padding: 0; } .no-print { display: none; } }
</style></head><body>
  <div style="text-align:center;margin-bottom:24px;border-bottom:3px solid #1B2360;padding-bottom:16px">
    <div style="font-size:28px;font-weight:900;color:#1B2360;letter-spacing:2px">CRC</div>
    <div style="font-size:12px;color:#00B5CC;font-weight:600">COLUMBUS ROOFING COMPANY</div>
  </div>
  <h1 style="font-size:22px;color:#1B2360;margin-bottom:4px">${title}</h1>
  <p style="color:#64748B;margin-bottom:16px">${subtitle}</p>
  <div style="background:#F5F7FA;padding:16px;border-radius:8px;margin-bottom:24px;font-size:14px">
    <div><strong>Property:</strong> ${lead.address}</div>
    <div><strong>Homeowner:</strong> ${lead.homeowner || 'N/A'}</div>
    <div><strong>Date:</strong> ${date}</div>
    <div><strong>Inspector:</strong> ${repCode || lead.repCode || 'CRC'}</div>
    ${lead.measurements ? `<div><strong>Roof:</strong> ${lead.measurements.totalSquares || '?'} SQ | Pitch: ${lead.measurements.predominantPitch || '?'}</div>` : ''}
  </div>
  ${photoSections}
  <div style="margin-top:32px;padding-top:16px;border-top:2px solid #1B2360;text-align:center;font-size:12px;color:#64748B">
    <div style="font-weight:700;color:#1B2360">Columbus Roofing Company</div>
    <div>(614) 743-1481 | columbusroofingco.com</div>
  </div>
  <div class="no-print" style="text-align:center;margin-top:24px">
    <button onclick="window.print()" style="padding:12px 32px;font-size:16px;font-weight:700;background:#00B5CC;color:white;border:none;border-radius:8px;cursor:pointer">Save as PDF / Print</button>
  </div>
</body></html>`;
}

module.exports = router;
