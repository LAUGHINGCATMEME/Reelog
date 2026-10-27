import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.reelog',
  appName: 'Reelog',
  webDir: 'dist',
  backgroundColor: '#0C0A0A',
  android: {
    // Android 15 draws apps edge-to-edge; keep the WebView clear of the status and nav bars.
    adjustMarginsForEdgeToEdge: 'force',
  },
  plugins: {
    // TMDB, AniList and GitHub all allow browser requests, so the WebView's own fetch() is used,
    // the same as in the web build.
    CapacitorHttp: { enabled: false },
    StatusBar: { style: 'DARK', backgroundColor: '#0C0A0A', overlaysWebView: false },
  },
};

export default config;
