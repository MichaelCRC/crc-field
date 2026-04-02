/** SSE connection manager for real-time chat */
const connections = new Map(); // threadId -> Set of response objects

function addConnection(threadId, res) {
  if (!connections.has(threadId)) connections.set(threadId, new Set());
  connections.get(threadId).add(res);
  res.on('close', () => {
    connections.get(threadId)?.delete(res);
    if (connections.get(threadId)?.size === 0) connections.delete(threadId);
  });
}

function broadcast(threadId, data) {
  const conns = connections.get(threadId);
  if (!conns) return;
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of conns) {
    try { res.write(msg); } catch { conns.delete(res); }
  }
}

function getConnectionCount(threadId) {
  return connections.get(threadId)?.size || 0;
}

module.exports = { addConnection, broadcast, getConnectionCount };
