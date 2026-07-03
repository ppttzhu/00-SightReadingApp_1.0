import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CapacitorMidiProvider } from '../CapacitorMidiProvider';
import { MidiStatus } from '../types';

// Mock the Midi plugin
const mockListDevices = vi.fn();
const mockStartListening = vi.fn();
const mockStopListening = vi.fn();
const mockAddListener = vi.fn();

vi.mock('../../plugins/midi/index', () => ({
  Midi: {
    listDevices: (...args: unknown[]) => mockListDevices(...args),
    startListening: (...args: unknown[]) => mockStartListening(...args),
    stopListening: (...args: unknown[]) => mockStopListening(...args),
    addListener: (...args: unknown[]) => mockAddListener(...args),
  },
}));

// Capture listener callbacks registered via addListener
type ListenerCallbacks = {
  midiEvent?: (event: unknown) => void;
  deviceConnected?: (device: unknown) => void;
  deviceDisconnected?: (device: unknown) => void;
  error?: (error: unknown) => void;
};

function captureListeners(): ListenerCallbacks {
  const listeners: ListenerCallbacks = {};
  mockAddListener.mockImplementation((eventName: string, callback: (event: unknown) => void) => {
    listeners[eventName as keyof ListenerCallbacks] = callback;
    return Promise.resolve({ remove: vi.fn() });
  });
  return listeners;
}

describe('CapacitorMidiProvider', () => {
  let provider: CapacitorMidiProvider;
  let listeners: ListenerCallbacks;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new CapacitorMidiProvider();
    listeners = captureListeners();
    mockListDevices.mockResolvedValue({ devices: [] });
    mockStartListening.mockResolvedValue(undefined);
    mockStopListening.mockResolvedValue(undefined);
  });

  describe('connect()', () => {
    it('transitions status to connecting then no-device when no devices are available', async () => {
      const statusUpdates: MidiStatus[] = [];
      provider.onDeviceChange((status) => statusUpdates.push(status));

      await provider.connect();

      expect(statusUpdates).toContain('connecting');
      expect(statusUpdates).toContain('no-device');
    });

    it('calls listDevices and subscribes to plugin events', async () => {
      await provider.connect();

      expect(mockListDevices).toHaveBeenCalledTimes(1);
      expect(mockAddListener).toHaveBeenCalledTimes(4);
      expect(mockAddListener).toHaveBeenCalledWith('midiEvent', expect.any(Function));
      expect(mockAddListener).toHaveBeenCalledWith('deviceConnected', expect.any(Function));
      expect(mockAddListener).toHaveBeenCalledWith('deviceDisconnected', expect.any(Function));
      expect(mockAddListener).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('auto-starts listening to the most recent device when devices exist', async () => {
      const device = { id: 'dev-1', name: 'Piano', type: 'input' as const };
      mockListDevices.mockResolvedValue({ devices: [device] });

      await provider.connect();

      expect(mockStartListening).toHaveBeenCalledWith({ deviceId: 'dev-1' });
    });

    it('transitions to connected when a device is available', async () => {
      const device = { id: 'dev-1', name: 'Piano', type: 'input' as const };
      mockListDevices.mockResolvedValue({ devices: [device] });

      const statusUpdates: MidiStatus[] = [];
      provider.onDeviceChange((status) => statusUpdates.push(status));

      await provider.connect();

      expect(statusUpdates[statusUpdates.length - 1]).toBe('connected');
    });

    it('transitions to error status when listDevices throws', async () => {
      mockListDevices.mockRejectedValue(new Error('permission-denied'));

      const statusUpdates: MidiStatus[] = [];
      provider.onDeviceChange((status) => statusUpdates.push(status));

      await expect(provider.connect()).rejects.toThrow('permission-denied');
      expect(statusUpdates).toContain('error');
    });
  });

  describe('disconnect()', () => {
    it('calls stopListening and removes all plugin listeners', async () => {
      const removeHandles = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
      let handleIndex = 0;
      mockAddListener.mockImplementation((eventName: string, callback: (event: unknown) => void) => {
        listeners[eventName as keyof ListenerCallbacks] = callback;
        return Promise.resolve({ remove: removeHandles[handleIndex++] });
      });

      await provider.connect();
      provider.disconnect();

      expect(mockStopListening).toHaveBeenCalled();
      for (const handle of removeHandles) {
        expect(handle).toHaveBeenCalled();
      }
    });

    it('sets status to disconnected', async () => {
      await provider.connect();

      const statusUpdates: MidiStatus[] = [];
      provider.onDeviceChange((status) => statusUpdates.push(status));
      provider.disconnect();

      expect(statusUpdates).toContain('disconnected');
    });
  });

  describe('getDevices()', () => {
    it('returns an empty array before connect', () => {
      expect(provider.getDevices()).toEqual([]);
    });

    it('returns devices after connect', async () => {
      const device = { id: 'dev-1', name: 'Piano', type: 'input' as const };
      mockListDevices.mockResolvedValue({ devices: [device] });

      await provider.connect();

      const devices = provider.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0]).toEqual(device);
    });
  });

  describe('onNoteOn()', () => {
    it('notifies callback when noteOn midiEvent is received', async () => {
      await provider.connect();

      const cb = vi.fn();
      provider.onNoteOn(cb);

      listeners.midiEvent!({ type: 'noteOn', note: 60, velocity: 100, timestamp: 1000 });

      expect(cb).toHaveBeenCalledWith({ note: 60, velocity: 100, timestamp: 1000 });
    });

    it('does not notify on noteOff events', async () => {
      await provider.connect();

      const cb = vi.fn();
      provider.onNoteOn(cb);

      listeners.midiEvent!({ type: 'noteOff', note: 60, velocity: 0, timestamp: 1000 });

      expect(cb).not.toHaveBeenCalled();
    });

    it('does not notify on noteOn with velocity 0 (treated as noteOff)', async () => {
      await provider.connect();

      const cb = vi.fn();
      provider.onNoteOn(cb);

      listeners.midiEvent!({ type: 'noteOn', note: 60, velocity: 0, timestamp: 1000 });

      expect(cb).not.toHaveBeenCalled();
    });

    it('returns an unsubscribe function that stops notifications', async () => {
      await provider.connect();

      const cb = vi.fn();
      const unsub = provider.onNoteOn(cb);

      listeners.midiEvent!({ type: 'noteOn', note: 60, velocity: 100, timestamp: 1000 });
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();

      listeners.midiEvent!({ type: 'noteOn', note: 62, velocity: 80, timestamp: 2000 });
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('onNoteOff()', () => {
    it('notifies callback when noteOff midiEvent is received', async () => {
      await provider.connect();

      const cb = vi.fn();
      provider.onNoteOff(cb);

      listeners.midiEvent!({ type: 'noteOff', note: 60, velocity: 0, timestamp: 1000 });

      expect(cb).toHaveBeenCalledWith({ note: 60, timestamp: 1000 });
    });

    it('notifies callback when noteOn with velocity 0 is received', async () => {
      await provider.connect();

      const cb = vi.fn();
      provider.onNoteOff(cb);

      listeners.midiEvent!({ type: 'noteOn', note: 64, velocity: 0, timestamp: 2000 });

      expect(cb).toHaveBeenCalledWith({ note: 64, timestamp: 2000 });
    });

    it('does not notify on noteOn with velocity > 0', async () => {
      await provider.connect();

      const cb = vi.fn();
      provider.onNoteOff(cb);

      listeners.midiEvent!({ type: 'noteOn', note: 60, velocity: 100, timestamp: 1000 });

      expect(cb).not.toHaveBeenCalled();
    });

    it('returns an unsubscribe function that stops notifications', async () => {
      await provider.connect();

      const cb = vi.fn();
      const unsub = provider.onNoteOff(cb);

      listeners.midiEvent!({ type: 'noteOff', note: 60, velocity: 0, timestamp: 1000 });
      expect(cb).toHaveBeenCalledTimes(1);

      unsub();

      listeners.midiEvent!({ type: 'noteOff', note: 62, velocity: 0, timestamp: 2000 });
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe('onDeviceChange()', () => {
    it('returns an unsubscribe function', () => {
      const cb = vi.fn();
      const unsub = provider.onDeviceChange(cb);
      expect(typeof unsub).toBe('function');
    });

    it('notifies when status changes during connect', async () => {
      const cb = vi.fn();
      provider.onDeviceChange(cb);

      await provider.connect();

      // Should have been called with 'connecting' and 'no-device'
      const statuses = cb.mock.calls.map((call: [MidiStatus, unknown[]]) => call[0]);
      expect(statuses).toContain('connecting');
      expect(statuses).toContain('no-device');
    });
  });

  describe('device connected event', () => {
    it('adds the device and auto-listens to it', async () => {
      await provider.connect();
      mockStartListening.mockClear();

      const newDevice = { id: 'dev-2', name: 'Synth', type: 'input' as const };
      listeners.deviceConnected!(newDevice);

      // Should have been called with the newly connected device
      await vi.waitFor(() => {
        expect(mockStartListening).toHaveBeenCalledWith({ deviceId: 'dev-2' });
      });
    });

    it('device appears in getDevices after connection', async () => {
      await provider.connect();

      const newDevice = { id: 'dev-2', name: 'Synth', type: 'input' as const };
      listeners.deviceConnected!(newDevice);

      expect(provider.getDevices()).toContainEqual(newDevice);
    });
  });

  describe('device disconnected event', () => {
    it('removes device from the list', async () => {
      const device = { id: 'dev-1', name: 'Piano', type: 'input' as const };
      mockListDevices.mockResolvedValue({ devices: [device] });

      await provider.connect();

      listeners.deviceDisconnected!(device);

      expect(provider.getDevices()).toEqual([]);
    });

    it('falls back to most recent remaining device when active device disconnects', async () => {
      const deviceA = { id: 'dev-a', name: 'Piano A', type: 'input' as const };
      const deviceB = { id: 'dev-b', name: 'Piano B', type: 'input' as const };
      mockListDevices.mockResolvedValue({ devices: [deviceA, deviceB] });

      await provider.connect();
      // After connect, activeDevice is the most recent (dev-b)
      mockStartListening.mockClear();

      // Disconnect the active device (dev-b)
      listeners.deviceDisconnected!(deviceB);

      await vi.waitFor(() => {
        expect(mockStartListening).toHaveBeenCalledWith({ deviceId: 'dev-a' });
      });
    });

    it('sets status to no-device when last device disconnects', async () => {
      const device = { id: 'dev-1', name: 'Piano', type: 'input' as const };
      mockListDevices.mockResolvedValue({ devices: [device] });

      await provider.connect();

      const statusUpdates: MidiStatus[] = [];
      provider.onDeviceChange((status) => statusUpdates.push(status));

      listeners.deviceDisconnected!(device);

      expect(statusUpdates).toContain('no-device');
    });
  });

  describe('error event', () => {
    it('sets status to error', async () => {
      await provider.connect();

      const statusUpdates: MidiStatus[] = [];
      provider.onDeviceChange((status) => statusUpdates.push(status));

      listeners.error!({ code: 'session-lost', message: 'CoreMIDI session lost' });

      expect(statusUpdates).toContain('error');
    });
  });
});
