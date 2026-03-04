import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.load.game',
  appName: 'Load',
  webDir: '../web/dist',
  server: {
    androidScheme: 'https',
  },
};

export default config;
