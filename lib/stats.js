/** Stats calculation for reps and leaderboard */
const { listLeads } = require('./store');
const { listRepCodes } = require('./repCodes');

function getRepStats(repCode, period) {
  const leads = listLeads().filter(l => l.repCode === repCode);
  const { start, label } = getPeriodBounds(period);
  const periodLeads = leads.filter(l => new Date(l.createdAt).getTime() >= start);
  const prevStart = start - (Date.now() - start);
  const prevLeads = leads.filter(l => {
    const t = new Date(l.createdAt).getTime();
    return t >= prevStart && t < start;
  });
  const claimed = periodLeads.filter(l => l.status === 'claim_filed' || l.status === 'won');
  const prevClaimed = prevLeads.filter(l => l.status === 'claim_filed' || l.status === 'won');
  const photos = periodLeads.reduce((s, l) => s + (l.photos?.length || 0), 0);
  return {
    repCode, period: label,
    leadsAdded: periodLeads.length,
    claimsFiled: claimed.length,
    conversionRate: periodLeads.length > 0 ? Math.round((claimed.length / periodLeads.length) * 100) : 0,
    photosTaken: photos,
    prevLeadsAdded: prevLeads.length,
    prevClaimsFiled: prevClaimed.length,
    statusBreakdown: buildStatusBreakdown(leads),
    recentActivity: buildRecentActivity(leads),
  };
}

function getLeaderboard(period) {
  const codes = listRepCodes().filter(c => c.active);
  const leads = listLeads();
  const { start } = getPeriodBounds(period);
  const board = codes.map(rep => {
    const repLeads = leads.filter(l => l.repCode === rep.code);
    const periodLeads = repLeads.filter(l => new Date(l.createdAt).getTime() >= start);
    const claimed = periodLeads.filter(l => l.status === 'claim_filed' || l.status === 'won');
    return {
      code: rep.code, name: rep.name.split(' ')[0],
      leads: periodLeads.length,
      claimsFiled: claimed.length,
      conversionRate: periodLeads.length > 0 ? Math.round((claimed.length / periodLeads.length) * 100) : 0,
    };
  });
  board.sort((a, b) => b.claimsFiled !== a.claimsFiled ? b.claimsFiled - a.claimsFiled : b.leads - a.leads);
  board.forEach((r, i) => { r.rank = i + 1; });
  return board;
}

function buildStatusBreakdown(leads) {
  const counts = {};
  for (const l of leads) { const s = l.status || 'new'; counts[s] = (counts[s] || 0) + 1; }
  return counts;
}

function buildRecentActivity(leads) {
  return leads.slice(0, 10).map(l => ({
    action: l.status === 'claim_filed' ? 'Filed claim' : 'Added lead',
    address: l.address?.substring(0, 30),
    homeowner: l.homeowner,
    time: l.updatedAt || l.createdAt,
  }));
}

function getPeriodBounds(period) {
  const now = Date.now();
  if (period === 'month') return { start: now - 30 * 86400000, label: 'This Month' };
  if (period === 'alltime') return { start: 0, label: 'All Time' };
  // Default: this week (Mon-Sun)
  const d = new Date();
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return { start: d.getTime(), label: 'This Week' };
}

module.exports = { getRepStats, getLeaderboard };
