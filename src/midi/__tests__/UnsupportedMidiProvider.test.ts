import { describe, it, expect, vi } from 'vitest';
import { UnsupportedMidiProvider } from '../UnsupportedMidiProvider';
import { MidiStatus } from '../types';

describe('UnsupportedMidiProvider', () => {
  it('connect() rejects with appropriate error message', async () => {
    const provider = new UnsupportedMidiProvider();
    await expect(provider.connect()).rejects.toThrow(
      'MIDI is not supported in this environment'
    );
  });

  it('disconnect() is a no-op and does not throw', () => {
    const provider = new UnsupportedMidiProvider();
    expect(() => provider.disconnect()).not.toThrow();
  });

  it('getDevices() returns an empty array', () => {
    const provider = new UnsupportedMidiProvider();
    expect(provider.getDevices()).toEqual([]);
  });

  it('onNoteOn() returns an unsubscribe function', () => {
    const provider = new UnsupportedMidiProvider();
    const cb = vi.fn();
    const unsubscribe = provider.onNoteOn(cb);
    expect(typeof unsubscribe).toBe('function');
    // Callback is never invoked
    expect(cb).not.toHaveBeenCalled();
    // Unsubscribe does not throw
    expect(() => unsubscribe()).not.toThrow();
  });

  it('onNoteOff() returns an unsubscribe function', () => {
    const provider = new UnsupportedMidiProvider();
    const cb = vi.fn();
    const unsubscribe = provider.onNoteOff(cb);
    expect(typeof unsubscribe).toBe('function');
    expect(cb).not.toHaveBeenCalled();
    expect(() => unsubscribe()).not.toThrow();
  });

  it('onDeviceChange() immediately invokes callback with unsupported status and empty devices', () => {
    const provider = new UnsupportedMidiProvider();
    const cb = vi.fn();
    provider.onDeviceChange(cb);

    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith('unsupported' as MidiStatus, []);
  });

  it('onDeviceChange() returns an unsubscribe function that prevents further callbacks', () => {
    const provider = new UnsupportedMidiProvider();
    const cb = vi.fn();
    const unsubscribe = provider.onDeviceChange(cb);

    // Already called once immediately
    expect(cb).toHaveBeenCalledTimes(1);

    // Unsubscribe
    unsubscribe();

    // Register another callback to verify the first is gone
    const cb2 = vi.fn();
    provider.onDeviceChange(cb2);
    expect(cb2).toHaveBeenCalledTimes(1);
    // Original callback should still only have 1 call
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('multiple onDeviceChange() listeners each get immediate notification', () => {
    const provider = new UnsupportedMidiProvider();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    provider.onDeviceChange(cb1);
    provider.onDeviceChange(cb2);

    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb1).toHaveBeenCalledWith('unsupported', []);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledWith('unsupported', []);
  });
});
