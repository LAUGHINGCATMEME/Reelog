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
    StatusBar: { style: 'DARK', backgroundColor: '#0C0A0A', overlaysWebView: false },
  },
};

export default config;
