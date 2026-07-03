import Capacitor
import CoreMIDI
import CoreBluetooth

@objc(MidiPlugin)
public class MidiPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MidiPlugin"
    public let jsName = "Midi"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listDevices", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startListening", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopListening", returnType: CAPPluginReturnPromise)
    ]

    // MARK: - CoreMIDI State

    private var midiClient: MIDIClientRef = 0
    private var inputPort: MIDIPortRef = 0
    private var activeEndpoint: MIDIEndpointRef = 0
    private var isListening = false
    private var isStopped = false
    private var clientInitialized = false

    // MARK: - Lifecycle

    override public func load() {
        super.load()
        initializeMIDIClient()
    }

    // MARK: - CoreMIDI Client Initialization

    private func initializeMIDIClient() {
        let status = MIDIClientCreateWithBlock("com.sightreading.app.midi" as CFString, &midiClient) { [weak self] notification in
            self?.handleMIDINotification(notification)
        }

        if status != noErr {
            clientInitialized = false
            isStopped = true
            DispatchQueue.main.async { [weak self] in
                self?.notifyListeners("error", data: [
                    "code": "midi-init-failed",
                    "message": "CoreMIDI client creation failed with status: \(status)"
                ])
            }
            return
        }

        clientInitialized = true
        isStopped = false
    }

    // MARK: - MIDI Notification Handler

    private func handleMIDINotification(_ notification: UnsafePointer<MIDINotification>) {
        let messageID = notification.pointee.messageID

        switch messageID {
        case .msgObjectAdded:
            // A MIDI object (device/endpoint) was added
            notification.withMemoryRebound(to: MIDIObjectAddRemoveNotification.self, capacity: 1) { addNotification in
                let child = addNotification.pointee.child
                let childType = addNotification.pointee.childType

                // Only notify for source endpoints (input devices)
                if childType == .source {
                    let descriptor = buildDeviceDescriptor(for: child)
                    DispatchQueue.main.async { [weak self] in
                        self?.notifyListeners("deviceConnected", data: descriptor)
                    }
                }
            }

        case .msgObjectRemoved:
            // A MIDI object (device/endpoint) was removed
            notification.withMemoryRebound(to: MIDIObjectAddRemoveNotification.self, capacity: 1) { removeNotification in
                let child = removeNotification.pointee.child
                let childType = removeNotification.pointee.childType

                if childType == .source {
                    let descriptor = buildDeviceDescriptor(for: child)

                    // If the removed endpoint is the one we're listening to, stop listening
                    if child == self.activeEndpoint {
                        self.disconnectFromEndpoint()
                    }

                    DispatchQueue.main.async { [weak self] in
                        self?.notifyListeners("deviceDisconnected", data: descriptor)
                    }
                }
            }

        case .msgSetupChanged:
            // General setup change — could indicate session invalidation
            break

        case .msgIOError:
            // I/O error on the session
            handleSessionLost()

        default:
            break
        }
    }

    // MARK: - Plugin Methods

    @objc func listDevices(_ call: CAPPluginCall) {
        guard clientInitialized else {
            call.resolve(["devices": []])
            return
        }

        var devices: [[String: Any]] = []
        let sourceCount = MIDIGetNumberOfSources()

        for i in 0..<sourceCount {
            let endpoint = MIDIGetSource(i)
            let descriptor = buildDeviceDescriptor(for: endpoint)
            devices.append(descriptor)
        }

        call.resolve(["devices": devices])
    }

    @objc func startListening(_ call: CAPPluginCall) {
        guard let deviceId = call.getString("deviceId") else {
            call.reject("Missing deviceId parameter", "device-not-found")
            return
        }

        // Check Bluetooth permission if needed
        if #available(iOS 13.1, *) {
            let btAuth = CBCentralManager.authorization
            if btAuth == .denied || btAuth == .restricted {
                call.reject("Bluetooth permission denied", "permission-denied")
                return
            }
        }

        guard clientInitialized else {
            call.reject("MIDI client not initialized", "midi-init-failed")
            return
        }

        // Find the endpoint matching the device ID
        guard let endpoint = findEndpoint(byId: deviceId) else {
            call.reject("Device not found: \(deviceId)", "device-not-found")
            return
        }

        // Single-device invariant: stop previous listener before starting new one
        if isListening {
            disconnectFromEndpoint()
        }

        // Reset stopped state when starting a new listening session
        isStopped = false

        // Create input port if needed
        if inputPort == 0 {
            let portStatus = MIDIInputPortCreateWithProtocol(
                midiClient,
                "com.sightreading.app.input" as CFString,
                ._1_0,
                &inputPort
            ) { [weak self] eventList, srcConnRefCon in
                self?.handleMIDIEventList(eventList)
            }

            if portStatus != noErr {
                isStopped = true
                DispatchQueue.main.async { [weak self] in
                    self?.notifyListeners("error", data: [
                        "code": "port-open-failed",
                        "message": "Failed to create MIDI input port with status: \(portStatus)"
                    ])
                }
                call.reject("Failed to open MIDI port", "port-open-failed")
                return
            }
        }

        // Connect port to source endpoint
        let connectStatus = MIDIPortConnectSource(inputPort, endpoint, nil)
        if connectStatus != noErr {
            isStopped = true
            DispatchQueue.main.async { [weak self] in
                self?.notifyListeners("error", data: [
                    "code": "port-open-failed",
                    "message": "Failed to connect to MIDI source with status: \(connectStatus)"
                ])
            }
            call.reject("Failed to connect to MIDI source", "port-open-failed")
            return
        }

        activeEndpoint = endpoint
        isListening = true
        call.resolve()
    }

    @objc func stopListening(_ call: CAPPluginCall) {
        disconnectFromEndpoint()
        call.resolve()
    }

    // MARK: - MIDI Event Parsing (MIDIEventList — protocol 1.0)

    private func handleMIDIEventList(_ eventList: UnsafePointer<MIDIEventList>) {
        guard !isStopped else { return }

        let list = eventList.pointee
        var packet = list.packet

        for _ in 0..<list.numPackets {
            let wordCount = Int(packet.wordCount)
            if wordCount >= 1 {
                // MIDI 1.0 Channel Voice messages in Universal MIDI Packet format
                // For MIDI 1.0 protocol, words are 32-bit UMP packets
                withUnsafePointer(to: &packet.words) { wordsPtr in
                    wordsPtr.withMemoryRebound(to: UInt32.self, capacity: wordCount) { words in
                        for i in 0..<wordCount {
                            let word = words[i]
                            parseMIDI1_0UMPWord(word, timestamp: packet.timeStamp)
                        }
                    }
                }
            }
            packet = MIDIEventPacketNext(&packet).pointee
        }
    }

    private func parseMIDI1_0UMPWord(_ word: UInt32, timestamp: MIDITimeStamp) {
        // UMP format for MIDI 1.0 Channel Voice: [messageType(4) group(4) status(4) channel(4) data1(8) data2(8)]
        let messageType = (word >> 28) & 0x0F

        // Message type 0x2 = MIDI 1.0 Channel Voice Message
        guard messageType == 0x02 else { return }

        let statusNibble = (word >> 16) & 0xF0
        let data1 = Int((word >> 8) & 0x7F)  // note
        let data2 = Int(word & 0x7F)          // velocity

        let timestampMs = midiTimeStampToMilliseconds(timestamp)

        switch statusNibble {
        case 0x90: // NoteOn
            if data2 > 0 {
                emitMidiEvent(type: "noteOn", note: data1, velocity: data2, timestamp: timestampMs)
            } else {
                // NoteOn with velocity 0 is treated as NoteOff
                emitMidiEvent(type: "noteOff", note: data1, velocity: 0, timestamp: timestampMs)
            }
        case 0x80: // NoteOff
            emitMidiEvent(type: "noteOff", note: data1, velocity: 0, timestamp: timestampMs)
        default:
            break
        }
    }

    // MARK: - Event Emission

    private func emitMidiEvent(type: String, note: Int, velocity: Int, timestamp: Double) {
        guard !isStopped else { return }

        let data: [String: Any] = [
            "type": type,
            "note": note,
            "velocity": velocity,
            "timestamp": timestamp
        ]

        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("midiEvent", data: data)
        }
    }

    // MARK: - Error Handling

    private func handleSessionLost() {
        isStopped = true
        isListening = false
        activeEndpoint = 0

        DispatchQueue.main.async { [weak self] in
            self?.notifyListeners("error", data: [
                "code": "session-lost",
                "message": "CoreMIDI session was invalidated"
            ])
        }
    }

    // MARK: - Helpers

    private func disconnectFromEndpoint() {
        if inputPort != 0 && activeEndpoint != 0 {
            MIDIPortDisconnectSource(inputPort, activeEndpoint)
        }
        activeEndpoint = 0
        isListening = false
    }

    private func findEndpoint(byId deviceId: String) -> MIDIEndpointRef? {
        let sourceCount = MIDIGetNumberOfSources()
        for i in 0..<sourceCount {
            let endpoint = MIDIGetSource(i)
            let endpointId = String(MIDIObjectRef(endpoint))
            if endpointId == deviceId {
                return endpoint
            }
        }
        return nil
    }

    private func buildDeviceDescriptor(for endpoint: MIDIObjectRef) -> [String: Any] {
        var name: Unmanaged<CFString>?
        MIDIObjectGetStringProperty(endpoint, kMIDIPropertyName, &name)
        let deviceName = (name?.takeRetainedValue() as String?) ?? "Unknown MIDI Device"

        let id = String(MIDIObjectRef(endpoint))

        return [
            "id": id,
            "name": deviceName,
            "type": "input"
        ]
    }

    private func midiTimeStampToMilliseconds(_ timestamp: MIDITimeStamp) -> Double {
        // Use current time in milliseconds since epoch for consistency with JS timestamps
        // CoreMIDI timestamps are host-time based (mach_absolute_time), so we convert to wall clock
        if timestamp == 0 {
            return Date().timeIntervalSince1970 * 1000.0
        }

        var timebaseInfo = mach_timebase_info_data_t()
        mach_timebase_info(&timebaseInfo)

        let nanoseconds = timestamp * UInt64(timebaseInfo.numer) / UInt64(timebaseInfo.denom)
        let currentHostTime = mach_absolute_time()
        let currentNanoseconds = currentHostTime * UInt64(timebaseInfo.numer) / UInt64(timebaseInfo.denom)

        // Calculate the wall-clock time of the MIDI event
        let nowMs = Date().timeIntervalSince1970 * 1000.0
        let diffNs = Int64(currentNanoseconds) - Int64(nanoseconds)
        let diffMs = Double(diffNs) / 1_000_000.0

        return nowMs - diffMs
    }
}
