const d = require('/Users/michaelmcgovern/content-engine/jn-data/jobs-2026-ytd.json');
const s = {};
d.forEach(j => { s[j.status_name] = (s[j.status_name] || 0) + 1; });
console.log('Statuses:', JSON.stringify(s, null, 2));
console.log('Total:', d.length);
const reps = {};
d.forEach(j => { reps[j.sales_rep_name] = (reps[j.sales_rep_name] || 0) + 1; });
console.log('Reps:', JSON.stringify(reps, null, 2));
