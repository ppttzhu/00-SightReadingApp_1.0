import { DeviceDescriptor } from './types';
import { DeviceManager } from '../plugins/midi/DeviceManager';

/**
 * Callbacks for DeviceLifecycle state changes.
 */
export interface DeviceLifecycleCallbacks {
  /** Called when the active device should change; caller should call startListening */
  onShouldListen: (device: DeviceDescriptor) => void;
  /** Called when no devices remain and listening should stop */
  onNoDevices: () => void;
}

/**
 * Manages MIDI device lifecycle including auto-listen on connection
 * and fallback on disconnection.
 *
 * Devices are maintained in connection-time order (most recent last).
 * On new connection, the most recently connected device becomes active.
 * On active device disconnect, falls back to the next most recently
 * connected remaining device, or emits no-device if none remain.
 */
export class DeviceLifecycle {
  private deviceManager: DeviceManager;
  private activeDeviceId: string | null = null;
  private callbacks: DeviceLifecycleCallbacks;

  constructor(callbacks: DeviceLifecycleCallbacks) {
    this.callbacks = callbacks;
    this.deviceManager = new DeviceManager();
  }

  /**
   * Handle a new device connection.
   *
   * Adds the device to the ordered list and switches to it as the active
   * device (most recent connection always wins). Invokes onShouldListen.
   */
  handleDeviceConnected(device: DeviceDescriptor): void {
    this.deviceManager.addDevice(device);
    this.activeDeviceId = device.id;
    this.callbacks.onShouldListen(device);
  }

  /**
   * Handle a device disconnection.
   *
   * Removes the device from the ordered list. If it was the active device,
   * attempts to fallback to the most recently connected remaining device.
   * If no devices remain, invokes onNoDevices.
   */
  handleDeviceDisconnected(device: DeviceDescriptor): void {
    this.deviceManager.removeDevice(device.id);

    if (this.activeDeviceId === device.id) {
      const fallback = this.deviceManager.getMostRecentDevice();
      if (fallback) {
        this.activeDeviceId = fallback.id;
        this.callbacks.onShouldListen(fallback);
      } else {
        this.activeDeviceId = null;
        this.callbacks.onNoDevices();
      }
    }
  }

  /**
   * Get the currently active device (or null if no devices are connected).
   */
  getActiveDevice(): DeviceDescriptor | null {
    if (this.activeDeviceId === null) {
      return null;
    }
    return this.deviceManager.getDeviceById(this.activeDeviceId) ?? null;
  }

  /**
   * Get all connected devices in connection-time order.
   */
  getDevices(): DeviceDescriptor[] {
    return this.deviceManager.getDevices();
  }

  /**
   * Reset all state, clearing the device list and active device.
   */
  clear(): void {
    this.deviceManager.clear();
    this.activeDeviceId = null;
  }
}
