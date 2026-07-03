import { MidiEvent } from './definitions';

/**
 * Parse raw MIDI bytes into a typed MidiEvent.
 *
 * Accepts a 3-byte MIDI message and identifies NoteOn/NoteOff events:
 * - Status 0x90–0x9F with velocity > 0 → NoteOn
 * - Status 0x80–0x8F, or 0x90–0x9F with velocity === 0 → NoteOff
 *
 * Returns null if the bytes don't represent a NoteOn or NoteOff event,
 * or if the input is malformed (fewer than 3 bytes).
 *
 * @param data - Raw MIDI bytes as a number array (at least 3 bytes)
 * @param timestamp - Optional timestamp in ms since epoch; defaults to Date.now()
 * @returns A typed MidiEvent or null if not a note event
 */
export function parseMidiBytes(data: number[], timestamp?: number): MidiEvent | null {
  if (data.length < 3) {
    return null;
  }

  const statusByte = data[0];
  const note = data[1];
  const velocity = data[2];

  // Validate note and velocity are in MIDI range
  if (note < 0 || note > 127 || velocity < 0 || velocity > 127) {
    return null;
  }

  const ts = timestamp ?? Date.now();

  // NoteOn: status 0x90–0x9F with velocity > 0
  if (statusByte >= 0x90 && statusByte <= 0x9F && velocity > 0) {
    return {
      type: 'noteOn',
      note,
      velocity,
      timestamp: ts,
    };
  }

  // NoteOff: status 0x80–0x8F (explicit NoteOff)
  // or status 0x90–0x9F with velocity === 0 (NoteOn with zero velocity = NoteOff)
  if (
    (statusByte >= 0x80 && statusByte <= 0x8F) ||
    (statusByte >= 0x90 && statusByte <= 0x9F && velocity === 0)
  ) {
    return {
      type: 'noteOff',
      note,
      velocity: 0,
      timestamp: ts,
    };
  }

  // Not a note event we handle (e.g., Control Change, Program Change, etc.)
  return null;
}
