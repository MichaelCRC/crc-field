/** CRC System Intelligence -- analyzes usage patterns, identifies improvements */
const { read, write, listLeads } = require('./store');
const { listRepCodes } = require('./repCodes');

function analyze() {
  const report = {
    generatedAt: new Date().toISOString(),
    brainUsage: analyzeBrainUsage(),
    leadConversion: analyzeLeadConversion(),
    suggestions: [],
  };
  report.suggestions = generateSuggestions(report);
  write('intelligence-report.json', report);
  return report;
}

function analyzeBrainUsage() {
  const chats = read('brain-chats.json', {});
  const allQuestions = [];
  const topicCounts = {};
  const followUpTopics = [];

  for (const [rep, messages] of Object.entries(chats)) {
    let prevWasUser = false;
    for (const msg of messages) {
      if (msg.role === 'user') {
        allQuestions.push({ text: msg.content, rep, time: msg.timestamp });
        const topic = extractTopic(msg.content);
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;
        if (prevWasUser) followUpTopics.push(topic);
        prevWasUser = true;
      } else {
        prevWasUser = false;
      }
    }
  }

  const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
  return {
    totalQuestions: allQuestions.length,
    uniqueReps: Object.keys(chats).length,
    topQuestions: sorted.slice(0, 10).map(([topic, count]) => ({ topic, count })),
    confusionTopics: [...new Set(followUpTopics)].slice(0, 5),
  };
}

function extractTopic(text) {
  const lower = text.toLowerCase();
  if (lower.includes('steep') || lower.includes('slope')) return 'steep slope';
  if (lower.includes('grange')) return 'grange tactics';
  if (lower.includes('dcsi') || lower.includes('step')) return 'DCSI process';
  if (lower.includes('irc') || lower.includes('code')) return 'building codes';
  if (lower.includes('waste') || lower.includes('factor')) return 'waste factor';
  if (lower.includes('matching') || lower.includes('oac')) return 'matching law';
  if (lower.includes('acv') || lower.includes('rcv')) return 'ACV vs RCV';
  if (lower.includes('ice') || lower.includes('water')) return 'ice and water';
  if (lower.includes('drip') || lower.includes('edge')) return 'drip edge';
  if (lower.includes('supplement')) return 'supplement process';
  if (lower.includes('carrier') || lower.includes('adjuster')) return 'carrier tactics';
  if (lower.includes('depreciation')) return 'depreciation';
  return 'general';
}

async function analyzeLeadConversion() {
  const leads = await listLeads();
  const reps = listRepCodes().filter(r => r.active);
  const bySource = {};
  const byRep = {};

  for (const lead of leads) {
    const src = lead.source || 'Unknown';
    if (!bySource[src]) bySource[src] = { total: 0, claimsFiled: 0, won: 0 };
    bySource[src].total++;
    if (['claim_filed', 'won'].includes(lead.status)) bySource[src].claimsFiled++;
    if (lead.status === 'won') bySource[src].won++;

    const rep = lead.repCode || 'Unknown';
    if (!byRep[rep]) byRep[rep] = { total: 0, claimsFiled: 0, won: 0 };
    byRep[rep].total++;
    if (['claim_filed', 'won'].includes(lead.status)) byRep[rep].claimsFiled++;
    if (lead.status === 'won') byRep[rep].won++;
  }

  const sourceInsights = Object.entries(bySource).map(([source, data]) => ({
    source, ...data,
    conversionRate: data.total > 0 ? Math.round((data.claimsFiled / data.total) * 100) : 0,
  })).sort((a, b) => b.conversionRate - a.conversionRate);

  const repInsights = Object.entries(byRep).map(([code, data]) => {
    const rep = reps.find(r => r.code === code);
    return { code, name: rep?.name || code, ...data,
      conversionRate: data.total > 0 ? Math.round((data.claimsFiled / data.total) * 100) : 0,
    };
  }).sort((a, b) => b.conversionRate - a.conversionRate);

  return { totalLeads: leads.length, sourceInsights, repInsights };
}

function generateSuggestions(report) {
  const suggestions = [];
  const brain = report.brainUsage;
  const leads = report.leadConversion;

  // Brain suggestions
  if (brain.topQuestions.length) {
    const top = brain.topQuestions[0];
    if (top.count >= 3) {
      suggestions.push({
        type: 'training',
        priority: 'high',
        title: `Add training module on "${top.topic}"`,
        detail: `Asked ${top.count} times. Reps need this knowledge readily available.`,
      });
    }
  }
  if (brain.confusionTopics.length) {
    suggestions.push({
      type: 'brain_improvement',
      priority: 'medium',
      title: `Improve Brain responses on: ${brain.confusionTopics.join(', ')}`,
      detail: 'Reps asked follow-up questions on these topics, indicating first answers were unclear.',
    });
  }

  // Lead conversion suggestions
  for (const src of leads.sourceInsights) {
    if (src.total >= 5 && src.conversionRate >= 60) {
      suggestions.push({
        type: 'strategy',
        priority: 'high',
        title: `Double down on ${src.source} leads`,
        detail: `${src.conversionRate}% conversion rate on ${src.total} leads. High-performing source.`,
      });
    }
    if (src.total >= 5 && src.conversionRate < 20) {
      suggestions.push({
        type: 'strategy',
        priority: 'medium',
        title: `Review ${src.source} lead quality`,
        detail: `Only ${src.conversionRate}% conversion on ${src.total} leads. May need different approach.`,
      });
    }
  }

  return suggestions;
}

function formatReport(report) {
  const lines = [`CRC System Intelligence -- ${new Date().toLocaleDateString()}\n`];

  lines.push('TOP REP QUESTIONS:');
  for (const q of report.brainUsage.topQuestions.slice(0, 5)) {
    lines.push(`  ${q.topic} (asked ${q.count}x)`);
  }

  lines.push('\nCONVERSION INSIGHTS:');
  for (const src of report.leadConversion.sourceInsights) {
    lines.push(`  ${src.source}: ${src.conversionRate}% conversion (${src.total} leads)`);
  }

  if (report.suggestions.length) {
    lines.push('\nSUGGESTED IMPROVEMENTS:');
    report.suggestions.forEach((s, i) => {
      lines.push(`  ${i + 1}. [${s.priority}] ${s.title}`);
      lines.push(`     ${s.detail}`);
    });
  }

  return lines.join('\n');
}

module.exports = { analyze, formatReport };
