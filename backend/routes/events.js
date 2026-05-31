const express = require('express');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const router = express.Router();

const clients = new Map();
let clientIdCounter = 0;

router.get('/stream', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();

  let user;
  try {
    user = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).end();
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const clientId = ++clientIdCounter;
  clients.set(clientId, { res, userId: user.id, role: user.role });

  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch { clearInterval(ping); clients.delete(clientId); }
  }, 20000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(clientId);
  });
});

function send(client, event, data) {
  try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch {}
}

function broadcastAll(event, data) {
  clients.forEach(c => send(c, event, data));
}

function broadcastToAdmins(event, data) {
  clients.forEach(c => { if (c.role === 'admin') send(c, event, data); });
}

function broadcastToUser(userId, event, data) {
  clients.forEach(c => { if (c.userId === userId) send(c, event, data); });
}

function broadcastToUsersExcept(excludeRole, event, data) {
  clients.forEach(c => { if (c.role !== excludeRole) send(c, event, data); });
}

module.exports = { router, broadcastAll, broadcastToAdmins, broadcastToUser, broadcastToUsersExcept };
