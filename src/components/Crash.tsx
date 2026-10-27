import { Component, type ReactNode } from 'react';
import { saveFile } from '../lib/native';

/**
 * Last line of defence: if rendering throws, show what happened and a way to save the log,
 * instead of a blank screen. The log is read straight from storage, so it works whatever broke.
 */
export class CrashGuard extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  save = () => {
    const raw = localStorage.getItem('reelog-v4') ?? '{}';
    let body = raw;
    try {
      body = JSON.stringify({ app: 'reelog', version: 4, exported: new Date().toISOString(), ...JSON.parse(raw) });
    } catch {
      /* save it as it is */
    }
    void saveFile(`reelog-rescue-${Date.now()}.json`, body, 'application/json').catch(() => {});
  };

  render() {
    const e = this.state.error;
    if (!e) return this.props.children;
    return (
      <div className="crash">
        <div className="crash-title">Something went wrong</div>
        <div className="crash-body">Your log is still saved on this device. Save a copy, then reload. If it keeps happening, please report it on GitHub with the message below.</div>
        <pre className="crash-msg">{String(e.stack ?? e.message).slice(0, 1200)}</pre>
        <div className="crash-actions">
          <button className="btn btn--secondary" onClick={this.save}>Save my log</button>
          <button className="btn btn--primary" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
