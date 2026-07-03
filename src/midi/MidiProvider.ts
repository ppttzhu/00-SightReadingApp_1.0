import { DeviceDescriptor, NoteOnEvent, NoteOffEvent, MidiStatus } from './types';
import { CapacitorMidiProvider } from './CapacitorMidiProvider';
import { WebMidiProvider } from './WebMidiProvider';
import { UnsupportedMidiProvider } from './UnsupportedMidiProvider';

export interface MidiProviderInterface {
  connect(): Promise<void>;
  disconnect(): void;
  getDevices(): DeviceDescriptor[];
  onNoteOn(callback: (event: NoteOnEvent) => void): () => void;
  onNoteOff(callback: (event: NoteOffEvent) => void): () => void;
  onDeviceChange(callback: (status: MidiStatus, devices: DeviceDescriptor[]) => void): () => void;
}

/**
 * Factory function that detects the runtime environment and returns the
 * appropriate MidiProvider implementation.
 *
 * - Capacitor native shell → CapacitorMidiProvider
 * - Browser with Web MIDI API → WebMidiProvider
 * - Otherwise → UnsupportedMidiProvider
 */
export function createMidiProvider(): MidiProviderInterface {
  if (typeof window !== 'undefined' && (window as any).Capacitor) {
    return new CapacitorMidiProvider();
  }
  if (typeof navigator !== 'undefined' && (navigator as any).requestMIDIAccess) {
    return new WebMidiProvider();
  }
  return new UnsupportedMidiProvider();
}
