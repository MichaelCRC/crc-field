/** Sync leads to the CRC supplement portal via Hermes API */

async function syncToPortal(lead) {
  const url = process.env.SUPPLEMENT_PORTAL_URL;
  const secret = process.env.HERMES_API_SECRET;
  if (!url || !secret) {
    console.log('[Sync] Portal URL or secret not configured, skipping');
    return null;
  }
  try {
    const parts = (lead.homeowner || '').split(' ');
    const isRetail = lead.jobType === 'Retail' || lead.source === 'Retail';
    const body = {
      address: lead.address,
      homeownerName: lead.homeowner,
      firstName: parts[0] || '',
      lastName: parts.slice(1).join(' ') || '',
      phone: lead.phone || '',
      email: lead.email || '',
      carrier: isRetail ? 'Retail' : '',
      jobCategory: isRetail ? 'retail' : 'insurance',
      retailJobTypes: isRetail ? lead.jobType : null,
      source: 'crc-field-intel',
    };
    const res = await fetch(`${url}/api/hermes/job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hermes-secret': secret },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.success) {
      console.log(`[Sync] Lead synced to portal: ${data.jobId} (${data.action})`);
      return data.jobId;
    }
    console.error('[Sync] Portal response:', data);
    return null;
  } catch (e) {
    console.error('[Sync] Portal sync failed:', e.message);
    return null;
  }
}

module.exports = { syncToPortal };
