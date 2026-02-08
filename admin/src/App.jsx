import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || (window.location.port === '5173' ? 'http://localhost:3000' : window.location.origin);

export default function App() {
  const [socket, setSocket] = useState(null);
  const [players, setPlayers] = useState([]);
  const [connected, setConnected] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const localVideoRef = useRef(null);
  const peerRef = useRef(null);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ['websocket', 'polling'], reconnection: true });
    setSocket(s);

    s.on('connect', () => {
      setConnected(true);
      setError(null);
      s.emit('join-room', { room: 'admin' });
    });

    s.on('player-list', (list) => setPlayers(list || []));
    s.on('disconnect', () => setConnected(false));
    s.on('connect_error', (err) => setError(err.message));

    return () => {
      peerRef.current?.destroy();
      s.disconnect();
    };
  }, []);

  const startStream = useCallback(async () => {
    const targetSocketId = selectedPlayerId;
    if (!socket || !targetSocketId) {
      setError('Select a player first.');
      return;
    }

    setError(null);
    setStreaming(true);

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
    } catch (err) {
      setError('Could not access webcam: ' + (err.message || 'Permission denied'));
      setStreaming(false);
      return;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = stream;
    }

    const peer = new SimplePeer({
      initiator: true,
      stream,
      trickle: true,
    });
    peerRef.current = peer;

    let firstSignal = true;
    peer.on('signal', (signal) => {
      if (firstSignal) {
        firstSignal = false;
        socket.emit('call-user', { to: targetSocketId, signal });
      } else {
        socket.emit('ice-candidate', { to: targetSocketId, candidate: signal });
      }
    });

    peer.on('stream', () => {
      setStreaming(true);
    });

    peer.on('close', () => {
      stream.getTracks().forEach((t) => t.stop());
      peerRef.current = null;
      setStreaming(false);
    });
    peer.on('error', (err) => {
      setError('WebRTC error: ' + (err.message || 'Connection failed'));
      stream.getTracks().forEach((t) => t.stop());
      peerRef.current = null;
      setStreaming(false);
    });

    const onCallApproved = (payload) => {
      if (payload?.signal) peer.signal(payload.signal);
    };
    const onIceCandidate = (payload) => {
      if (payload?.from === targetSocketId && payload?.candidate) peer.signal(payload.candidate);
    };

    socket.once('call-approved', onCallApproved);
    socket.on('ice-candidate', onIceCandidate);

    const cleanup = () => {
      socket.off('call-approved', onCallApproved);
      socket.off('ice-candidate', onIceCandidate);
    };
    peer.once('connect', cleanup);
    peer.once('close', cleanup);
    peer.once('error', cleanup);
  }, [socket, selectedPlayerId]);

  const stopStream = useCallback(() => {
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setStreaming(false);
  }, []);

  return (
    <div className="min-h-screen p-6">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-white">Digital Signage — Admin</h1>
        <div className="mt-2 flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${connected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-sm text-slate-400">{connected ? 'Connected' : 'Disconnected'}</span>
          {error && <span className="text-sm text-amber-400">{error}</span>}
        </div>
      </header>

      <div className="max-w-xl space-y-6">
        <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="text-lg font-medium text-slate-200">Online players</h2>
          {players.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No players connected. Open the Player on a Pi to see it here.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {players.map((p) => (
                <li key={p.socketId} className="flex items-center justify-between rounded border border-slate-600 bg-slate-700/50 px-3 py-2">
                  <span className="font-mono text-sm text-slate-300">{p.playerId}</span>
                  <button
                    type="button"
                    onClick={() => setSelectedPlayerId(p.socketId)}
                    className={`rounded px-3 py-1 text-sm font-medium ${
                      selectedPlayerId === p.socketId ? 'bg-sky-600 text-white' : 'bg-slate-600 text-slate-300 hover:bg-slate-500'
                    }`}
                  >
                    Select
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-lg border border-slate-700 bg-slate-800/50 p-4">
          <h2 className="text-lg font-medium text-slate-200">Stream</h2>
          <p className="mt-1 text-sm text-slate-500">Stream your webcam to the selected player.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={startStream}
              disabled={!connected || !selectedPlayerId || streaming}
              className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Start stream
            </button>
            <button
              type="button"
              onClick={stopStream}
              disabled={!streaming}
              className="rounded-lg bg-slate-600 px-4 py-2 font-medium text-slate-200 hover:bg-slate-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Stop stream
            </button>
          </div>
          {streaming && (
            <div className="mt-4">
              <p className="mb-2 text-sm text-slate-400">Preview (your webcam)</p>
              <video
                ref={localVideoRef}
                autoPlay
                muted
                playsInline
                className="max-h-48 rounded border border-slate-600 bg-black"
              />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
