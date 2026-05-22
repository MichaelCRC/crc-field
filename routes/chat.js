const express = require('express');
const router = express.Router();
const multer = require('multer');
const { read, write } = require('../lib/store');
const { addConnection, broadcast } = require('../lib/sseManager');
const { isAdmin } = require('../lib/repCodes');
const { defaultChat } = require('../lib/autoPost');
const { uploadPhoto } = require('../lib/photoStorage');
const chatUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getChat() { return read('chat.json', defaultChat()); }
function saveChat(chat) { write('chat.json', chat); }

function getDmId(a, b) { return 'dm-' + [a, b].sort().join('-'); }

// SSE stream
router.get('/stream/:threadId', async (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('data: {"type":"connected"}\n\n');
  addConnection(req.params.threadId, res);
  // Keep alive every 30s
  const keepAlive = setInterval(() => { try { res.write(': keepalive\n\n'); } catch { clearInterval(keepAlive); } }, 30000);
  req.on('close', () => clearInterval(keepAlive));
});

// Get threads for a rep
router.get('/threads', async (req, res) => {
  const code = (req.query.repCode || '').toUpperCase();
  const chat = getChat();
  const threads = [];
  // Company thread always
  const co = chat.threads.company || {};
  threads.push({ id: 'company', name: co.name || 'CRC Team', lastMessage: co.messages?.slice(-1)[0] || null, unread: 0 });
  // Leadership if admin
  if (isAdmin(code)) {
    const ld = chat.threads.leadership || {};
    threads.push({ id: 'leadership', name: ld.name || 'Leadership', lastMessage: ld.messages?.slice(-1)[0] || null, unread: 0 });
  }
  // DM threads where this rep is participant
  for (const [tid, thread] of Object.entries(chat.threads)) {
    if (tid.startsWith('dm-') && tid.includes(code)) {
      const other = tid.replace('dm-', '').split('-').find(c => c !== code);
      threads.push({ id: tid, name: other, isDm: true, lastMessage: thread.messages?.slice(-1)[0] || null, unread: 0 });
    }
  }
  res.json(threads);
});

// Get messages for a thread
router.get('/messages/:threadId', async (req, res) => {
  const code = (req.query.repCode || req.headers['x-rep-code'] || '').toUpperCase();
  if (req.params.threadId === 'leadership' && !isAdmin(code)) return res.status(403).json({ error: 'Admin only' });
  const chat = getChat();
  const thread = chat.threads[req.params.threadId];
  if (!thread) return res.json({ messages: [] });
  const limit = parseInt(req.query.limit) || 50;
  const messages = (thread.messages || []).slice(-limit);
  res.json({ messages, threadName: thread.name });
});

// Post message
router.post('/messages', async (req, res) => {
  const { threadId, text, photoUrl, repCode } = req.body;
  if (!threadId || (!text && !photoUrl)) return res.status(400).json({ error: 'threadId and text/photo required' });
  if (threadId === 'leadership' && !isAdmin((repCode || '').toUpperCase())) return res.status(403).json({ error: 'Admin only' });
  const chat = getChat();
  // Create DM thread if needed
  if (threadId.startsWith('dm-') && !chat.threads[threadId]) {
    chat.threads[threadId] = { id: threadId, name: threadId, isDm: true, messages: [] };
  }
  if (!chat.threads[threadId]) return res.status(404).json({ error: 'Thread not found' });
  const msg = {
    id: Date.now().toString(), threadId, repCode: repCode || 'UNKNOWN',
    text: text || '', photoUrl: photoUrl || null,
    type: 'message', timestamp: new Date().toISOString(), reactions: {},
  };
  chat.threads[threadId].messages.push(msg);
  if (chat.threads[threadId].messages.length > 500) chat.threads[threadId].messages = chat.threads[threadId].messages.slice(-500);
  saveChat(chat);
  broadcast(threadId, { type: 'message', message: msg });
  res.json({ success: true, message: msg });
});

// Upload photo to chat (uses Cloudinary instead of base64 in JSON)
router.post('/photo', chatUpload.single('photo'), async (req, res) => {
  const { threadId, repCode } = req.body;
  if (!req.file || !threadId) return res.status(400).json({ error: 'Photo and threadId required' });
  if (threadId === 'leadership' && !isAdmin((repCode || '').toUpperCase())) return res.status(403).json({ error: 'Admin only' });
  try {
    const photo = await uploadPhoto(req.file.buffer, 'chat', repCode || 'UNKNOWN', 'chat');
    const chat = getChat();
    if (!chat.threads[threadId]) return res.status(404).json({ error: 'Thread not found' });
    const msg = {
      id: Date.now().toString(), threadId, repCode: repCode || 'UNKNOWN',
      text: '', photoUrl: photo.thumbnail || photo.url,
      type: 'message', timestamp: new Date().toISOString(), reactions: {},
    };
    chat.threads[threadId].messages.push(msg);
    if (chat.threads[threadId].messages.length > 500) chat.threads[threadId].messages = chat.threads[threadId].messages.slice(-500);
    saveChat(chat);
    broadcast(threadId, { type: 'message', message: msg });
    res.json({ success: true, message: msg });
  } catch (e) { res.status(500).json({ error: 'Photo upload failed: ' + e.message }); }
});

// Add reaction
router.post('/react', async (req, res) => {
  const { threadId, messageId, repCode, emoji } = req.body;
  const chat = getChat();
  const thread = chat.threads[threadId];
  if (!thread) return res.status(404).json({ error: 'Thread not found' });
  const msg = thread.messages.find(m => m.id === messageId);
  if (!msg) return res.status(404).json({ error: 'Message not found' });
  if (!msg.reactions) msg.reactions = {};
  if (!msg.reactions[emoji]) msg.reactions[emoji] = [];
  const idx = msg.reactions[emoji].indexOf(repCode);
  if (idx >= 0) msg.reactions[emoji].splice(idx, 1);
  else msg.reactions[emoji].push(repCode);
  saveChat(chat);
  broadcast(threadId, { type: 'reaction', messageId, reactions: msg.reactions });
  res.json({ success: true });
});

module.exports = router;
