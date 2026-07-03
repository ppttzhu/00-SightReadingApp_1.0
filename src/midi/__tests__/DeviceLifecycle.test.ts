import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DeviceLifecycle, DeviceLifecycleCallbacks } from '../DeviceLifecycle';
import { DeviceDescriptor } from '../types';

function makeDevice(id: string, name?: string): DeviceDescriptor {
  return { id, name: name ?? `Device ${id}`, type: 'input' };
}

describe('DeviceLifecycle', () => {
  let callbacks: DeviceLifecycleCallbacks;
  let lifecycle: DeviceLifecycle;

  beforeEach(() => {
    callbacks = {
      onShouldListen: vi.fn(),
      onNoDevices: vi.fn(),
    };
    lifecycle = new DeviceLifecycle(callbacks);
  });

  describe('handleDeviceConnected', () => {
    it('adds the device and calls onShouldListen', () => {
      const device = makeDevice('a');
      lifecycle.handleDeviceConnected(device);

      expect(callbacks.onShouldListen).toHaveBeenCalledWith(device);
      expect(lifecycle.getActiveDevice()).toEqual(device);
      expect(lifecycle.getDevices()).toEqual([device]);
    });

    it('always switches to the most recently connected device', () => {
      const deviceA = makeDevice('a');
      const deviceB = makeDevice('b');

      lifecycle.handleDeviceConnected(deviceA);
      lifecycle.handleDeviceConnected(deviceB);

      expect(lifecycle.getActiveDevice()).toEqual(deviceB);
      expect(callbacks.onShouldListen).toHaveBeenCalledTimes(2);
      expect(callbacks.onShouldListen).toHaveBeenLastCalledWith(deviceB);
    });

    it('maintains connection order (most recent last)', () => {
      const deviceA = makeDevice('a');
      const deviceB = makeDevice('b');
      const deviceC = makeDevice('c');

      lifecycle.handleDeviceConnected(deviceA);
      lifecycle.handleDeviceConnected(deviceB);
      lifecycle.handleDeviceConnected(deviceC);

      expect(lifecycle.getDevices()).toEqual([deviceA, deviceB, deviceC]);
    });

    it('re-connecting a device moves it to the end', () => {
      const deviceA = makeDevice('a');
      const deviceB = makeDevice('b');

      lifecycle.handleDeviceConnected(deviceA);
      lifecycle.handleDeviceConnected(deviceB);
      lifecycle.handleDeviceConnected(deviceA);

      expect(lifecycle.getDevices()).toEqual([deviceB, deviceA]);
      expect(lifecycle.getActiveDevice()).toEqual(deviceA);
    });
  });

  describe('handleDeviceDisconnected', () => {
    it('falls back to next most recent device when active device disconnects', () => {
      const deviceA = makeDevice('a');
      const deviceB = makeDevice('b');
      const deviceC = makeDevice('c');

      lifecycle.handleDeviceConnected(deviceA);
      lifecycle.handleDeviceConnected(deviceB);
      lifecycle.handleDeviceConnected(deviceC);

      // Disconnect active (C), should fallback to B (most recent remaining)
      lifecycle.handleDeviceDisconnected(deviceC);

      expect(lifecycle.getActiveDevice()).toEqual(deviceB);
      expect(callbacks.onShouldListen).toHaveBeenLastCalledWith(deviceB);
    });

    it('calls onNoDevices when last device disconnects', () => {
      const device = makeDevice('a');

      lifecycle.handleDeviceConnected(device);
      lifecycle.handleDeviceDisconnected(device);

      expect(callbacks.onNoDevices).toHaveBeenCalledTimes(1);
      expect(lifecycle.getActiveDevice()).toBeNull();
      expect(lifecycle.getDevices()).toEqual([]);
    });

    it('does not change active device when a non-active device disconnects', () => {
      const deviceA = makeDevice('a');
      const deviceB = makeDevice('b');

      lifecycle.handleDeviceConnected(deviceA);
      lifecycle.handleDeviceConnected(deviceB);

      // Disconnect non-active device A
      lifecycle.handleDeviceDisconnected(deviceA);

      expect(lifecycle.getActiveDevice()).toEqual(deviceB);
      expect(callbacks.onNoDevices).not.toHaveBeenCalled();
      // onShouldListen should not have been called again for fallback
      expect(callbacks.onShouldListen).toHaveBeenCalledTimes(2); // only the initial 2 connections
    });

    it('handles disconnecting a device that is not in the list', () => {
      const deviceA = makeDevice('a');
      const unknown = makeDevice('unknown');

      lifecycle.handleDeviceConnected(deviceA);
      lifecycle.handleDeviceDisconnected(unknown);

      expect(lifecycle.getActiveDevice()).toEqual(deviceA);
      expect(callbacks.onNoDevices).not.toHaveBeenCalled();
    });
  });

  describe('getActiveDevice', () => {
    it('returns null when no devices are connected', () => {
      expect(lifecycle.getActiveDevice()).toBeNull();
    });
  });

  describe('getDevices', () => {
    it('returns an empty array when no devices are connected', () => {
      expect(lifecycle.getDevices()).toEqual([]);
    });

    it('returns a copy of the device list', () => {
      const device = makeDevice('a');
      lifecycle.handleDeviceConnected(device);

      const devices = lifecycle.getDevices();
      devices.push(makeDevice('injected'));

      expect(lifecycle.getDevices()).toEqual([device]);
    });
  });

  describe('clear', () => {
    it('resets all state', () => {
      lifecycle.handleDeviceConnected(makeDevice('a'));
      lifecycle.handleDeviceConnected(makeDevice('b'));

      lifecycle.clear();

      expect(lifecycle.getActiveDevice()).toBeNull();
      expect(lifecycle.getDevices()).toEqual([]);
    });
  });
});
