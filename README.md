# Sight Reading App — Capacitor Shell

A Capacitor-based native shell that loads [ruihan.me](https://ruihan.me) in a WebView and provides native MIDI device access via a custom Capacitor plugin (CoreMIDI on iOS, android.media.midi on Android).

## Architecture

- **Native Shell** — Capacitor iOS/Android projects hosting a full-screen WebView
- **Native MIDI Plugin** — Swift (CoreMIDI) and Kotlin (android.media.midi) implementations
- **JS Bridge** — Capacitor's native-to-JS communication layer
- **MidiProvider** — TypeScript abstraction unifying Web MIDI API (desktop) and native plugin (mobile)

## Getting Started

### Prerequisites

- Node.js 18+
- Xcode 15+ (for iOS)
- Android Studio (for Android, API 24+)
- CocoaPods (for iOS dependencies)

### Install Dependencies

```bash
npm install
```

### Build and Sync

```bash
npx cap sync
```

### Run on iOS

```bash
npx cap open ios
# Build and run from Xcode on a physical device or simulator
```

### Run on Android

```bash
npx cap open android
# Build and run from Android Studio on a physical device or emulator
```

## Testing

### Unit and Property-Based Tests

Unit tests and property-based tests (fast-check) run in Node.js via Vitest:

```bash
# Run all unit and property tests
npx vitest run

# Run in watch mode during development
npx vitest
```

### Integration Tests

Integration tests are located in `tests/integration/` and document scenarios that **require physical hardware or platform emulators** to verify. They cannot be run in standard CI environments.

#### What Integration Tests Cover

| File | Scenarios |
|------|-----------|
| `midi-device.test.ts` | USB MIDI connection (iOS/Android), Bluetooth MIDI (iOS), NoteOn/NoteOff forwarding, disconnect detection, hot-plug, multi-device management |
| `webview-lifecycle.test.ts` | WebView loading, localStorage persistence, offline indicator, auto-reload on reconnect, splash screen dismissal, 10-second timeout error |

#### Prerequisites for Integration Tests

1. **Physical device or emulator** — USB MIDI will not work in iOS Simulator; use a real device.
2. **MIDI keyboard** — USB MIDI keyboard with Camera Connection Kit (iOS) or OTG adapter (Android), or a Bluetooth MIDI device (iOS only).
3. **Network control** — Ability to toggle airplane mode or use a network proxy for offline/timeout scenarios.
4. **App deployed to device** — The Capacitor app must be built and running on the target device.

#### How to Run Integration Tests

These tests are written as `it.todo()` stubs documenting manual verification steps. To execute them:

1. **Build and deploy the app:**
   ```bash
   npx cap sync
   npx cap open ios    # or: npx cap open android
   ```
   Then build and deploy to a physical device from Xcode or Android Studio.

2. **For automated execution** (optional), use a device testing framework:
   - **iOS:** XCUITest or Appium with WebDriverAgent
   - **Android:** Espresso or Appium with UiAutomator2

3. **Follow the steps in each test stub** to manually verify behavior on the device.

4. **Network tests** (offline indicator, auto-reload, timeout):
   - Use airplane mode or a network proxy to simulate connectivity loss
   - For timeout tests, block the domain while keeping the device "online"

5. **MIDI device tests:**
   - Connect a USB MIDI keyboard via Camera Connection Kit (iOS) or USB OTG (Android)
   - For Bluetooth tests: pair a BLE MIDI device in iOS Settings first
   - Press physical keys to verify event forwarding

#### Converting Stubs to Automated Tests

When setting up device automation (Appium, Detox, etc.), replace `it.todo()` with actual test implementations following the documented steps in each stub. The test structure and scenarios are already defined — they just need the device automation bindings.

## Project Structure

```
├── capacitor.config.ts          # Capacitor configuration (app ID, server URL)
├── package.json                 # Dependencies and scripts
├── tsconfig.json                # TypeScript configuration
├── vitest.config.ts             # Test runner configuration
├── dist/                        # Empty (app loads from URL; required by Capacitor)
├── src/
│   ├── plugins/midi/            # Native MIDI plugin TypeScript definitions
│   │   ├── definitions.ts       # Plugin interface and types
│   │   ├── index.ts             # Plugin registration
│   │   ├── web.ts               # Web fallback (no-op)
│   │   ├── MidiParser.ts        # MIDI byte parsing logic
│   │   ├── DeviceManager.ts     # Device list state management
│   │   └── ListenerManager.ts   # Subscription/callback management
│   └── midi/                    # MidiProvider abstraction layer
│       ├── MidiProvider.ts      # Factory + interface
│       ├── CapacitorMidiProvider.ts
│       ├── WebMidiProvider.ts
│       ├── UnsupportedMidiProvider.ts
│       ├── DeviceLifecycle.ts   # Auto-connect/fallback logic
│       └── types.ts             # Shared types
├── ios/                         # iOS native project
│   └── App/Plugins/MidiPlugin/  # CoreMIDI plugin implementation
├── android/                     # Android native project
│   └── app/src/main/java/.../midi/  # android.media.midi plugin
└── tests/
    └── integration/             # Integration test stubs (require devices)
        ├── midi-device.test.ts
        └── webview-lifecycle.test.ts
```

## Configuration

Key configuration in `capacitor.config.ts`:
- **App ID:** `com.sightreading.app`
- **Server URL:** `https://ruihan.me`
- **iOS target:** 15.0+
- **Android minSdk:** 24 (Android 7.0+)
