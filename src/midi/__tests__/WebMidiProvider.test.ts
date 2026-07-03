/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { WebMidiProvider } from '../WebMidiProvider';
import { MidiStatus } from '../types';

// --- Mock helpers to simulate the Web MIDI API ---

interface MockMIDIInput {
  id: string;
  name: string | null;
  type: 'input';
  state: 'connected' | 'disconnected';
  onmidimessage: ((event: any) => void) | null;
}

function createMockInput(id: string, name: string, state: 'connected' | 'disconnected' = 'connected'): MockMIDIInput {
  return { id, name, type: 'input', state, onmidimessage: null };
}

function createMockMIDIAccess(inputs: MockMIDIInput[] = []) {
  const inputsMap = {
    forEach: (cb: (value: MockMIDIInput, key: string) => void) => {
      inputs.forEach((input) => cb(input, input.id));
    },
  };

  return {
    inputs: inputsMap,
    onstatechange: null as ((event: any) => void) | null,
  };
}

function setupNavigatorMIDI(mockAccess: ReturnType<typeof createMockMIDIAccess>) {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: vi.fn().mockResolvedValue(mockAccess),
    writable: true,
    configurable: true,
  });
}

function setupNavigatorMIDIRejection(error: Error) {
  Object.defineProperty(navigator, 'requestMIDIAccess', {
    value: vi.fn().mockRejectedValue(error),
    writable: true,
    configurable: true,
  });
}

describe('WebMidiProvider', () => {
  let provider: WebMidiProvider;

  beforeEach(() => {
    provider = new WebMidiProvider();
  });

  describe('connect()', () => {
    it('should resolve and set status to connected when a device is available', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const deviceChanges: { status: MidiStatus }[] = [];
      provider.onDeviceChange((status, devices) => {
        deviceChanges.push({ status });
      });

      await provider.connect();

      expect(deviceChanges.length).toBeGreaterThan(0);
      const lastChange = deviceChanges[deviceChanges.length - 1];
      expect(lastChange.status).toBe('connected');
    });

    it('should set status to no-device when no inputs are available', async () => {
      const mockAccess = createMockMIDIAccess([]);
      setupNavigatorMIDI(mockAccess);

      const deviceChanges: { status: MidiStatus }[] = [];
      provider.onDeviceChange((status) => {
        deviceChanges.push({ status });
      });

      await provider.connect();

      const lastChange = deviceChanges[deviceChanges.length - 1];
      expect(lastChange.status).toBe('no-device');
    });

    it('should reject and set status to error on permission denial', async () => {
      setupNavigatorMIDIRejection(new Error('Permission denied'));

      const deviceChanges: { status: MidiStatus }[] = [];
      provider.onDeviceChange((status) => {
        deviceChanges.push({ status });
      });

      await expect(provider.connect()).rejects.toThrow('MIDI access denied');

      const lastChange = deviceChanges[deviceChanges.length - 1];
      expect(lastChange.status).toBe('error');
    });

    it('should attach onmidimessage handler to the most recent input', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      await provider.connect();

      expect(input.onmidimessage).not.toBeNull();
    });

    it('should register onstatechange handler on MIDI access', async () => {
      const mockAccess = createMockMIDIAccess([]);
      setupNavigatorMIDI(mockAccess);

      await provider.connect();

      expect(mockAccess.onstatechange).not.toBeNull();
    });
  });

  describe('disconnect()', () => {
    it('should remove all message handlers and clear state', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      await provider.connect();
      expect(input.onmidimessage).not.toBeNull();

      provider.disconnect();

      expect(input.onmidimessage).toBeNull();
      expect(mockAccess.onstatechange).toBeNull();
      expect(provider.getDevices()).toHaveLength(0);
    });
  });

  describe('getDevices()', () => {
    it('should return empty array before connect', () => {
      expect(provider.getDevices()).toEqual([]);
    });

    it('should return connected devices after connect', async () => {
      const input1 = createMockInput('input-1', 'Piano');
      const input2 = createMockInput('input-2', 'Keyboard');
      const mockAccess = createMockMIDIAccess([input1, input2]);
      setupNavigatorMIDI(mockAccess);

      await provider.connect();

      const devices = provider.getDevices();
      expect(devices).toHaveLength(2);
      expect(devices[0].id).toBe('input-1');
      expect(devices[0].name).toBe('Piano');
      expect(devices[1].id).toBe('input-2');
      expect(devices[1].name).toBe('Keyboard');
    });
  });

  describe('MIDI message handling', () => {
    it('should notify noteOn listeners when a NoteOn message is received', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const noteOns: any[] = [];
      provider.onNoteOn((event) => noteOns.push(event));

      await provider.connect();

      // Simulate a NoteOn message: status 0x90, note 60, velocity 100
      const midiMessage = { data: new Uint8Array([0x90, 60, 100]), timeStamp: 1000 };
      input.onmidimessage!(midiMessage);

      expect(noteOns).toHaveLength(1);
      expect(noteOns[0].note).toBe(60);
      expect(noteOns[0].velocity).toBe(100);
      expect(noteOns[0].timestamp).toBe(1000);
    });

    it('should notify noteOff listeners when a NoteOff message is received', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const noteOffs: any[] = [];
      provider.onNoteOff((event) => noteOffs.push(event));

      await provider.connect();

      // Simulate a NoteOff message: status 0x80, note 60, velocity 0
      const midiMessage = { data: new Uint8Array([0x80, 60, 0]), timeStamp: 2000 };
      input.onmidimessage!(midiMessage);

      expect(noteOffs).toHaveLength(1);
      expect(noteOffs[0].note).toBe(60);
      expect(noteOffs[0].timestamp).toBe(2000);
    });

    it('should treat NoteOn with velocity 0 as NoteOff', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const noteOffs: any[] = [];
      provider.onNoteOff((event) => noteOffs.push(event));

      await provider.connect();

      // NoteOn with velocity 0 = NoteOff
      const midiMessage = { data: new Uint8Array([0x90, 64, 0]), timeStamp: 3000 };
      input.onmidimessage!(midiMessage);

      expect(noteOffs).toHaveLength(1);
      expect(noteOffs[0].note).toBe(64);
    });

    it('should ignore non-note MIDI messages', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const noteOns: any[] = [];
      const noteOffs: any[] = [];
      provider.onNoteOn((event) => noteOns.push(event));
      provider.onNoteOff((event) => noteOffs.push(event));

      await provider.connect();

      // Control Change message: 0xB0, controller 1, value 64
      const midiMessage = { data: new Uint8Array([0xB0, 1, 64]), timeStamp: 4000 };
      input.onmidimessage!(midiMessage);

      expect(noteOns).toHaveLength(0);
      expect(noteOffs).toHaveLength(0);
    });

    it('should handle null data gracefully', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const noteOns: any[] = [];
      provider.onNoteOn((event) => noteOns.push(event));

      await provider.connect();

      // Simulate message with null data
      const midiMessage = { data: null, timeStamp: 5000 };
      input.onmidimessage!(midiMessage);

      expect(noteOns).toHaveLength(0);
    });
  });

  describe('listener removal', () => {
    it('should stop delivering noteOn events after removal', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const noteOns: any[] = [];
      const remove = provider.onNoteOn((event) => noteOns.push(event));

      await provider.connect();

      const msg = { data: new Uint8Array([0x90, 60, 100]), timeStamp: 1000 };
      input.onmidimessage!(msg);
      expect(noteOns).toHaveLength(1);

      remove();

      input.onmidimessage!(msg);
      expect(noteOns).toHaveLength(1); // no new events
    });
  });

  describe('hot-plug (statechange)', () => {
    it('should add a new device and auto-listen on connect', async () => {
      const mockAccess = createMockMIDIAccess([]);
      setupNavigatorMIDI(mockAccess);

      const deviceChanges: { status: MidiStatus; devices: any[] }[] = [];
      provider.onDeviceChange((status, devices) => {
        deviceChanges.push({ status, devices });
      });

      await provider.connect();
      expect(provider.getDevices()).toHaveLength(0);

      // Simulate a new device connecting via statechange
      const newInput = createMockInput('input-new', 'New Piano');
      // Add it to the inputs map for future lookups
      const originalForEach = mockAccess.inputs.forEach;
      mockAccess.inputs.forEach = (cb: any) => {
        originalForEach(cb);
        cb(newInput, newInput.id);
      };

      mockAccess.onstatechange!({
        port: { id: 'input-new', name: 'New Piano', type: 'input', state: 'connected' },
      });

      expect(provider.getDevices()).toHaveLength(1);
      expect(provider.getDevices()[0].name).toBe('New Piano');

      // Status should be connected
      const lastChange = deviceChanges[deviceChanges.length - 1];
      expect(lastChange.status).toBe('connected');

      // Auto-listen should attach handler to new device
      expect(newInput.onmidimessage).not.toBeNull();
    });

    it('should remove device and fallback on disconnect', async () => {
      const input1 = createMockInput('input-1', 'Piano');
      const input2 = createMockInput('input-2', 'Keyboard');
      const mockAccess = createMockMIDIAccess([input1, input2]);
      setupNavigatorMIDI(mockAccess);

      await provider.connect();
      expect(provider.getDevices()).toHaveLength(2);

      // The most recent device (input-2) should be the active one
      expect(input2.onmidimessage).not.toBeNull();

      // Simulate disconnecting the active device (input-2)
      mockAccess.onstatechange!({
        port: { id: 'input-2', name: 'Keyboard', type: 'input', state: 'disconnected' },
      });

      expect(provider.getDevices()).toHaveLength(1);
      expect(provider.getDevices()[0].id).toBe('input-1');

      // Should have fallen back to input-1
      expect(input1.onmidimessage).not.toBeNull();
    });

    it('should set status to no-device when last device disconnects', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      const deviceChanges: { status: MidiStatus }[] = [];
      provider.onDeviceChange((status) => {
        deviceChanges.push({ status });
      });

      await provider.connect();

      mockAccess.onstatechange!({
        port: { id: 'input-1', name: 'Piano', type: 'input', state: 'disconnected' },
      });

      const lastChange = deviceChanges[deviceChanges.length - 1];
      expect(lastChange.status).toBe('no-device');
    });

    it('should ignore statechange events for output ports', async () => {
      const input = createMockInput('input-1', 'Piano');
      const mockAccess = createMockMIDIAccess([input]);
      setupNavigatorMIDI(mockAccess);

      await provider.connect();
      const deviceCountBefore = provider.getDevices().length;

      mockAccess.onstatechange!({
        port: { id: 'output-1', name: 'Speaker', type: 'output', state: 'connected' },
      });

      expect(provider.getDevices().length).toBe(deviceCountBefore);
    });
  });
});
