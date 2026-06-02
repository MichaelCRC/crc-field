const express = require('express');
const router = express.Router();
const { read, write } = require('../lib/store');
const { buildPrompt } = require('../lib/brainContext');
const { isAdmin } = require('../lib/repCodes');
const _sandbox = require('../lib/sandbox');
const PORTAL_URL = process.env.SUPPLEMENT_PORTAL_URL || 'https://crc-supplements-portal.onrender.com';
const HERMES_SECRET = process.env.HERMES_API_SECRET || 'crc-hermes-2026';

const HISTORY_FILE = 'brain-chats.json';

// Chat with Brain -- streaming response
router.post('/chat', async (req, res) => {
  const { repCode, message, jobContext, conversationHistory } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'AI not configured' });

  // Build messages with history
  const history = (conversationHistory || []).slice(-10).map(m => ({
    role: m.role, content: m.content,
  }));
  history.push({ role: 'user', content: message });

  // Save user message to history
  saveMessage(repCode, 'user', message);

  // Stream response
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6', max_tokens: 1000, stream: true,
        system: buildPrompt(jobContext),
        messages: history,
      }),
    });
    if (!resp.ok) {
      const errText = await resp.text().catch(() => 'AI service error');
      res.write(`data: ${JSON.stringify({ type: 'error', error: `AI error (${resp.status}): ${errText.substring(0, 200)}` })}\n\n`);
      res.end();
      return;
    }
    let fullText = '';
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            fullText += parsed.delta.text;
            res.write(`data: ${JSON.stringify({ type: 'delta', text: parsed.delta.text })}\n\n`);
          }
        } catch {}
      }
    }
    saveMessage(repCode, 'assistant', fullText);
    res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
    res.end();
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: e.message })}\n\n`);
    res.end();
  }
});

// Generate an official roof condition statement for a report (non-streaming,
// one-shot fill). Powers the "Generate with CRC Brain" button on the Insurance
// Report builder so rep-written descriptions are consistent and professional.
router.post('/generate-description', async (req, res) => {
  // Sandbox: canned official text so the flow is testable offline (no portal).
  if (_sandbox.enabled) {
    return res.json({ text: _sandboxDescription(req.body || {}) });
  }
  // Document-AI lives in the portal (Hermes), alongside adjuster emails + claim
  // intel — one voice, one place to govern. Proxy there with the hermes secret.
  try {
    const resp = await fetch(`${PORTAL_URL}/api/hermes/report-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-hermes-secret': HERMES_SECRET },
      body: JSON.stringify(req.body || {}),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data.text) {
      return res.status(resp.status || 502).json({ error: data.error || 'Report text generation failed' });
    }
    return res.json({ text: data.text });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
});

function _sandboxDescription(body) {
  var addr = (body && body.address) || 'the subject property';
  var cond = (body && body.condition) || 'sound';
  if (cond === 'damage') {
    return 'Columbus Roofing Company completed a visual inspection of the roof system at ' + addr + '. '
      + 'The inspection identified areas of damage consistent with storm exposure, including shingle displacement, granule loss, and '
      + 'compromised flashing seals across multiple slopes, as documented in the accompanying photographs.\n\n'
      + 'Based on the conditions observed, the roof exhibits damage that warrants professional evaluation and repair to preserve the '
      + 'integrity of the structure. This statement reflects the condition observed on the date of inspection and is provided for the '
      + 'homeowner’s records.';
  }
  if (cond === 'wear') {
    return 'Columbus Roofing Company completed a visual inspection of the roof system at ' + addr + '. '
      + 'The roof covering shows normal wear consistent with its age and typical weather exposure. No significant storm damage was '
      + 'observed during this inspection; minor age-related characteristics are documented in the accompanying photographs.\n\n'
      + 'The roof remains in serviceable condition. Routine monitoring is recommended as the roof continues to age. This statement '
      + 'reflects the condition observed on the date of inspection and is provided for the homeowner’s records.';
  }
  // sound — "checks out"
  return 'Columbus Roofing Company completed a visual inspection of the roof system at ' + addr + '. '
    + 'The roof covering, flashings, and penetrations were assessed and found to be in sound, serviceable condition. No significant '
    + 'damage or deficiencies were observed during this inspection, as reflected in the accompanying photographs.\n\n'
    + 'Based on the conditions observed, the roof is performing as intended and shows no immediate concerns. This statement reflects '
    + 'the condition observed on the date of inspection and is provided for the homeowner’s records.';
}

// Get conversation history
router.get('/history/:repCode', async (req, res) => {
  const chats = read(HISTORY_FILE, {});
  res.json(chats[req.params.repCode.toUpperCase()] || []);
});

// Clear history
router.delete('/history/:repCode', async (req, res) => {
  const chats = read(HISTORY_FILE, {});
  chats[req.params.repCode.toUpperCase()] = [];
  write(HISTORY_FILE, chats);
  res.json({ success: true });
});

// Admin: all brain usage
router.get('/history', async (req, res) => {
  const code = (req.query.repCode || '').toUpperCase();
  if (!isAdmin(code)) return res.status(403).json({ error: 'Admin only' });
  res.json(read(HISTORY_FILE, {}));
});

function saveMessage(repCode, role, content) {
  const chats = read(HISTORY_FILE, {});
  const code = (repCode || 'UNKNOWN').toUpperCase();
  if (!chats[code]) chats[code] = [];
  chats[code].push({ role, content, timestamp: new Date().toISOString() });
  if (chats[code].length > 100) chats[code] = chats[code].slice(-100);
  write(HISTORY_FILE, chats);
}

module.exports = router;
