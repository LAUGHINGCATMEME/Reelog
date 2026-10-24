import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isNative } from './lib/native';
import { postersReady } from './lib/posters';
import './styles.css';

// Wait (briefly) to learn which posters are saved on the device, so they show from the first frame.
void Promise.race([postersReady, new Promise((r) => setTimeout(r, 1500))]).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
);

// Ask the browser not to evict the log under storage pressure.
navigator.storage?.persist?.().catch(() => {});

// The Android app bundles its files, so the offline service worker is only for the web build.
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
