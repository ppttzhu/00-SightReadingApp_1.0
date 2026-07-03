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

## Run on iOS Simulator

### First time setup

```bash
# 1. Install dependencies and sync
npm install
npx cap sync ios

# 2. Find available simulators
xcrun simctl list devices available | grep iPhone

# 3. Boot a simulator (replace <UDID> with the UUID from above)
xcrun simctl boot <UDID>

# 4. Build
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -destination 'id=<UDID>' build 2>&1 | tail -5
cd ../..

# 5. Install and launch
xcrun simctl install <UDID> ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch <UDID> com.sightreading.app
```

### Re-launch (no code changes)

```bash
xcrun simctl launch <UDID> com.sightreading.app
```

### Rebuild after code changes

```bash
# Sync changes
npx cap sync ios

# Build
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -destination 'id=<UDID>' build 2>&1 | tail -5
cd ../..

# Kill old app, install new build, launch
xcrun simctl terminate <UDID> com.sightreading.app
xcrun simctl install <UDID> ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch <UDID> com.sightreading.app
```

### If Simulator is not booted

```bash
xcrun simctl boot <UDID>
```

> **Note:** MIDI hardware (USB/Bluetooth keyboards) does NOT work in the iOS Simulator.
> Use a physical device to test MIDI connectivity.

## Run on Physical iPhone

### Option A: Via Xcode GUI

```bash
# Fix Xcode registration (one-time, if `open -a Xcode` doesn't work)
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f /Applications/Xcode.app

# Open the workspace in Xcode
open -a Xcode ios/App/App.xcworkspace

# If the above fails, try:
/Applications/Xcode.app/Contents/MacOS/Xcode ios/App/App.xcworkspace &
```

Then in Xcode:
1. Connect iPhone via USB cable
2. Select your iPhone in the device dropdown (top toolbar)
3. Go to **Signing & Capabilities** → enable "Automatically manage signing" → select your Team
4. Press **Cmd+R** to build and run
5. On first install: iPhone → **Settings → General → VPN & Device Management** → Trust the developer certificate

### Option B: Command line (after Xcode signing is configured)

```bash
# Build for device
cd ios/App
xcodebuild -workspace App.xcworkspace -scheme App -destination 'generic/platform=iOS' build 2>&1 | tail -5
cd ../..

# Install (requires ios-deploy: brew install ios-deploy)
ios-deploy --bundle ~/Library/Developer/Xcode/DerivedData/App-*/Build/Products/Debug-iphoneos/App.app
```

### Requirements for Physical Device

- Apple ID signed in to Xcode (free account works, but app expires after 7 days)
- iPhone on iOS 15+
- USB cable (data cable, not charge-only)
- Tap "Trust This Computer" on the iPhone when first connecting

## Run on Android

```bash
npx cap sync android
npx cap open android
# Build and run from Android Studio on a physical device or emulator
```

Or via command line:
```bash
cd android
./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.sightreading.app/.MainActivity
```

## Testing

### Unit Tests

```bash
# Run all tests
npx vitest run

# Watch mode
npx vitest
```

### Integration Tests

Located in `tests/integration/`. These are `it.todo()` stubs documenting scenarios that require physical MIDI hardware:

| File | Scenarios |
|------|-----------|
| `midi-device.test.ts` | USB/Bluetooth MIDI connection, NoteOn/NoteOff forwarding, hot-plug, multi-device |
| `webview-lifecycle.test.ts` | WebView loading, localStorage persistence, offline handling, splash screen |

To verify these manually:
1. Deploy app to a physical device
2. Connect a MIDI keyboard (USB via Camera Connection Kit on iOS, USB OTG on Android)
3. Follow the steps documented in each test stub

## Key Configuration

| Item | Value |
|------|-------|
| Bundle ID | `com.sightreading.app` |
| Server URL | `https://ruihan.me` |
| iOS Target | 15.0+ |
| Android minSdk | 24 (Android 7.0+) |

## Project Structure

```
├── capacitor.config.ts          # Capacitor config (app ID, server URL)
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
│   └── App/Plugins/MidiPlugin/  # CoreMIDI plugin (Swift)
├── android/                     # Android native project
│   └── app/src/main/java/.../midi/  # android.media.midi plugin (Kotlin)
└── tests/
    └── integration/             # Integration test stubs (require devices)
```
