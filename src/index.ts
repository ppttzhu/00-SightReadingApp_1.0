/**
 * Capacitor MIDI Bridge — Entry Point
 *
 * Exports the MidiProvider factory, interface, and types for consumption
 * by the web app. The app should call createMidiProvider() to get the
 * appropriate provider for the current runtime environment.
 *
 * Usage:
 *   import { createMidiProvider, MidiProviderInterface, MidiStatus } from './index';
 *
 *   const midi = createMidiProvider();
 *   await midi.connect();
 *   midi.onNoteOn((event) => console.log('Note on:', event.note));
 */

// App lifecycle initialization (splash screen, offline handling)
import { initializeAppLifecycle } from './app';

// Initialize app lifecycle (splash screen, offline handling)
initializeAppLifecycle().catch((err) => {
  console.error('Failed to initialize app lifecycle:', err);
});

// MidiProvider factory and interface
export { createMidiProvider, MidiProviderInterface } from './midi/MidiProvider';

// Provider implementations (for advanced use cases or testing)
export { CapacitorMidiProvider } from './midi/CapacitorMidiProvider';
export { WebMidiProvider } from './midi/WebMidiProvider';
export { UnsupportedMidiProvider } from './midi/UnsupportedMidiProvider';

// Types
export type { NoteOnEvent, NoteOffEvent, MidiStatus, DeviceDescriptor } from './midi/types';

// DeviceLifecycle (for testing or custom integration)
export { DeviceLifecycle, DeviceLifecycleCallbacks } from './midi/DeviceLifecycle';

// Plugin (low-level native bridge access)
export { Midi } from './plugins/midi/index';
export type { MidiPlugin, MidiEvent, MidiError } from './plugins/midi/definitions';
