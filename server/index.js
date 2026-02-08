/**
 * Digital Signage — Signaling Server
 * Events: join-room, call-user, answer-call, ice-candidate
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: true }));

const io = new Server(server, {
  cors: { origin: true },
  pingTimeout: 20000,
  pingInterval: 10000,
});

// Active players: socketId -> { playerId, socketId }
const players = new Map();
const ADMIN_ROOM = 'admin';

function getPlayerList() {
  return Array.from(players.values()).map((p) => ({
    playerId: p.playerId,
    socketId: p.socketId,
  }));
}

function notifyAdminsPlayerList() {
  io.to(ADMIN_ROOM).emit('player-list', getPlayerList());
}

io.on('connection', (socket) => {
  console.log('[Server] Client connected:', socket.id);

  socket.on('join-room', (payload) => {
    const room = payload?.room;
    if (room === 'player') {
      const playerId = payload?.playerId || socket.id;
      players.set(socket.id, { playerId, socketId: socket.id });
      socket.data.role = 'player';
      socket.data.playerId = playerId;
      socket.join('players');
      socket.emit('joined', { playerId, socketId: socket.id });
      notifyAdminsPlayerList();
      console.log('[Server] Player joined:', playerId);
    } else if (room === 'admin') {
      socket.data.role = 'admin';
      socket.join(ADMIN_ROOM);
      socket.emit('joined', { room: 'admin' });
      socket.emit('player-list', getPlayerList());
      console.log('[Server] Admin joined');
    }
  });

  socket.on('call-user', (payload) => {
    const { to, signal } = payload || {};
    if (!to || !signal) return;
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('incoming-call', { from: socket.id, signal });
  });

  socket.on('answer-call', (payload) => {
    const { to, signal } = payload || {};
    if (!to || !signal) return;
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('call-approved', { signal });
  });

  socket.on('ice-candidate', (payload) => {
    const { to, candidate } = payload || {};
    if (!to) return;
    const target = io.sockets.sockets.get(to);
    if (target) target.emit('ice-candidate', { from: socket.id, candidate });
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'player') {
      players.delete(socket.id);
      notifyAdminsPlayerList();
    }
    console.log('[Server] Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`[Server] Signaling server at http://localhost:${PORT}`);
});
