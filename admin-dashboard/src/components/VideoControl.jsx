import { useState } from 'react';

export function VideoControl({ videos, players, onPlay, disabled }) {
  const [selectedVideo, setSelectedVideo] = useState('');
  const [selectedPlayerId, setSelectedPlayerId] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePlay = () => {
    if (!selectedVideo || !selectedPlayerId) return;
    setLoading(true);
    try {
      onPlay(selectedPlayerId, selectedVideo);
    } finally {
      setLoading(false);
    }
  };

  const canPlay = selectedVideo && selectedPlayerId && !disabled && !loading;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-medium text-slate-200">Video control</h2>
      <p className="mt-1 text-sm text-slate-500">Select a video and a device to start playback (WebRTC or URL fallback).</p>

      <div className="mt-6 space-y-4">
        <div>
          <label htmlFor="video-select" className="block text-sm font-medium text-slate-400">
            Video file
          </label>
          <select
            id="video-select"
            value={selectedVideo}
            onChange={(e) => setSelectedVideo(e.target.value)}
            disabled={disabled}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
          >
            <option value="">Select a video…</option>
            {videos.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          {videos.length === 0 && !disabled && (
            <p className="mt-1 text-xs text-amber-500">Add .mp4 files to server/videos to see them here.</p>
          )}
        </div>

        <div>
          <label htmlFor="player-select" className="block text-sm font-medium text-slate-400">
            Target device
          </label>
          <select
            id="player-select"
            value={selectedPlayerId}
            onChange={(e) => setSelectedPlayerId(e.target.value)}
            disabled={disabled}
            className="mt-1.5 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-200 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
          >
            <option value="">Select a device…</option>
            {players.map((p) => (
              <option key={p.socketId} value={p.socketId}>
                {p.deviceId} ({p.socketId.slice(0, 8)}…)
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={handlePlay}
          disabled={!canPlay}
          className="w-full rounded-lg bg-sky-600 px-4 py-2.5 font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Starting…' : 'Play on selected device'}
        </button>
      </div>
    </section>
  );
}
