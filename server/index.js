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

// API: Lite client (MPV/OMXPlayer) — hangi videoyu oynatacağını poll ile alır
const PUBLIC_URL_FALLBACK = process.env.PUBLIC_URL ? process.env.PUBLIC_URL.replace(/\/$/, '') : null;
function getBaseUrlForReq(req) {
  return PUBLIC_URL_FALLBACK || (req.protocol + '://' + req.get('host'));
}
app.get('/api/signage/current', (req, res) => {
  const playerId = req.query.player_id || req.query.playerId;
  if (!playerId) return res.status(400).json({ error: 'player_id gerekli' });
  const cur = playerCurrentMedia.get(playerId);
  if (!cur || !videoLibrary.has(cur.videoId)) return res.status(204).end();
  const baseUrl = getBaseUrlForReq(req);
  res.json({ url: `${baseUrl}/api/videos/${cur.videoId}/file`, videoId: cur.videoId });
});
app.post('/api/signage/play', (req, res) => {
  const { player_id: playerId, playerId: playerIdAlt, video_id: videoId, videoId: videoIdAlt } = req.body || {};
  const pid = playerId || playerIdAlt;
  const vid = videoId || videoIdAlt;
  if (!pid || !vid) return res.status(400).json({ error: 'player_id ve video_id gerekli' });
  const v = videoLibrary.get(vid);
  if (!v) return res.status(404).json({ error: 'Video bulunamadı' });
  const baseUrl = getBaseUrlForReq(req);
  playerCurrentMedia.set(pid, { url: `${baseUrl}/api/videos/${vid}/file`, videoId: vid });
  res.json({ ok: true, url: `${baseUrl}/api/videos/${vid}/file` });
});
app.post('/api/signage/stop', (req, res) => {
  const { player_id: playerId, playerId: playerIdAlt } = req.body || {};
  const pid = playerId || playerIdAlt;
  if (!pid) return res.status(400).json({ error: 'player_id gerekli' });
  playerCurrentMedia.delete(pid);
  res.json({ ok: true });
});

// ---------- Anthias: merkezden yönetilen ekranlar (her biri Pi'de Anthias çalışıyor) ----------
const ANTHIAS_DATA_FILE = path.join(__dirname, 'data', 'anthias-devices.json');
const anthiasDevices = new Map(); // id -> { id, name, baseUrl }

function loadAnthiasDevices() {
  try {
    const dir = path.dirname(ANTHIAS_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(ANTHIAS_DATA_FILE)) return;
    const data = JSON.parse(fs.readFileSync(ANTHIAS_DATA_FILE, 'utf8'));
    if (Array.isArray(data.devices)) {
      data.devices.forEach((d) => {
        if (d.id && d.baseUrl) anthiasDevices.set(d.id, { id: d.id, name: d.name || d.id, baseUrl: d.baseUrl.replace(/\/$/, '') });
      });
    }
  } catch (_) {}
}
function saveAnthiasDevices() {
  try {
    const dir = path.dirname(ANTHIAS_DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const devices = Array.from(anthiasDevices.values());
    fs.writeFileSync(ANTHIAS_DATA_FILE, JSON.stringify({ devices }, null, 2), 'utf8');
  } catch (e) {
    console.error('[Anthias] save error', e.message);
  }
}
loadAnthiasDevices();

app.get('/api/anthias/devices', (req, res) => {
  const list = Array.from(anthiasDevices.values());
  res.json({ devices: list });
});

app.post('/api/anthias/devices', (req, res) => {
  const { name, baseUrl } = req.body || {};
  if (!baseUrl || typeof baseUrl !== 'string') return res.status(400).json({ error: 'baseUrl gerekli' });
  const url = baseUrl.replace(/\/$/, '');
  const id = uuidv4();
  anthiasDevices.set(id, { id, name: (name || url).trim() || id, baseUrl: url });
  saveAnthiasDevices();
  res.status(201).json(anthiasDevices.get(id));
});

app.delete('/api/anthias/devices/:id', (req, res) => {
  if (!anthiasDevices.has(req.params.id)) return res.status(404).json({ error: 'Cihaz bulunamadı' });
  anthiasDevices.delete(req.params.id);
  saveAnthiasDevices();
  res.json({ ok: true });
});

app.get('/api/anthias/devices/:id/status', async (req, res) => {
  const dev = anthiasDevices.get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'Cihaz bulunamadı' });
  try {
    const r = await fetch(`${dev.baseUrl}/api/docs/`, { method: 'GET', signal: AbortSignal.timeout(5000) });
    res.json({ online: r.ok, status: r.status });
  } catch (e) {
    res.json({ online: false, error: e.message });
  }
});

// Anthias'ta URL oynat: önce asset ekle (API'ye göre path değişebilir), sonra aktif et
app.post('/api/anthias/devices/:id/play-url', async (req, res) => {
  const dev = anthiasDevices.get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'Cihaz bulunamadı' });
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ error: 'url gerekli' });
  const baseUrl = PUBLIC_URL_FALLBACK || (req.protocol + '://' + req.get('host'));
  const videoUrl = url.startsWith('http') ? url : `${baseUrl}/api/videos/${url}/file`;
  try {
    // Anthias API: asset ekle (source_url veya url — sürüme göre farklı olabilir)
    const addRes = await fetch(`${dev.baseUrl}/api/assets/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: videoUrl, asset_type: 'webpage' }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (addRes && addRes.ok) {
      const data = await addRes.json().catch(() => ({}));
      const assetId = data.id || data.asset_id;
      if (assetId) {
        const activateRes = await fetch(`${dev.baseUrl}/api/assets/${assetId}/activate/`, {
          method: 'POST',
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        if (activateRes && activateRes.ok) return res.json({ ok: true, assetId });
      }
      return res.json({ ok: true });
    }
    // Alternatif: sadece asset ekle (aktif etme endpoint'i farklı olabilir)
    const altRes = await fetch(`${dev.baseUrl}/api/assets/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_url: videoUrl }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => null);
    if (altRes && altRes.ok) return res.json({ ok: true });
    const errText = (addRes && (await addRes.text().catch(() => ''))) || (altRes && (await altRes.text().catch(() => ''))) || '';
    res.status(502).json({ error: 'Anthias API yanıt vermedi. Cihazda /api/docs/ kontrol edin.', detail: errText.slice(0, 200) });
  } catch (e) {
    res.status(502).json({ error: e.message || 'Cihaza bağlanılamadı' });
  }
});

// Anthias API'ye serbest proxy: POST body { path, method, body }
app.post('/api/anthias/devices/:id/proxy', express.json(), async (req, res) => {
  const dev = anthiasDevices.get(req.params.id);
  if (!dev) return res.status(404).json({ error: 'Cihaz bulunamadı' });
  const { path: subPath = '', method = 'GET', body: proxyBody } = req.body || {};
  const targetUrl = `${dev.baseUrl}/api/${String(subPath).replace(/^\//, '')}`;
  try {
    const opts = { method: method.toUpperCase(), signal: AbortSignal.timeout(15000) };
    if (opts.method !== 'GET' && opts.method !== 'HEAD' && proxyBody != null) {
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(proxyBody);
    }
    const r = await fetch(targetUrl, opts);
    const text = await r.text();
    try {
      res.status(r.status).json(JSON.parse(text));
    } catch {
      res.status(r.status).send(text);
    }
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

const io = new Server(server, {
  cors: { origin: true },
  pingTimeout: 20000,
  pingInterval: 10000,
});

const ADMIN_ROOM = 'admin';
const players = new Map(); // socketId -> { playerId, socketId, storedVideos: string[], status? }
// Lite client (MPV/OMXPlayer): playerId -> { url, videoId } — Admin "Oynat" ile güncellenir
const playerCurrentMedia = new Map();

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

  // Admin: cihazda oynat (web player + Lite client için playerCurrentMedia güncellenir)
  socket.on('player_play', (payload) => {
    const { playerSocketId, videoId } = payload || {};
    if (!playerSocketId || !videoId) return;
    const v = videoLibrary.get(videoId);
    const target = io.sockets.sockets.get(playerSocketId);
    const player = target ? players.get(playerSocketId) : null;
    const playerId = player?.playerId;
    if (playerId && v) {
      const baseUrl = getBaseUrl(socket);
      playerCurrentMedia.set(playerId, { url: `${baseUrl}/api/videos/${videoId}/file`, videoId });
    }
    if (target) target.emit('play_video', { videoId });
  });

  // Admin: cihazda durdur
  socket.on('player_stop', (payload) => {
    const { playerSocketId } = payload || {};
    if (!playerSocketId) return;
    const player = players.get(playerSocketId);
    if (player?.playerId) playerCurrentMedia.delete(player.playerId);
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
