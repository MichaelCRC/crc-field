const express = require('express');
const router = express.Router();
const { read, write } = require('../lib/store');
const { buildPrompt } = require('../lib/brainContext');
const { isAdmin } = require('../lib/repCodes');

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
