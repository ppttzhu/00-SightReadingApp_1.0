import CoreMIDI

/// Utility for parsing legacy MIDIPacketList (MIDI 1.0 byte streams).
/// Used as a fallback for older CoreMIDI APIs that don't support MIDIEventList.
///
/// The primary plugin uses MIDIInputPortCreateWithProtocol with ._1_0 protocol,
/// which delivers events via MIDIEventList (UMP format). This parser handles
/// the legacy MIDIPacketList format for compatibility if needed.
struct MidiPacketParser {

    /// Parsed MIDI event result
    struct ParsedEvent {
        let type: String      // "noteOn" or "noteOff"
        let note: Int         // 0-127
        let velocity: Int     // 0-127
        let timestamp: UInt64 // MIDITimeStamp (host time)
    }

    /// Parse a MIDIPacketList and extract NoteOn/NoteOff events.
    ///
    /// - Parameter packetList: The raw MIDIPacketList from CoreMIDI
    /// - Returns: Array of parsed NoteOn and NoteOff events
    static func parse(packetList: UnsafePointer<MIDIPacketList>) -> [ParsedEvent] {
        var events: [ParsedEvent] = []
        let list = packetList.pointee
        var packet = list.packet

        for _ in 0..<list.numPackets {
            let bytes = Mirror(reflecting: packet.data).children.map { $0.value as! UInt8 }
            let length = Int(packet.length)
            let timestamp = packet.timeStamp

            var offset = 0
            while offset < length {
                let statusByte = bytes[offset]

                // Check if this is a status byte (high bit set)
                guard statusByte & 0x80 != 0 else {
                    offset += 1
                    continue
                }

                let statusNibble = statusByte & 0xF0

                switch statusNibble {
                case 0x90: // NoteOn
                    guard offset + 2 < length else { break }
                    let note = Int(bytes[offset + 1] & 0x7F)
                    let velocity = Int(bytes[offset + 2] & 0x7F)

                    if velocity > 0 {
                        events.append(ParsedEvent(
                            type: "noteOn",
                            note: note,
                            velocity: velocity,
                            timestamp: timestamp
                        ))
                    } else {
                        // NoteOn with velocity 0 = NoteOff
                        events.append(ParsedEvent(
                            type: "noteOff",
                            note: note,
                            velocity: 0,
                            timestamp: timestamp
                        ))
                    }
                    offset += 3

                case 0x80: // NoteOff
                    guard offset + 2 < length else { break }
                    let note = Int(bytes[offset + 1] & 0x7F)

                    events.append(ParsedEvent(
                        type: "noteOff",
                        note: note,
                        velocity: 0,
                        timestamp: timestamp
                    ))
                    offset += 3

                case 0xA0, 0xB0, 0xE0: // Aftertouch, CC, Pitch Bend (3 bytes)
                    offset += 3

                case 0xC0, 0xD0: // Program Change, Channel Pressure (2 bytes)
                    offset += 2

                case 0xF0: // System messages
                    if statusByte == 0xF0 {
                        // SysEx: skip until 0xF7
                        while offset < length && bytes[offset] != 0xF7 {
                            offset += 1
                        }
                        offset += 1
                    } else if statusByte >= 0xF1 && statusByte <= 0xF3 {
                        offset += 2
                    } else {
                        offset += 1
                    }

                default:
                    offset += 1
                }
            }

            packet = MIDIPacketNext(&packet).pointee
        }

        return events
    }
}
