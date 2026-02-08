export function DeviceList({ players }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-6">
      <h2 className="text-lg font-medium text-slate-200">Connected devices</h2>
      <p className="mt-1 text-sm text-slate-500">Raspberry Pi players that have registered with the server.</p>

      {!players?.length ? (
        <div className="mt-6 rounded-lg border border-dashed border-slate-700 bg-slate-800/30 py-12 text-center text-slate-500">
          No players connected. Open the player client on a device to see it here.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {players.map((p) => (
            <li
              key={p.socketId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-700 bg-slate-800/50 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="truncate font-mono text-sm text-slate-300">{p.deviceId}</p>
                <p className="mt-0.5 truncate text-xs text-slate-500">Socket: {p.socketId}</p>
                {p.currentVideo && (
                  <p className="mt-1 text-xs text-emerald-400">Playing: {p.currentVideo}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    p.status === 'online' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600 text-slate-400'
                  }`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {p.status || 'online'}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
