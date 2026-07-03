import { MidiProviderInterface } from './MidiProvider';
import { DeviceDescriptor, NoteOnEvent, NoteOffEvent, MidiStatus } from './types';
import { ListenerManager } from '../plugins/midi/ListenerManager';
import { parseMidiBytes } from '../plugins/midi/MidiParser';
import { DeviceLifecycle } from './DeviceLifecycle';

/**
 * MidiProvider implementation that wraps the Web MIDI API (navigator.requestMIDIAccess).
 *
 * Uses DeviceLifecycle for device ordering, auto-listen, and fallback:
 * - Auto-listens to the most recently connected device
 * - Falls back to next most-recent device on disconnect
 * - Reports 'no-device' when all devices are disconnected
 *
 * Handles:
 * - MIDI access permission via navigator.requestMIDIAccess()
 * - Device discovery and hot-plug via onstatechange
 * - Parsing raw MIDI bytes into normalized NoteOnEvent/NoteOffEvent
 */
export class WebMidiProvider implements MidiProviderInterface {
  private midiAccess: MIDIAccess | null = null;
  private status: MidiStatus = 'disconnected';
  private activeInputId: string | null = null;

  private readonly noteOnListeners = new ListenerManager<NoteOnEvent>();
  private readonly noteOffListeners = new ListenerManager<NoteOffEvent>();
  private readonly deviceChangeListeners = new ListenerManager<{
    status: MidiStatus;
    devices: DeviceDescriptor[];
  }>();

  private readonly messageHandlers = new Map<string, (event: MIDIMessageEvent) => void>();
  private stateChangeHandler: ((event: MIDIConnectionEvent) => void) | null = null;

  private lifecycle: DeviceLifecycle;

  constructor() {
    this.lifecycle = new DeviceLifecycle({
      onShouldListen: (device) => this.doListenToDevice(device),
      onNoDevices: () => this.handleNoDevices(),
    });
  }

  async connect(): Promise<void> {
    this.status = 'connecting';

    let access: MIDIAccess;
    try {
      access = await navigator.requestMIDIAccess();
    } catch (err) {
      this.status = 'error';
      this.notifyDeviceChange();
      throw new Error(
        `MIDI access denied: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    this.midiAccess = access;

    // Scan existing input ports and add to DeviceLifecycle
    this.scanInputs();

    // Register statechange handler for hot-plug
    this.stateChangeHandler = (event: MIDIConnectionEvent) => {
      this.handleStateChange(event);
    };
    this.midiAccess.onstatechange = this.stateChangeHandler;

    // After scanning, check if lifecycle selected an active device
    const active = this.lifecycle.getActiveDevice();
    if (active) {
      this.status = 'connected';
    } else {
      this.status = 'no-device';
    }

    this.notifyDeviceChange();
  }

  disconnect(): void {
    // Remove onmidimessage handlers from all ports
    this.removeAllMessageHandlers();

    // Remove onstatechange handler
    if (this.midiAccess) {
      this.midiAccess.onstatechange = null;
    }
    this.stateChangeHandler = null;

    // Clear lifecycle state
    this.lifecycle.clear();
    this.activeInputId = null;
    this.midiAccess = null;
    this.status = 'disconnected';
  }

  getDevices(): DeviceDescriptor[] {
    return this.lifecycle.getDevices();
  }

  onNoteOn(callback: (event: NoteOnEvent) => void): () => void {
    const handle = this.noteOnListeners.add(callback);
    return () => handle.remove();
  }

  onNoteOff(callback: (event: NoteOffEvent) => void): () => void {
    const handle = this.noteOffListeners.add(callback);
    return () => handle.remove();
  }

  onDeviceChange(
    callback: (status: MidiStatus, devices: DeviceDescriptor[]) => void
  ): () => void {
    const handle = this.deviceChangeListeners.add(({ status, devices }) => {
      callback(status, devices);
    });
    return () => handle.remove();
  }

  // --- Private helpers ---

  private scanInputs(): void {
    if (!this.midiAccess) return;

    this.midiAccess.inputs.forEach((input) => {
      if (input.state === 'connected') {
        // DeviceLifecycle handles ordering and auto-listen
        this.lifecycle.handleDeviceConnected({
          id: input.id,
          name: input.name ?? 'Unknown MIDI Device',
          type: 'input',
        });
      }
    });
  }

  /**
   * Called by DeviceLifecycle when a device should become the active listener.
   * Attaches the onmidimessage handler to the target input port.
   */
  private doListenToDevice(device: DeviceDescriptor): void {
    if (!this.midiAccess) return;

    // Remove handler from previous active device
    if (this.activeInputId && this.activeInputId !== device.id) {
      this.removeMessageHandler(this.activeInputId);
    }

    const input = this.findInput(device.id);
    if (!input) return;

    const handler = (event: MIDIMessageEvent) => {
      this.handleMidiMessage(event);
    };

    input.onmidimessage = handler;
    this.messageHandlers.set(device.id, handler);
    this.activeInputId = device.id;
    this.status = 'connected';
    this.notifyDeviceChange();
  }

  /**
   * Called by DeviceLifecycle when no devices remain connected.
   */
  private handleNoDevices(): void {
    this.activeInputId = null;
    this.status = 'no-device';
    this.notifyDeviceChange();
  }

  private removeMessageHandler(deviceId: string): void {
    if (!this.midiAccess) return;

    const input = this.findInput(deviceId);
    if (input) {
      input.onmidimessage = null;
    }
    this.messageHandlers.delete(deviceId);
  }

  private findInput(deviceId: string): MIDIInput | undefined {
    if (!this.midiAccess) return undefined;
    let found: MIDIInput | undefined;
    this.midiAccess.inputs.forEach((input) => {
      if (input.id === deviceId) {
        found = input;
      }
    });
    return found;
  }

  private removeAllMessageHandlers(): void {
    if (!this.midiAccess) return;

    this.midiAccess.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
    this.messageHandlers.clear();
  }

  private handleMidiMessage(event: MIDIMessageEvent): void {
    if (!event.data) return;

    const data = Array.from(event.data) as number[];
    const parsed = parseMidiBytes(data, event.timeStamp);

    if (!parsed) return;

    if (parsed.type === 'noteOn') {
      const noteOnEvent: NoteOnEvent = {
        note: parsed.note,
        velocity: parsed.velocity,
        timestamp: parsed.timestamp,
      };
      this.noteOnListeners.notify(noteOnEvent);
    } else if (parsed.type === 'noteOff') {
      const noteOffEvent: NoteOffEvent = {
        note: parsed.note,
        timestamp: parsed.timestamp,
      };
      this.noteOffListeners.notify(noteOffEvent);
    }
  }

  private handleStateChange(event: MIDIConnectionEvent): void {
    const port = event.port;
    if (!port || port.type !== 'input') return;

    if (port.state === 'connected') {
      // New device connected — DeviceLifecycle handles auto-listen
      const descriptor: DeviceDescriptor = {
        id: port.id,
        name: port.name ?? 'Unknown MIDI Device',
        type: 'input',
      };
      this.lifecycle.handleDeviceConnected(descriptor);
    } else if (port.state === 'disconnected') {
      // Device disconnected — clean up message handler and let lifecycle handle fallback
      this.removeMessageHandler(port.id);

      this.lifecycle.handleDeviceDisconnected({
        id: port.id,
        name: port.name ?? 'Unknown MIDI Device',
        type: 'input',
      });
    }
  }

  private notifyDeviceChange(): void {
    this.deviceChangeListeners.notify({
      status: this.status,
      devices: this.lifecycle.getDevices(),
    });
  }
}
