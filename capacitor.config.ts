import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The web assets are bundled into the app rather than loaded from Vercel.
 * This app is used on hotel and school wifi, so it has to open and show the
 * timeline before it has a network, and a remote server URL would mean a blank
 * screen whenever the connection is bad. Supabase is still the live backend.
 */
const config: CapacitorConfig = {
  appId: 'app.lifeos.suveda',
  appName: 'LifeOS',
  webDir: 'dist',

  ios: {
    // Matches the app background so there is no white flash on launch.
    backgroundColor: '#FAF7F2',
    // The app already handles env(safe-area-inset-*) throughout.
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 600,
      backgroundColor: '#FAF7F2',
      showSpinner: false,
      launchAutoHide: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
