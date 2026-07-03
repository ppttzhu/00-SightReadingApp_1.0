import { describe, it, expect } from 'vitest';
import { parseMidiBytes } from '../MidiParser';

describe('MidiParser', () => {
  describe('parseMidiBytes', () => {
    it('returns null for data with fewer than 3 bytes', () => {
      expect(parseMidiBytes([])).toBeNull();
      expect(parseMidiBytes([0x90])).toBeNull();
      expect(parseMidiBytes([0x90, 60])).toBeNull();
    });

    it('parses NoteOn event (status 0x90, velocity > 0)', () => {
      const result = parseMidiBytes([0x90, 60, 100], 1000);
      expect(result).toEqual({
        type: 'noteOn',
        note: 60,
        velocity: 100,
        timestamp: 1000,
      });
    });

    it('parses NoteOn on channel 5 (status 0x95)', () => {
      const result = parseMidiBytes([0x95, 72, 64], 2000);
      expect(result).toEqual({
        type: 'noteOn',
        note: 72,
        velocity: 64,
        timestamp: 2000,
      });
    });

    it('parses NoteOn on channel 15 (status 0x9F)', () => {
      const result = parseMidiBytes([0x9F, 127, 127], 3000);
      expect(result).toEqual({
        type: 'noteOn',
        note: 127,
        velocity: 127,
        timestamp: 3000,
      });
    });

    it('parses explicit NoteOff event (status 0x80)', () => {
      const result = parseMidiBytes([0x80, 60, 64], 1000);
      expect(result).toEqual({
        type: 'noteOff',
        note: 60,
        velocity: 0,
        timestamp: 1000,
      });
    });

    it('parses NoteOff on channel 15 (status 0x8F)', () => {
      const result = parseMidiBytes([0x8F, 48, 100], 5000);
      expect(result).toEqual({
        type: 'noteOff',
        note: 48,
        velocity: 0,
        timestamp: 5000,
      });
    });

    it('parses NoteOn with velocity 0 as NoteOff', () => {
      const result = parseMidiBytes([0x90, 60, 0], 1000);
      expect(result).toEqual({
        type: 'noteOff',
        note: 60,
        velocity: 0,
        timestamp: 1000,
      });
    });

    it('parses NoteOn on channel 7 with velocity 0 as NoteOff', () => {
      const result = parseMidiBytes([0x97, 36, 0], 4000);
      expect(result).toEqual({
        type: 'noteOff',
        note: 36,
        velocity: 0,
        timestamp: 4000,
      });
    });

    it('returns null for non-note status bytes', () => {
      // Control Change (0xB0)
      expect(parseMidiBytes([0xB0, 1, 64], 1000)).toBeNull();
      // Program Change (0xC0) - though only 2 data bytes in practice
      expect(parseMidiBytes([0xC0, 5, 0], 1000)).toBeNull();
      // Pitch Bend (0xE0)
      expect(parseMidiBytes([0xE0, 0, 64], 1000)).toBeNull();
      // System message (0xF0)
      expect(parseMidiBytes([0xF0, 60, 100], 1000)).toBeNull();
    });

    it('uses Date.now() as fallback when no timestamp provided', () => {
      const before = Date.now();
      const result = parseMidiBytes([0x90, 60, 100]);
      const after = Date.now();

      expect(result).not.toBeNull();
      expect(result!.timestamp).toBeGreaterThanOrEqual(before);
      expect(result!.timestamp).toBeLessThanOrEqual(after);
    });

    it('handles boundary note values (0 and 127)', () => {
      const noteZero = parseMidiBytes([0x90, 0, 50], 1000);
      expect(noteZero).toEqual({
        type: 'noteOn',
        note: 0,
        velocity: 50,
        timestamp: 1000,
      });

      const noteMax = parseMidiBytes([0x90, 127, 50], 1000);
      expect(noteMax).toEqual({
        type: 'noteOn',
        note: 127,
        velocity: 50,
        timestamp: 1000,
      });
    });

    it('handles boundary velocity values (1 and 127 for NoteOn)', () => {
      const velOne = parseMidiBytes([0x90, 60, 1], 1000);
      expect(velOne).toEqual({
        type: 'noteOn',
        note: 60,
        velocity: 1,
        timestamp: 1000,
      });

      const velMax = parseMidiBytes([0x90, 60, 127], 1000);
      expect(velMax).toEqual({
        type: 'noteOn',
        note: 60,
        velocity: 127,
        timestamp: 1000,
      });
    });

    it('returns null for out-of-range note or velocity values', () => {
      expect(parseMidiBytes([0x90, 128, 100], 1000)).toBeNull();
      expect(parseMidiBytes([0x90, 60, 128], 1000)).toBeNull();
      expect(parseMidiBytes([0x90, -1, 100], 1000)).toBeNull();
      expect(parseMidiBytes([0x90, 60, -1], 1000)).toBeNull();
    });

    it('ignores extra bytes beyond the first 3', () => {
      const result = parseMidiBytes([0x90, 60, 100, 0xFF, 0xFF], 1000);
      expect(result).toEqual({
        type: 'noteOn',
        note: 60,
        velocity: 100,
        timestamp: 1000,
      });
    });
  });
});
