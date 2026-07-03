import { PluginListenerHandle } from '@capacitor/core';

/**
 * Capacitor MIDI Plugin interface for native MIDI device communication.
 *
 * Provides methods to discover MIDI devices, start/stop listening for MIDI events,
 * and subscribe to device lifecycle and error events via the JS Bridge.
 */
export interface MidiPlugin {
  /**
   * Returns a list of currently connected MIDI device descriptors.
   * Resolves to an empty array if no devices are connected.
   */
  listDevices(): Promise<{ devices: DeviceDescriptor[] }>;

  /**
   * Begins forwarding MIDI events from the specified device.
   * If already listening to a different device, the previous listener is stopped first.
   *
   * @param options - Object containing the device ID to listen to.
   * @throws Rejects with `device-not-found` if the device ID is not recognized.
   */
  startListening(options: { deviceId: string }): Promise<void>;

  /**
   * Stops forwarding MIDI events from any active device.
   * Resolves successfully even if no device is currently being listened to.
   */
  stopListening(): Promise<void>;

  /**
   * Subscribes to NoteOn and NoteOff MIDI events from the active device.
   */
  addListener(
    eventName: 'midiEvent',
    callback: (event: MidiEvent) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to device connection events.
   */
  addListener(
    eventName: 'deviceConnected',
    callback: (device: DeviceDescriptor) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to device disconnection events.
   */
  addListener(
    eventName: 'deviceDisconnected',
    callback: (device: DeviceDescriptor) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Subscribes to plugin error events for unrecoverable errors.
   */
  addListener(
    eventName: 'error',
    callback: (error: MidiError) => void
  ): Promise<PluginListenerHandle>;
}

/**
 * Describes a connected MIDI device as reported by the native layer.
 */
export interface DeviceDescriptor {
  /** Unique identifier from the OS (CoreMIDI endpoint ID or Android device+port ID) */
  id: string;
  /** Human-readable device name from the OS */
  name: string;
  /** Port direction: 'input' for devices that send MIDI data, 'output' for devices that receive */
  type: 'input' | 'output';
}

/**
 * A parsed MIDI event forwarded from the native plugin to JavaScript.
 */
export interface MidiEvent {
  /** The type of MIDI message */
  type: 'noteOn' | 'noteOff';
  /** MIDI note number (0-127) */
  note: number;
  /** Key velocity (0-127; 0 for noteOff) */
  velocity: number;
  /** Timestamp in milliseconds since epoch */
  timestamp: number;
}

/**
 * Machine-readable error codes emitted by the MIDI plugin.
 *
 * - `permission-denied`: User denied Bluetooth (iOS) or USB access (Android)
 * - `usb-not-supported`: Android device lacks USB host mode
 * - `midi-init-failed`: CoreMIDI client creation or Android MIDI service unavailable
 * - `device-not-found`: `startListening` called with unknown device ID
 * - `port-open-failed`: Native port could not be opened on a detected device
 * - `session-lost`: CoreMIDI session invalidated or Android MIDI service died
 */
export type MidiErrorCode =
  | 'permission-denied'
  | 'usb-not-supported'
  | 'midi-init-failed'
  | 'device-not-found'
  | 'port-open-failed'
  | 'session-lost';

/**
 * An error event emitted by the MIDI plugin for unrecoverable conditions.
 */
export interface MidiError {
  /** Machine-readable error code identifying the failure type */
  code: MidiErrorCode;
  /** Human-readable description of the error */
  message: string;
}
