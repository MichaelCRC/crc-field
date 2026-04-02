/** Auto-post system events to CRC Team chat thread */
const { read, write } = require('./store');
const { broadcast } = require('./sseManager');

function autoPost(eventType, data) {
  let text = '';
  switch (eventType) {
    case 'claim_filed':
      text = `🏆 ${data.repCode} just filed a claim!\n${data.homeowner || 'Unknown'} at ${data.address}\n${data.jobType || ''}`;
      break;
    case 'lead_milestone': text = `🎯 ${data.repCode} just hit ${data.count} leads!`; break;
    case 'leaderboard_change': text = `📊 ${data.repCode} just took the lead! ${data.claims} claims this week`; break;
    case 'storm_alert': text = `⛈️ Storm Alert -- ${data.date}\n${data.hailSize}" hail near ${data.location}`; break;
    case 'new_rep': text = `👋 Welcome ${data.name} to the CRC team!`; break;
    default: return;
  }
  if (!text) return;
  const msg = {
    id: Date.now().toString(), threadId: 'company', repCode: 'SYSTEM',
    text, photoUrl: null, type: 'system', timestamp: new Date().toISOString(), reactions: {},
  };
  try {
    const chat = read('chat.json', defaultChat());
    chat.threads.company.messages.push(msg);
    if (chat.threads.company.messages.length > 500) chat.threads.company.messages = chat.threads.company.messages.slice(-500);
    write('chat.json', chat);
    broadcast('company', { type: 'message', message: msg });
  } catch (e) { console.error('[AutoPost]', e.message); }
}

function defaultChat() {
  return {
    threads: {
      company: { id: 'company', name: 'CRC Team', description: 'Company-wide thread', messages: [] },
      leadership: { id: 'leadership', name: 'Leadership', description: 'MCG and LANE only', adminOnly: true, messages: [] },
    }
  };
}

module.exports = { autoPost, defaultChat };
