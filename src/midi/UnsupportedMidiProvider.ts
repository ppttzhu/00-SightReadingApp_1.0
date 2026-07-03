import { MidiProviderInterface } from './MidiProvider';
import { DeviceDescriptor, NoteOnEvent, NoteOffEvent, MidiStatus } from './types';
import { ListenerManager } from '../plugins/midi/ListenerManager';

/**
 * MidiProvider fallback for environments where no MIDI subsystem is available.
 * Immediately reports status as 'unsupported' and rejects connect() calls.
 *
 * Validates: Requirements 6.7
 */
export class UnsupportedMidiProvider implements MidiProviderInterface {
  private readonly status: MidiStatus = 'unsupported';
  private readonly deviceChangeListeners = new ListenerManager<{ status: MidiStatus; devices: DeviceDescriptor[] }>();

  /**
   * Rejects with an error indicating MIDI is not supported in this environment.
   */
  async connect(): Promise<void> {
    throw new Error('MIDI is not supported in this environment');
  }

  /**
   * No-op: nothing to disconnect in an unsupported environment.
   */
  disconnect(): void {
    // No-op
  }

  /**
   * Returns an empty array — no devices can ever be detected.
   */
  getDevices(): DeviceDescriptor[] {
    return [];
  }

  /**
   * Registers a NoteOn callback. It will never be invoked since no MIDI
   * subsystem is available. Returns an unsubscribe function.
   */
  onNoteOn(callback: (event: NoteOnEvent) => void): () => void {
    // Store the callback but it will never fire
    let registered = true;
    void callback; // acknowledge parameter
    return () => {
      registered = false;
      void registered;
    };
  }

  /**
   * Registers a NoteOff callback. It will never be invoked since no MIDI
   * subsystem is available. Returns an unsubscribe function.
   */
  onNoteOff(callback: (event: NoteOffEvent) => void): () => void {
    // Store the callback but it will never fire
    let registered = true;
    void callback; // acknowledge parameter
    return () => {
      registered = false;
      void registered;
    };
  }

  /**
   * Registers a device-change callback and immediately invokes it with
   * status 'unsupported' and an empty device list to indicate no MIDI
   * support is available in this environment.
   *
   * Returns an unsubscribe function.
   */
  onDeviceChange(callback: (status: MidiStatus, devices: DeviceDescriptor[]) => void): () => void {
    const wrappedCallback = (event: { status: MidiStatus; devices: DeviceDescriptor[] }) => {
      callback(event.status, event.devices);
    };

    const handle = this.deviceChangeListeners.add(wrappedCallback);

    // Immediately notify this subscriber that MIDI is unsupported
    callback(this.status, []);

    return () => {
      handle.remove();
    };
  }
}
