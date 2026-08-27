import type { CapacitorConfig } from '@capacitor/cli'

// Verse Arcade Capacitor config.
// The app id must match the Bundle ID you register in the Apple Developer
// portal (see docs/SETUP-APPLE.md). Change `appId` there and keep in sync.
const config: CapacitorConfig = {
  appId: 'com.versearcade.app',
  appName: 'Verse Arcade',
  webDir: 'dist',
  backgroundColor: '#0b0720',
  ios: {
    // Respect the notch / home indicator; we handle safe-area insets in CSS.
    contentInset: 'always',
    backgroundColor: '#0b0720',
  },
  android: {
    backgroundColor: '#0b0720',
  },
  plugins: {
    // Android 15 (targetSdk 35+) forces edge-to-edge, and Capacitor 8's SystemBars
    // plugin is what draws the system bars and feeds the real WindowInsets to CSS
    // as --safe-area-inset-* (consumed by --safe-top/--safe-bottom in index.css).
    //
    // style must be pinned. The default is 'DEFAULT', which follows the DEVICE's
    // light/dark setting — so on a phone in light mode Android picks dark status
    // bar icons and paints them on this app's #0b0720 background, where they're
    // invisible. Verse Arcade is dark in every theme, so the bars are always
    // 'DARK' (which means dark background ⇒ light icons).
    SystemBars: {
      style: 'DARK',
    },
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0b0720',
      showSpinner: false,
    },
    Keyboard: {
      resize: 'native',
    },
  },
  // For live-reload on a device during dev, uncomment and point at your LAN IP:
  // server: { url: 'http://192.168.1.50:5173', cleartext: true },
}

export default config
