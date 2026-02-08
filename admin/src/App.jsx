import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin);
const API_BASE = SOCKET_URL.replace(/\/$/, '');

export default function App() {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [library, setLibrary] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selectedPlayerSocketId, setSelectedPlayerSocketId] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnection: true });
    setSocket(s);
    s.on('connect', () => {
      setConnected(true);
      setError(null);
      s.emit('join-room', { room: 'admin' });
      setTimeout(() => s.emit('get-player-list'), 500);
    });
    s.on('player-list', (list) => setPlayers(list || []));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => setError(err.message));
    const onVisibility = () => { if (document.visibilityState === 'visible' && s.connected) s.emit('get-player-list'); };
    document.addEventListener('visibilitychange', onVisibility);
    const interval = setInterval(() => { if (s.connected) s.emit('get-player-list'); }, 10000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(interval);
      s.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!connected) return;
    fetch(`${API_BASE}/api/videos`)
      .then((r) => r.json())
      .then((data) => setLibrary(data.videos || []))
      .catch(() => setLibrary([]));
  }, [connected]);

  const refreshLibrary = () => {
    fetch(`${API_BASE}/api/videos`)
      .then((r) => r.json())
      .then((data) => setLibrary(data.videos || []))
      .catch(() => setLibrary([]));
  };

  const selectedPlayer = players.find((p) => p.socketId === selectedPlayerSocketId) || null;
  const storedVideos = selectedPlayer?.storedVideos || [];
  const libraryMap = Object.fromEntries((library || []).map((v) => [v.id, v.name]));

  const handleUpload = (e) => {
    const file = e.target?.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const form = new FormData();
    form.append('video', file);
    fetch(`${API_BASE}/api/videos/upload`, { method: 'POST', body: form })
      .then((r) => r.json())
      .then(() => refreshLibrary())
      .catch((err) => setError(err.message || 'Yükleme hatası'))
      .finally(() => {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      });
  };

  const sendVideoToPlayer = (videoId) => {
    if (!socket || !selectedPlayerSocketId) return;
    setError(null);
    socket.emit('send_video_to_player', { playerSocketId: selectedPlayerSocketId, videoId });
  };

  const playOnPlayer = (videoId) => {
    if (!socket || !selectedPlayerSocketId) return;
    socket.emit('player_play', { playerSocketId: selectedPlayerSocketId, videoId });
  };

  const stopPlayer = () => {
    if (!socket || !selectedPlayerSocketId) return;
    socket.emit('player_stop', { playerSocketId: selectedPlayerSocketId });
  };

  const deleteFromPlayer = (videoId) => {
    if (!socket || !selectedPlayerSocketId) return;
    socket.emit('player_delete_video', { playerSocketId: selectedPlayerSocketId, videoId });
  };

  const deleteFromLibrary = (videoId) => {
    setError(null);
    fetch(`${API_BASE}/api/videos/${videoId}`, { method: 'DELETE' })
      .then(() => refreshLibrary())
      .catch((err) => setError(err.message));
  };

  return (
    <div className="min-h-screen p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-white">ArioPi — Yönetim</h1>
        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-slate-400">{connected ? 'Bağlı' : 'Bağlı değil'}</span>
          {error && <span className="text-sm text-amber-400">{error}</span>}
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Video kütüphanesi */}
        <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="text-lg font-medium text-slate-200">Video kütüphanesi</h2>
          <p className="mt-1 text-sm text-slate-500">Sunucudaki videolar. Cihaza gönder veya sil.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={handleUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!connected || uploading}
              className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {uploading ? 'Yükleniyor…' : 'Video yükle'}
            </button>
          </div>
          <ul className="mt-3 space-y-2 max-h-48 overflow-y-auto">
            {library.length === 0 && <li className="text-sm text-slate-500">Henüz video yok.</li>}
            {library.map((v) => (
              <li key={v.id} className="flex items-center justify-between rounded border border-slate-600 bg-slate-700/50 px-3 py-2 text-sm">
                <span className="truncate text-slate-300" title={v.name}>{v.name}</span>
                <div className="flex gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => sendVideoToPlayer(v.id)}
                    disabled={!selectedPlayerSocketId || !connected}
                    className="rounded bg-emerald-600 px-2 py-1 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Cihaza gönder
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteFromLibrary(v.id)}
                    className="rounded bg-red-600/80 px-2 py-1 text-xs text-white hover:bg-red-500"
                  >
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Cihazlar ve kontrol */}
        <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-medium text-slate-200">Cihazlar</h2>
              <p className="mt-1 text-sm text-slate-500">Cihaz seç, cihazdaki videoyu oynat / durdur / sil.</p>
            </div>
            <button
              type="button"
              onClick={() => socket?.emit('get-player-list')}
              disabled={!connected}
              className="shrink-0 rounded bg-slate-600 px-2 py-1.5 text-xs text-slate-200 hover:bg-slate-500 disabled:opacity-50"
            >
              Listeyi yenile
            </button>
          </div>
          {players.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Bağlı cihaz yok. Pi açıksa birkaç saniye bekleyin veya &quot;Listeyi yenile&quot;ye tıklayın.</p>
          ) : (
            <>
              <ul className="mt-3 space-y-2">
                {players.map((p) => (
                  <li
                    key={p.socketId}
                    className={`flex items-center justify-between rounded border px-3 py-2 text-sm ${
                      selectedPlayerSocketId === p.socketId ? 'border-sky-500 bg-sky-900/30' : 'border-slate-600 bg-slate-700/50'
                    }`}
                  >
                    <span className="font-mono text-slate-300">{p.playerId}</span>
                    <span className="text-xs text-slate-500">{(p.storedVideos || []).length} video</span>
                    <button
                      type="button"
                      onClick={() => setSelectedPlayerSocketId(p.socketId)}
                      className={`rounded px-3 py-1 text-xs font-medium ${
                        selectedPlayerSocketId === p.socketId ? 'bg-sky-600 text-white' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                      }`}
                    >
                      Seç
                    </button>
                  </li>
                ))}
              </ul>

              {selectedPlayer && (
                <div className="mt-4 rounded border border-slate-600 bg-slate-700/30 p-3">
                  <h3 className="text-sm font-medium text-slate-300">Cihazda kayıtlı videolar</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={stopPlayer}
                      disabled={!connected}
                      className="rounded bg-amber-600 px-3 py-1.5 text-sm text-white hover:bg-amber-500 disabled:opacity-50"
                    >
                      Durdur
                    </button>
                  </div>
                  <ul className="mt-3 space-y-2 max-h-40 overflow-y-auto">
                    {storedVideos.length === 0 && <li className="text-xs text-slate-500">Cihazda video yok.</li>}
                    {storedVideos.map((videoId) => (
                      <li key={videoId} className="flex items-center justify-between rounded bg-slate-800/50 px-2 py-1.5 text-xs">
                        <span className="truncate text-slate-400">{libraryMap[videoId] || videoId}</span>
                        <div className="flex gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => playOnPlayer(videoId)}
                            className="rounded bg-emerald-600 px-2 py-0.5 text-white hover:bg-emerald-500"
                          >
                            Oynat
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteFromPlayer(videoId)}
                            className="rounded bg-red-600/80 px-2 py-0.5 text-white hover:bg-red-500"
                          >
                            Sil
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
