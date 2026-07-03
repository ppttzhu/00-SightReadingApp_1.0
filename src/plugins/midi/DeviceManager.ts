import { DeviceDescriptor } from './definitions';

/**
 * Maximum number of MIDI devices that can be tracked simultaneously.
 */
const MAX_DEVICES = 8;

/**
 * Manages an ordered list of connected MIDI devices.
 *
 * Devices are stored in connection-time order (most recent connection last).
 * The list is capped at MAX_DEVICES entries. When the limit is reached,
 * the oldest device (first in the list) is evicted to make room.
 */
export class DeviceManager {
  private devices: DeviceDescriptor[] = [];

  /**
   * Adds a device to the end of the list (most recent connection).
   * If the device already exists (by id), it is moved to the end.
   * If the list is at capacity, the oldest device is evicted.
   */
  addDevice(device: DeviceDescriptor): void {
    // Remove existing entry if present (re-connection moves it to end)
    this.devices = this.devices.filter((d) => d.id !== device.id);

    // Evict oldest if at capacity
    if (this.devices.length >= MAX_DEVICES) {
      this.devices.shift();
    }

    this.devices.push(device);
  }

  /**
   * Removes a device by its ID.
   * Returns the removed device, or undefined if not found.
   */
  removeDevice(id: string): DeviceDescriptor | undefined {
    const index = this.devices.findIndex((d) => d.id === id);
    if (index === -1) {
      return undefined;
    }
    return this.devices.splice(index, 1)[0];
  }

  /**
   * Returns a copy of all connected devices in connection-time order.
   */
  getDevices(): DeviceDescriptor[] {
    return [...this.devices];
  }

  /**
   * Returns a specific device by ID, or undefined if not found.
   */
  getDeviceById(id: string): DeviceDescriptor | undefined {
    return this.devices.find((d) => d.id === id);
  }

  /**
   * Returns the most recently connected device (last in the list),
   * or undefined if no devices are connected.
   */
  getMostRecentDevice(): DeviceDescriptor | undefined {
    return this.devices.length > 0
      ? this.devices[this.devices.length - 1]
      : undefined;
  }

  /**
   * Returns the current number of connected devices.
   */
  getDeviceCount(): number {
    return this.devices.length;
  }

  /**
   * Removes all devices from the list.
   */
  clear(): void {
    this.devices = [];
  }
}
