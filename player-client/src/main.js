/**
 * Digital Signage Player — lightweight client for Raspberry Pi
 * - Registers with server via Socket.io
 * - Receives WebRTC stream or play_video URL and plays fullscreen
 */

import { io } from 'socket.io-client';
import SimplePeer from 'simple-peer';

const DEVICE_ID_KEY = 'digitalsignage_device_id';
const SERVER_URL = getServerUrl();

function getServerUrl() {
  if (import.meta.env?.DEV) return 'http://localhost:3000';
  const { protocol, hostname, port } = window.location;
  return port ? `${protocol}//${hostname}:${port}` : `${protocol}//${hostname}`;
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = 'player_' + Math.random().toString(36).slice(2, 10) + '_' + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const video = document.getElementById('video');
const idle = document.getElementById('idle');
const statusEl = document.getElementById('status');
const deviceIdEl = document.getElementById('deviceId');

const deviceId = getOrCreateDeviceId();
deviceIdEl.textContent = 'Device ID: ' + deviceId;

let peer = null;
let currentStream = null;

function setStatus(online) {
  statusEl.textContent = online ? 'Connected • ' + deviceId : 'Disconnected';
  statusEl.className = 'status ' + (online ? 'online' : 'offline');
}

function showStream(stream) {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  currentStream = stream;
  video.srcObject = stream;
  video.style.display = 'block';
  idle.style.display = 'none';
  video.play().catch(() => {});
  try {
    video.requestFullscreen?.();
  } catch (_) {}
}

function showIdle() {
  if (currentStream) {
    currentStream.getTracks().forEach((t) => t.stop());
    currentStream = null;
  }
  video.srcObject = null;
  video.src = '';
  video.style.display = 'none';
  idle.style.display = 'block';
}

function playFromUrl(url) {
  video.style.display = 'block';
  idle.style.display = 'none';
  video.srcObject = null;
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  video.play().catch(() => {});
  try {
    video.requestFullscreen?.();
  } catch (_) {}
  video.onended = () => showIdle();
  video.onerror = () => showIdle();
}

function destroyPeer() {
  if (peer) {
    try {
      peer.destroy();
    } catch (_) {}
    peer = null;
  }
}

const socket = io(SERVER_URL, { transports: ['websocket', 'polling'], reconnection: true });

socket.on('connect', () => {
  setStatus(true);
  socket.emit('register_player', { deviceId });
});

socket.on('registered', () => {
  setStatus(true);
});

socket.on('disconnect', () => setStatus(false));
socket.on('connect_error', () => setStatus(false));

socket.on('play_video', ({ videoUrl, videoName } = {}) => {
  destroyPeer();
  if (videoUrl) {
    playFromUrl(videoUrl);
  } else {
    showIdle();
  }
});

socket.on('webrtc_signal', ({ from: fromSocketId, signal } = {}) => {
  if (!signal) return;

  if (peer) {
    try {
      peer.signal(signal);
    } catch (_) {}
    return;
  }

  peer = new SimplePeer({ initiator: false, trickle: true });

  peer.on('signal', (data) => {
    socket.emit('webrtc_signal', { to: fromSocketId, signal: data });
  });

  peer.on('stream', (stream) => {
    showStream(stream);
  });

  peer.on('close', () => {
    destroyPeer();
    showIdle();
  });
  peer.on('error', () => {
    destroyPeer();
    showIdle();
  });

  try {
    peer.signal(signal);
  } catch (_) {
    destroyPeer();
    showIdle();
  }
});

// Report status to server
socket.on('connect', () => {
  socket.emit('player_status', { status: 'online' });
});
video.onplay = () => {
  socket.emit('player_status', { status: 'playing', currentVideo: video.src || null });
};
video.onended = () => {
  socket.emit('player_status', { status: 'online', currentVideo: null });
};
video.onpause = () => {
  socket.emit('player_status', { status: 'paused', currentVideo: video.src || null });
};
