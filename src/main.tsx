import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { CrashGuard } from './components/Crash';
import { isNative, watchKeyboard } from './lib/native';
import { postersReady } from './lib/posters';

// Apply the saved theme before the first frame, so a light theme doesn't flash dark.
try {
  const t = (JSON.parse(localStorage.getItem('reelog-settings') ?? '{}') as { theme?: string }).theme ?? 'black';
  const light = t === 'white' || (t === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  document.documentElement.dataset.theme = t === 'system' ? (light ? 'white' : 'black') : t;
} catch {
  /* defaults to Black */
}
import './styles.css';

// Wait (briefly) to learn which posters are saved on the device, so they show from the first frame.
void Promise.race([postersReady, new Promise((r) => setTimeout(r, 1500))]).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <CrashGuard>
        <App />
      </CrashGuard>
    </StrictMode>,
  ),
);

watchKeyboard();

// Ask the browser not to evict the log under storage pressure.
navigator.storage?.persist?.().catch(() => {});

// The Android app bundles its files, so the offline service worker is only for the web build.
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
