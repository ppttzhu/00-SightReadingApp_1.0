export type MidiStatus = 'disconnected' | 'connecting' | 'connected' | 'no-device' | 'unsupported' | 'error';

export interface NoteOnEvent {
  note: number;      // 0-127
  velocity: number;  // 1-127
  timestamp: number; // ms
}

export interface NoteOffEvent {
  note: number;      // 0-127
  timestamp: number; // ms
}

// Re-export DeviceDescriptor from plugin definitions for convenience
export type { DeviceDescriptor } from '../plugins/midi/definitions';
