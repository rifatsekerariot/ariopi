/**
 * ArioPi — Digital Signage Server
 * Video kütüphanesi, cihaza gönderme, oynat/durdur/sil komutları
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;
const BIND = process.env.BIND || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(cors({ origin: true }));
app.use(express.json());

if (fs.existsSync(path.join(PUBLIC_DIR, 'admin'))) {
  app.use('/admin', express.static(path.join(PUBLIC_DIR, 'admin')));
}
if (fs.existsSync(path.join(PUBLIC_DIR, 'player'))) {
  app.use('/player', express.static(path.join(PUBLIC_DIR, 'player')));
}

// Video kütüphanesi: id -> { id, name, path, size }
const videoLibrary = new Map();
const VIDEO_EXTS = ['.mp4', '.webm', '.ogg', '.mov', '.mkv'];
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp4';
    const id = uuidv4();
    cb(null, id + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase();
    if (VIDEO_EXTS.includes(ext)) return cb(null, true);
    cb(new Error('Sadece video dosyaları kabul edilir.'));
  },
});

// Mevcut upload'ları tarama
fs.readdirSync(UPLOADS_DIR).forEach((f) => {
  const full = path.join(UPLOADS_DIR, f);
  if (!fs.statSync(full).isFile()) return;
  const ext = path.extname(f).toLowerCase();
  if (!VIDEO_EXTS.includes(ext)) return;
  const id = path.basename(f, ext);
  if (!videoLibrary.has(id)) {
    videoLibrary.set(id, {
      id,
      name: f,
      path: full,
      size: fs.statSync(full).size,
    });
  }
});

// API: video listesi
app.get('/api/videos', (req, res) => {
  const list = Array.from(videoLibrary.values()).map((v) => ({
    id: v.id,
    name: v.name,
    size: v.size,
  }));
  res.json({ videos: list });
});

// API: video dosyası (indirme / player tarafında saklama için)
app.get('/api/videos/:id/file', (req, res) => {
  const v = videoLibrary.get(req.params.id);
  if (!v || !fs.existsSync(v.path)) return res.status(404).end();
  res.setHeader('Content-Type', 'video/mp4');
  res.sendFile(v.path);
});

// API: video yükle
app.post('/api/videos/upload', upload.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  const id = path.basename(req.file.filename, path.extname(req.file.filename));
  videoLibrary.set(id, {
    id,
    name: req.file.originalname || req.file.filename,
    path: req.file.path,
    size: req.file.size,
  });
  res.json({ id, name: req.file.originalname || req.file.filename, size: req.file.size });
});

// API: videoyu sunucudan sil
app.delete('/api/videos/:id', (req, res) => {
  const v = videoLibrary.get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Video bulunamadı' });
  try {
    if (fs.existsSync(v.path)) fs.unlinkSync(v.path);
  } catch (_) {}
  videoLibrary.delete(req.params.id);
  res.json({ ok: true });
});

const io = new Server(server, {
  cors: { origin: true },
  pingTimeout: 20000,
  pingInterval: 10000,
});

const ADMIN_ROOM = 'admin';
const players = new Map(); // socketId -> { playerId, socketId, storedVideos: string[], status? }

function getPlayerList() {
  return Array.from(players.values()).map((p) => ({
    playerId: p.playerId,
    socketId: p.socketId,
    storedVideos: p.storedVideos || [],
    status: p.status || 'online',
  }));
}

function notifyAdminsPlayerList() {
  io.to(ADMIN_ROOM).emit('player-list', getPlayerList());
}

// Bulut / reverse proxy: PUBLIC_URL verilirse indirme adresleri hep buradan üretilir (Pi internetten erişebilsin)
const PUBLIC_URL = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : null;

function getBaseUrl(socket) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const req = socket.request;
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:' + PORT;
  return `${proto}://${host}`;
}

io.on('connection', (socket) => {
  console.log('[Server] Client connected:', socket.id);

  socket.on('join-room', (payload) => {
    const room = payload?.room;
    if (room === 'player') {
      const playerId = payload?.playerId || socket.id;
      const storedVideos = Array.isArray(payload?.storedVideos) ? payload.storedVideos : [];
      players.set(socket.id, {
        playerId,
        socketId: socket.id,
        storedVideos: [...storedVideos],
        status: 'online',
      });
      socket.data.role = 'player';
      socket.data.playerId = playerId;
      socket.join('players');
      socket.emit('joined', { playerId, socketId: socket.id });
      notifyAdminsPlayerList();
      console.log('[Server] Player joined:', playerId, 'socketId:', socket.id);
    } else if (room === 'admin') {
      socket.data.role = 'admin';
      socket.join(ADMIN_ROOM);
      socket.emit('joined', { room: 'admin' });
      socket.emit('player-list', getPlayerList());
      console.log('[Server] Admin joined, socketId:', socket.id, 'players:', players.size);
    }
  });

  socket.on('get-player-list', () => {
    if (socket.data.role === 'admin') {
      socket.emit('player-list', getPlayerList());
    }
  });

  socket.on('stored_videos', (payload) => {
    const player = players.get(socket.id);
    if (!player) return;
    player.storedVideos = Array.isArray(payload?.videoIds) ? payload.videoIds : [];
    player.lastSeen = new Date().toISOString();
    notifyAdminsPlayerList();
  });

  socket.on('player_status', (payload) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (payload?.status) player.status = payload.status;
    notifyAdminsPlayerList();
  });

  // Admin: videoyu cihaza gönder (cihaz indirip yerel depoya yazar)
  socket.on('send_video_to_player', (payload) => {
    const { playerSocketId, videoId } = payload || {};
    if (!playerSocketId || !videoId) return;
    const v = videoLibrary.get(videoId);
    if (!v) return;
    const target = io.sockets.sockets.get(playerSocketId);
    if (!target) return;
    const baseUrl = getBaseUrl(socket);
    const downloadUrl = `${baseUrl}/api/videos/${videoId}/file`;
    target.emit('download_and_store', { videoId, name: v.name, downloadUrl });
  });

  // Admin: cihazda oynat
  socket.on('player_play', (payload) => {
    const { playerSocketId, videoId } = payload || {};
    if (!playerSocketId) return;
    const target = io.sockets.sockets.get(playerSocketId);
    if (target) target.emit('play_video', { videoId });
  });

  // Admin: cihazda durdur
  socket.on('player_stop', (payload) => {
    const { playerSocketId } = payload || {};
    if (!playerSocketId) return;
    const target = io.sockets.sockets.get(playerSocketId);
    if (target) target.emit('stop');
  });

  // Admin: cihazdan videoyu sil
  socket.on('player_delete_video', (payload) => {
    const { playerSocketId, videoId } = payload || {};
    if (!playerSocketId || !videoId) return;
    const target = io.sockets.sockets.get(playerSocketId);
    if (target) target.emit('delete_video', { videoId });
    const player = players.get(playerSocketId);
    if (player && player.storedVideos) {
      player.storedVideos = player.storedVideos.filter((id) => id !== videoId);
      notifyAdminsPlayerList();
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.role === 'player') {
      players.delete(socket.id);
      notifyAdminsPlayerList();
    }
    console.log('[Server] Client disconnected:', socket.id);
  });
});

server.listen(Number(PORT), BIND, () => {
  console.log(`[Server] ArioPi at http://${BIND}:${PORT}`);
});
