import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { isNative } from './lib/native';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Ask the browser not to evict the log under storage pressure.
navigator.storage?.persist?.().catch(() => {});

// The Android app bundles its files, so the offline service worker is only for the web build.
if (import.meta.env.PROD && !isNative && 'serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
