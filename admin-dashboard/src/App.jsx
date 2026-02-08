import { useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';
import { DeviceList } from './components/DeviceList';
import { VideoControl } from './components/VideoControl';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || '';

export default function App() {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [videos, setVideos] = useState([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const url = SOCKET_URL || (window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin);
    const s = io(url, { transports: ['websocket', 'polling'], reconnection: true });
    setSocket(s);

    s.on('connect', () => {
      setConnected(true);
      setError(null);
      s.emit('admin_ready');
    });
    s.on('player_list', (list) => setPlayers(list || []));
    s.on('disconnect', (reason) => setConnected(false));
    s.on('connect_error', (err) => setError(err.message));

    return () => s.disconnect();
  }, []);

  useEffect(() => {
    if (!connected) return;
    const base = SOCKET_URL || (window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin);
    fetch(`${base}/api/videos`)
      .then((r) => r.json())
      .then((data) => setVideos(data.videos || []))
      .catch(() => setVideos([]));
  }, [connected]);

  const playOnPlayer = useCallback(
    (playerSocketId, videoFile) => {
      if (!socket || !playerSocketId || !videoFile) return;
      const base = SOCKET_URL || (window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin);
      const videoUrl = `${base}/videos/${encodeURIComponent(videoFile)}`;

      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.style.position = 'fixed';
      video.style.left = '-9999px';
      video.style.width = '1px';
      video.style.height = '1px';
      document.body.appendChild(video);

      const cleanup = () => {
        try {
          document.body.removeChild(video);
        } catch (_) {}
      };

      video.onerror = () => {
        cleanup();
        socket.emit('play_video', { targetSocketId: playerSocketId, videoUrl, videoName: videoFile });
        return;
      };

      video.oncanplay = () => {
        try {
          const stream = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
          if (!stream) {
            socket.emit('play_video', { targetSocketId: playerSocketId, videoUrl, videoName: videoFile });
            cleanup();
            return;
          }
          video.play().catch(() => {});

          const peer = new SimplePeer({ initiator: true, stream, trickle: true });

          peer.on('signal', (signal) => {
            socket.emit('webrtc_signal', { to: playerSocketId, signal });
          });

          peer.on('error', () => {
            socket.emit('play_video', { targetSocketId: playerSocketId, videoUrl, videoName: videoFile });
          });
          peer.on('close', cleanup);

          socket.once('webrtc_signal', function onSignal(payload) {
            if (payload?.from !== playerSocketId) return;
            socket.off('webrtc_signal', onSignal);
            peer.signal(payload.signal);
          });
        } catch (_) {
          socket.emit('play_video', { targetSocketId: playerSocketId, videoUrl, videoName: videoFile });
          cleanup();
        }
      };

      video.src = videoUrl;
    },
    [socket]
  );

  return (
    <div className="min-h-screen font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6">
          <h1 className="text-xl font-semibold tracking-tight text-white">Digital Signage — Control Panel</h1>
          <div className="mt-1 flex items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-500'}`}
              aria-hidden
            />
            <span className="text-sm text-slate-400">{connected ? 'Connected' : 'Disconnected'}</span>
            {error && <span className="text-sm text-amber-400">{error}</span>}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <div className="grid gap-8 lg:grid-cols-2">
          <DeviceList players={players} />
          <VideoControl
            videos={videos}
            players={players}
            onPlay={playOnPlayer}
            disabled={!connected}
          />
        </div>
      </main>
    </div>
  );
}
