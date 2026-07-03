import { PluginListenerHandle } from '@capacitor/core';

import { MidiProviderInterface } from './MidiProvider';
import { DeviceDescriptor, NoteOnEvent, NoteOffEvent, MidiStatus } from './types';
import { Midi, MidiEvent, MidiError, DeviceDescriptor as PluginDeviceDescriptor } from '../plugins/midi/index';
import { ListenerManager } from '../plugins/midi/ListenerManager';
import { DeviceLifecycle } from './DeviceLifecycle';

/**
 * MidiProvider implementation that wraps the native Capacitor MIDI plugin.
 *
 * Uses DeviceLifecycle for auto-connect/fallback logic:
 * - Auto-listens to the most recently connected device
 * - Falls back to next most-recent device on disconnect
 * - Reports 'no-device' when all devices are disconnected
 *
 * Implements stopped-state behavior: after an unrecoverable error event,
 * ceases forwarding MIDI events until startListening is called again.
 */
export class CapacitorMidiProvider implements MidiProviderInterface {
  private noteOnListeners = new ListenerManager<NoteOnEvent>();
  private noteOffListeners = new ListenerManager<NoteOffEvent>();
  private deviceChangeListeners = new ListenerManager<{ status: MidiStatus; devices: DeviceDescriptor[] }>();

  private status: MidiStatus = 'disconnected';
  private isStopped = false;

  private pluginHandles: PluginListenerHandle[] = [];

  private lifecycle: DeviceLifecycle;

  constructor() {
    this.lifecycle = new DeviceLifecycle({
      onShouldListen: (device) => this.doStartListening(device),
      onNoDevices: () => this.handleNoDevices(),
    });
  }

  async connect(): Promise<void> {
    this.status = 'connecting';
    this.notifyDeviceChange();

    try {
      // Get initial device list
      const { devices } = await Midi.listDevices();
      for (const device of devices) {
        this.lifecycle.handleDeviceConnected(device);
      }

      // Subscribe to plugin events
      await this.subscribeToPluginEvents();

      // If lifecycle auto-selected a device, we're connected
      const active = this.lifecycle.getActiveDevice();
      if (active) {
        this.status = 'connected';
      } else {
        this.status = 'no-device';
      }

      this.notifyDeviceChange();
    } catch (error) {
      this.status = 'error';
      this.notifyDeviceChange();
      throw error;
    }
  }

  disconnect(): void {
    // Stop listening on active device
    Midi.stopListening().catch(() => {
      // Ignore errors during disconnect
    });

    // Remove all plugin event listeners
    for (const handle of this.pluginHandles) {
      handle.remove();
    }
    this.pluginHandles = [];

    this.lifecycle.clear();
    this.isStopped = false;
    this.status = 'disconnected';
    this.notifyDeviceChange();
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

  onDeviceChange(callback: (status: MidiStatus, devices: DeviceDescriptor[]) => void): () => void {
    const handle = this.deviceChangeListeners.add(({ status, devices }) => {
      callback(status, devices);
    });
    return () => handle.remove();
  }

  private async subscribeToPluginEvents(): Promise<void> {
    const midiEventHandle = await Midi.addListener('midiEvent', (event: MidiEvent) => {
      this.handleMidiEvent(event);
    });

    const deviceConnectedHandle = await Midi.addListener('deviceConnected', (device: PluginDeviceDescriptor) => {
      this.handleDeviceConnected(device);
    });

    const deviceDisconnectedHandle = await Midi.addListener('deviceDisconnected', (device: PluginDeviceDescriptor) => {
      this.handleDeviceDisconnected(device);
    });

    const errorHandle = await Midi.addListener('error', (error: MidiError) => {
      this.handleError(error);
    });

    this.pluginHandles.push(midiEventHandle, deviceConnectedHandle, deviceDisconnectedHandle, errorHandle);
  }

  private handleMidiEvent(event: MidiEvent): void {
    // Stopped-state behavior: cease forwarding until startListening is called again
    if (this.isStopped) return;

    if (event.type === 'noteOn' && event.velocity > 0) {
      const noteOnEvent: NoteOnEvent = {
        note: event.note,
        velocity: event.velocity,
        timestamp: event.timestamp,
      };
      this.noteOnListeners.notify(noteOnEvent);
    } else if (event.type === 'noteOff' || (event.type === 'noteOn' && event.velocity === 0)) {
      const noteOffEvent: NoteOffEvent = {
        note: event.note,
        timestamp: event.timestamp,
      };
      this.noteOffListeners.notify(noteOffEvent);
    }
  }

  private handleDeviceConnected(device: PluginDeviceDescriptor): void {
    // DeviceLifecycle will call onShouldListen with the most recent device
    this.lifecycle.handleDeviceConnected(device);
  }

  private handleDeviceDisconnected(device: PluginDeviceDescriptor): void {
    // DeviceLifecycle will handle fallback or invoke onNoDevices
    this.lifecycle.handleDeviceDisconnected(device);
  }

  private handleError(error: MidiError): void {
    // Unrecoverable error: enter stopped state
    this.isStopped = true;
    this.status = 'error';
    this.notifyDeviceChange();
  }

  /**
   * Called by DeviceLifecycle when a device should become the active listener.
   * Issues the native startListening call and updates status.
   */
  private doStartListening(device: DeviceDescriptor): void {
    // Reset stopped state when a new listen session begins
    this.isStopped = false;

    Midi.startListening({ deviceId: device.id })
      .then(() => {
        this.status = 'connected';
        this.notifyDeviceChange();
      })
      .catch(() => {
        // If we can't start listening, keep current state but notify
        this.notifyDeviceChange();
      });
  }

  /**
   * Called by DeviceLifecycle when no devices remain.
   */
  private handleNoDevices(): void {
    this.status = 'no-device';
    this.notifyDeviceChange();
  }

  private notifyDeviceChange(): void {
    this.deviceChangeListeners.notify({
      status: this.status,
      devices: this.lifecycle.getDevices(),
    });
  }
}
