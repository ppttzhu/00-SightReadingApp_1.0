import { describe, it, expect, beforeEach } from 'vitest';

import { DeviceManager } from '../DeviceManager';
import { DeviceDescriptor } from '../definitions';

function makeDevice(id: string, name?: string): DeviceDescriptor {
  return { id, name: name ?? `Device ${id}`, type: 'input' };
}

describe('DeviceManager', () => {
  let manager: DeviceManager;

  beforeEach(() => {
    manager = new DeviceManager();
  });

  describe('addDevice', () => {
    it('adds a device to the list', () => {
      const device = makeDevice('1');
      manager.addDevice(device);

      expect(manager.getDevices()).toEqual([device]);
    });

    it('maintains connection-time order (most recent last)', () => {
      const d1 = makeDevice('1');
      const d2 = makeDevice('2');
      const d3 = makeDevice('3');

      manager.addDevice(d1);
      manager.addDevice(d2);
      manager.addDevice(d3);

      expect(manager.getDevices()).toEqual([d1, d2, d3]);
    });

    it('moves an existing device to the end on re-add', () => {
      const d1 = makeDevice('1');
      const d2 = makeDevice('2');

      manager.addDevice(d1);
      manager.addDevice(d2);
      manager.addDevice(d1); // re-connect

      expect(manager.getDevices()).toEqual([d2, d1]);
    });

    it('evicts the oldest device when at max capacity (8)', () => {
      for (let i = 1; i <= 8; i++) {
        manager.addDevice(makeDevice(String(i)));
      }
      expect(manager.getDeviceCount()).toBe(8);

      const newDevice = makeDevice('9');
      manager.addDevice(newDevice);

      expect(manager.getDeviceCount()).toBe(8);
      // Device '1' (oldest) should be evicted
      expect(manager.getDeviceById('1')).toBeUndefined();
      // New device should be at the end
      expect(manager.getDevices()[7]).toEqual(newDevice);
    });
  });

  describe('removeDevice', () => {
    it('removes a device by ID and returns it', () => {
      const device = makeDevice('1');
      manager.addDevice(device);

      const removed = manager.removeDevice('1');

      expect(removed).toEqual(device);
      expect(manager.getDevices()).toEqual([]);
    });

    it('returns undefined for a non-existent device ID', () => {
      const removed = manager.removeDevice('nonexistent');
      expect(removed).toBeUndefined();
    });

    it('preserves order of remaining devices', () => {
      const d1 = makeDevice('1');
      const d2 = makeDevice('2');
      const d3 = makeDevice('3');

      manager.addDevice(d1);
      manager.addDevice(d2);
      manager.addDevice(d3);

      manager.removeDevice('2');

      expect(manager.getDevices()).toEqual([d1, d3]);
    });
  });

  describe('getDevices', () => {
    it('returns an empty array when no devices connected', () => {
      expect(manager.getDevices()).toEqual([]);
    });

    it('returns a copy (mutations do not affect internal state)', () => {
      manager.addDevice(makeDevice('1'));
      const devices = manager.getDevices();
      devices.push(makeDevice('2'));

      expect(manager.getDeviceCount()).toBe(1);
    });
  });

  describe('getDeviceById', () => {
    it('returns a device matching the given ID', () => {
      const device = makeDevice('abc');
      manager.addDevice(device);

      expect(manager.getDeviceById('abc')).toEqual(device);
    });

    it('returns undefined if the device does not exist', () => {
      expect(manager.getDeviceById('nope')).toBeUndefined();
    });
  });

  describe('getMostRecentDevice', () => {
    it('returns undefined when no devices are connected', () => {
      expect(manager.getMostRecentDevice()).toBeUndefined();
    });

    it('returns the last device added', () => {
      manager.addDevice(makeDevice('1'));
      manager.addDevice(makeDevice('2'));

      expect(manager.getMostRecentDevice()).toEqual(makeDevice('2'));
    });
  });

  describe('getDeviceCount', () => {
    it('returns 0 for an empty manager', () => {
      expect(manager.getDeviceCount()).toBe(0);
    });

    it('returns the correct count after adds and removes', () => {
      manager.addDevice(makeDevice('1'));
      manager.addDevice(makeDevice('2'));
      expect(manager.getDeviceCount()).toBe(2);

      manager.removeDevice('1');
      expect(manager.getDeviceCount()).toBe(1);
    });
  });

  describe('clear', () => {
    it('removes all devices', () => {
      manager.addDevice(makeDevice('1'));
      manager.addDevice(makeDevice('2'));

      manager.clear();

      expect(manager.getDevices()).toEqual([]);
      expect(manager.getDeviceCount()).toBe(0);
    });
  });
});
