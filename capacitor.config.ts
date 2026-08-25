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
    SplashScreen: {
      launchShowDuration: 900,
      backgroundColor: '#0b0720',
      showSpinner: false,
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    Keyboard: {
      resize: 'native',
    },
    // Android 15+ is edge-to-edge with no opt-out at targetSdk 36, and the old
    // StatusBar.setOverlaysWebView / setBackgroundColor calls do nothing there.
    // SystemBars replaces them:
    //   style: 'DARK'      → light icons, for our dark background. (The name
    //                        describes the BACKGROUND, not the icons — DARK
    //                        clears setAppearanceLightStatusBars.)
    //   insetsHandling     → the default 'css'; Capacitor reads the real insets
    //                        from WindowInsetsCompat and injects them as
    //                        --safe-area-inset-*, which src/index.css consumes.
    //                        Stated explicitly because turning it off would
    //                        silently put content under the status bar.
    SystemBars: {
      style: 'DARK',
      insetsHandling: 'css',
    },
  },
  // For live-reload on a device during dev, uncomment and point at your LAN IP:
  // server: { url: 'http://192.168.1.50:5173', cleartext: true },
}

export default config
