import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';

const PLAYER_ID_KEY = 'digitalsignage_player_id';
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
  const [stream, setStream] = useState(null);
  const [playerId] = useState(getOrCreatePlayerId);
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const peerRef = useRef(null);

  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnection: true });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', { room: 'player', playerId });
    });

    socket.on('joined', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));

    socket.on('incoming-call', ({ from, signal }) => {
      const callerSocketId = from;
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch (_) {}
        peerRef.current = null;
      }
      setStream(null);

      const peer = new SimplePeer({ initiator: false, trickle: true });
      peerRef.current = peer;
      let firstSignal = true;

      peer.on('signal', (data) => {
        if (firstSignal) {
          firstSignal = false;
          socket.emit('answer-call', { to: callerSocketId, signal: data });
        } else {
          socket.emit('ice-candidate', { to: callerSocketId, candidate: data });
        }
      });

      peer.on('stream', (remoteStream) => {
        setStream(remoteStream);
      });

      peer.on('close', () => {
        peerRef.current = null;
        setStream(null);
      });
      peer.on('error', () => {
        peerRef.current = null;
        setStream(null);
      });

      socket.on('ice-candidate', ({ from: fromSocket, candidate }) => {
        if (fromSocket === from && candidate) peer.signal(candidate);
      });
      const offIce = () => socket.off('ice-candidate');
      peer.once('close', offIce);
      peer.once('error', offIce);

      try {
        peer.signal(signal);
      } catch (e) {
        setStream(null);
        peerRef.current = null;
      }
    });

    return () => {
      peerRef.current?.destroy();
      socket.disconnect();
    };
  }, [playerId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (stream) {
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      video.play().catch(() => {});
    } else {
      video.srcObject = null;
    }
  }, [stream]);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
      {!stream ? (
        <div className="text-center text-slate-500">
          <p className="text-lg font-medium">Waiting for content…</p>
          <p className="mt-1 text-sm">Player ID: {playerId}</p>
          <p className="mt-2 text-xs">{connected ? 'Connected' : 'Connecting…'}</p>
        </div>
      ) : null}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className={`absolute inset-0 h-full w-full object-contain ${stream ? 'block' : 'hidden'}`}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
      />
    </div>
  );
}
