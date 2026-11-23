import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.github.remcovolkers.pokebinder',
  appName: 'PokéBinder',
  webDir: 'dist/pokebinder/browser',
  android: {
    backgroundColor: '#0b1326',
    allowMixedContent: false,
  },
  plugins: {
    CapacitorUpdater: {
      // Self-hosted OTA via GitHub Pages (version.json + ota/web-bundle.zip)
      autoUpdate: 'off',
      statsUrl: '',
      resetWhenUpdate: true,
      autoDeleteFailed: true,
      autoDeletePrevious: true,
      appReadyTimeout: 15000,
    },
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0b1326',
    },
  },
};

export default config;
