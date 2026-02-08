import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import * as db from './db';

const PLAYER_ID_KEY = 'digitalsignage_player_id';
const LAST_VIDEO_KEY = 'digitalsignage_last_video_id'; // Açılışta otomatik oynatılacak son video
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin);

function getOrCreatePlayerId() {
  let id = localStorage.getItem(PLAYER_ID_KEY);
  if (!id) {
    id = 'pi_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem(PLAYER_ID_KEY, id);
  }
  return id;
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [currentVideoId, setCurrentVideoId] = useState(null);
  const [storedVideoIds, setStoredVideoIds] = useState([]);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [playerId] = useState(getOrCreatePlayerId);
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const objectUrlRef = useRef(null);
  const currentVideoIdRef = useRef(null);
  currentVideoIdRef.current = currentVideoId;

  const reportStoredVideos = (socket, ids) => {
    if (socket) socket.emit('stored_videos', { videoIds: ids });
  };

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;

    socket.on('connect', async () => {
      setConnected(true);
      setError(null);
      const ids = await db.getStoredVideoIds();
      setStoredVideoIds(ids);
      socket.emit('join-room', { room: 'player', playerId, storedVideos: ids });
      // Pi/kiosk: açılışta son oynatılan videoyu otomatik başlat (Chromium hazır olsun diye kısa gecikme)
      const lastId = localStorage.getItem(LAST_VIDEO_KEY);
      if (lastId && ids.includes(lastId)) {
        setTimeout(() => playVideoById(lastId), 1500);
      }
    });

    socket.on('joined', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('download_and_store', async ({ videoId, name, downloadUrl }) => {
      setDownloading(true);
      setError(null);
      try {
        const res = await fetch(downloadUrl);
        if (!res.ok) throw new Error('İndirme hatası');
        const blob = await res.blob();
        await db.putVideo(videoId, name, blob);
        const ids = await db.getStoredVideoIds();
        setStoredVideoIds(ids);
        reportStoredVideos(socket, ids);
      } catch (e) {
        setError(e.message || 'Video kaydedilemedi');
      } finally {
        setDownloading(false);
      }
    });

    const playVideoById = async (videoId) => {
      setError(null);
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      const video = videoRef.current;
      if (!video) return;
      try {
        const blob = await db.getVideo(videoId);
        if (!blob) {
          setError('Video cihazda bulunamadı');
          return;
        }
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        video.src = url;
        video.muted = true;
        video.playsInline = true;
        video.loop = true;
        video.setAttribute('loop', '');
        video.load();
        setCurrentVideoId(videoId);
        currentVideoIdRef.current = videoId;
        localStorage.setItem(LAST_VIDEO_KEY, videoId);
        await new Promise((resolve, reject) => {
          video.oncanplay = () => resolve();
          video.onerror = () => reject(video.error);
          if (video.readyState >= 3) resolve();
        });
        await video.play();
        socketRef.current?.emit('player_status', { status: 'playing' });
        try {
          if (video.requestFullscreen) video.requestFullscreen();
          else if (video.webkitRequestFullscreen) video.webkitRequestFullscreen();
        } catch (_) {}
      } catch (e) {
        setError(e.message || 'Oynatılamadı');
        setCurrentVideoId(null);
      }
    };

    socket.on('play_video', async ({ videoId }) => {
      await playVideoById(videoId);
    });

    socket.on('stop', () => {
      try {
        if (document.fullscreenElement) document.exitFullscreen();
        else if (document.webkitFullscreenElement) document.webkitExitFullscreen();
      } catch (_) {}
      const video = videoRef.current;
      if (video) {
        video.pause();
        video.removeAttribute('src');
        video.load();
      }
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setCurrentVideoId(null);
      currentVideoIdRef.current = null;
      socket.emit('player_status', { status: 'stopped' });
    });

    socket.on('delete_video', async ({ videoId }) => {
      try {
        await db.deleteVideo(videoId);
        const ids = await db.getStoredVideoIds();
        setStoredVideoIds(ids);
        reportStoredVideos(socket, ids);
        if (currentVideoIdRef.current === videoId) {
          const v = videoRef.current;
          if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          setCurrentVideoId(null);
          currentVideoIdRef.current = null;
          socket.emit('player_status', { status: 'stopped' });
        }
      } catch (_) {}
    });

    return () => socket.disconnect();
  }, [playerId]);

  // Loop ile video biter bitmez tekrar başlar; sadece Durdur/Sil ile durur

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
      {error && (
        <div className="absolute top-2 left-2 right-2 rounded bg-amber-900/80 px-3 py-2 text-sm text-amber-200">
          {error}
        </div>
      )}
      {downloading && (
        <div className="absolute top-2 right-2 rounded bg-sky-900/80 px-3 py-2 text-sm text-sky-200">
          Video indiriliyor…
        </div>
      )}
      {!currentVideoId && (
        <div className="text-center text-slate-500">
          <p className="text-lg font-medium">İç bekleniyor</p>
          <p className="mt-1 text-sm">Cihaz: {playerId}</p>
          <p className="mt-2 text-xs">{connected ? 'Bağlı' : 'Bağlanıyor…'}</p>
        </div>
      )}
      <video
        ref={videoRef}
        muted
        playsInline
        loop
        className={`absolute inset-0 h-full w-full object-contain ${currentVideoId ? 'block' : 'hidden'}`}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: currentVideoId ? 5 : 0 }}
      />
    </div>
  );
}
