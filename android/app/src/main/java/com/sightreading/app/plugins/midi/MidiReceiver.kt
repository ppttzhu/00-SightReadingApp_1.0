package com.sightreading.app.plugins.midi

import android.media.midi.MidiReceiver
import com.getcapacitor.JSObject

/**
 * Custom MidiReceiver that parses incoming MIDI bytes for NoteOn and NoteOff messages,
 * then forwards parsed events via a callback.
 *
 * MIDI message format:
 * - NoteOn:  status byte 0x90-0x9F, note byte 0-127, velocity byte 1-127
 * - NoteOff: status byte 0x80-0x8F, note byte 0-127, velocity byte 0-127
 * - NoteOff (alternate): status byte 0x90-0x9F, note byte 0-127, velocity byte 0
 */
class MidiEventReceiver(
    private val onEvent: (JSObject) -> Unit
) : MidiReceiver() {

    companion object {
        private const val STATUS_NOTE_OFF: Int = 0x80
        private const val STATUS_NOTE_ON: Int = 0x90
        private const val STATUS_MASK: Int = 0xF0
    }

    override fun onSend(data: ByteArray, offset: Int, count: Int, timestamp: Long) {
        var i = offset
        val end = offset + count

        while (i < end) {
            val statusByte = data[i].toInt() and 0xFF

            // Only process Note On and Note Off status bytes
            val maskedStatus = statusByte and STATUS_MASK

            if (maskedStatus == STATUS_NOTE_ON || maskedStatus == STATUS_NOTE_OFF) {
                // Need at least 3 bytes for a complete note message
                if (i + 2 >= end) break

                val note = data[i + 1].toInt() and 0x7F
                val velocity = data[i + 2].toInt() and 0x7F
                val eventTimestamp = if (timestamp == 0L) {
                    System.currentTimeMillis()
                } else {
                    // Convert nanosecond MIDI timestamp to milliseconds
                    timestamp / 1_000_000
                }

                val event = JSObject()

                if (maskedStatus == STATUS_NOTE_ON && velocity > 0) {
                    // NoteOn with velocity > 0
                    event.put("type", "noteOn")
                    event.put("note", note)
                    event.put("velocity", velocity)
                    event.put("timestamp", eventTimestamp)
                    onEvent(event)
                } else {
                    // NoteOff (0x80) or NoteOn with velocity 0
                    event.put("type", "noteOff")
                    event.put("note", note)
                    event.put("velocity", 0)
                    event.put("timestamp", eventTimestamp)
                    onEvent(event)
                }

                i += 3 // Move past the 3-byte message
            } else if (statusByte and 0x80 != 0) {
                // Other status byte - skip based on message length
                i += getMidiMessageLength(statusByte)
            } else {
                // Data byte without a preceding status - skip
                i++
            }
        }
    }

    /**
     * Returns the expected byte length of a MIDI message given its status byte.
     * This handles standard channel voice messages and system messages.
     */
    private fun getMidiMessageLength(statusByte: Int): Int {
        return when (statusByte and STATUS_MASK) {
            0x80, 0x90, 0xA0, 0xB0, 0xE0 -> 3 // Note Off, Note On, Poly Aftertouch, CC, Pitch Bend
            0xC0, 0xD0 -> 2 // Program Change, Channel Aftertouch
            0xF0 -> when (statusByte) {
                0xF0 -> 1 // SysEx start - variable length, skip byte by byte
                0xF1, 0xF3 -> 2 // MTC Quarter Frame, Song Select
                0xF2 -> 3 // Song Position Pointer
                else -> 1 // System Real-Time messages (single byte)
            }
            else -> 1
        }
    }
}
