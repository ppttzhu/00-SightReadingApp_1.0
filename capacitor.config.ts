import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sightreading.app',
  appName: 'Sight Reading',
  webDir: 'dist',
  server: {
    url: 'https://ruihan.me',
    cleartext: false
  },
  ios: {
    scheme: 'Sight Reading'
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 0,
      showSpinner: false
    }
  }
};

export default config;
