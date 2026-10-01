import { useEffect, useState } from 'react';
import type { DesktopServices } from '../platform/contracts';
import type { CoreStatus } from '../shared/types';
import { reportError } from '../shared/logging';

export function App({ services }: { services: DesktopServices }) {
  const [status, setStatus] = useState<CoreStatus>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    void services.settings.load().then((value) => { if (active) setStatus(value); })
      .catch((reason: unknown) => { if (active) setError(reportError(reason)); });
    return () => { active = false; };
  }, [services]);

  async function toggleTop() {
    if (!status) return;
    setBusy(true);
    try {
      const settings = await services.window.setAlwaysOnTop(!status.settings.alwaysOnTop);
      setStatus({ ...status, settings });
      setError('');
    } catch (reason) { setError(reportError(reason)); }
    finally { setBusy(false); }
  }
  function action(task: Promise<void>) { void task.catch((reason: unknown) => setError(reportError(reason))); }

  return <main className="panel">
    <header onPointerDown={(event) => {
      if (event.button === 0) action(services.window.startDragging());
    }}><span className="dot" /> Slime <span className="drag-hint">drag</span></header>
    <h1>Desktop core</h1>
    <p>The area around this panel is transparent.</p>
    <p className="status">{status ? `${status.platform.name} · SQLite ready` : 'Connecting to native services…'}</p>
    <div className="actions">
      <button disabled={!status || busy} aria-pressed={status?.settings.alwaysOnTop ?? false} onClick={() => void toggleTop()}>
        Always on top: {status?.settings.alwaysOnTop ? 'on' : 'off'}
      </button>
      <button onClick={() => action(services.window.hide())}>Hide</button>
      <button onClick={() => action(services.application.quit())}>Quit</button>
    </div>
    <p className="hint">Restore from the system tray. No assistant features yet.</p>
    {error && <p className="error" role="alert">{error}</p>}
  </main>;
}
