package com.sightreading.app.plugins.midi

import android.content.Context
import android.content.pm.PackageManager
import android.media.midi.MidiDevice
import android.media.midi.MidiDeviceInfo
import android.media.midi.MidiManager
import android.media.midi.MidiOutputPort
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "Midi")
class MidiPlugin : Plugin() {

    private var midiManager: MidiManager? = null
    private var activeDevice: MidiDevice? = null
    private var activeOutputPort: MidiOutputPort? = null
    private var activeReceiver: MidiEventReceiver? = null
    private var activeDeviceId: String? = null
    private var isStopped: Boolean = false
    private var usbHostSupported: Boolean = true
    private val mainHandler = Handler(Looper.getMainLooper())

    private val deviceCallback = object : MidiManager.DeviceCallback() {
        override fun onDeviceAdded(device: MidiDeviceInfo) {
            val descriptor = deviceInfoToDescriptor(device)
            if (descriptor != null) {
                val data = JSObject().apply {
                    put("id", descriptor.getString("id"))
                    put("name", descriptor.getString("name"))
                    put("type", descriptor.getString("type"))
                }
                notifyListeners("deviceConnected", data)
            }
        }

        override fun onDeviceRemoved(device: MidiDeviceInfo) {
            val descriptor = deviceInfoToDescriptor(device)
            if (descriptor != null) {
                val deviceId = descriptor.getString("id")

                // If the removed device is our active device, clean up
                if (deviceId == activeDeviceId) {
                    cleanupActiveDevice()
                    isStopped = true
                }

                val data = JSObject().apply {
                    put("id", deviceId)
                    put("name", descriptor.getString("name"))
                    put("type", descriptor.getString("type"))
                }
                notifyListeners("deviceDisconnected", data)
            }
        }
    }

    override fun load() {
        super.load()
        initializeMidiManager()
    }

    private fun initializeMidiManager() {
        val context = context ?: return

        // Check USB host mode support
        usbHostSupported = context.packageManager.hasSystemFeature(
            PackageManager.FEATURE_USB_HOST
        )

        val manager = context.getSystemService(Context.MIDI_SERVICE) as? MidiManager
        if (manager == null) {
            isStopped = true
            emitError("midi-init-failed", "Android MIDI service is unavailable")
            return
        }

        midiManager = manager
        manager.registerDeviceCallback(deviceCallback, mainHandler)
    }

    @PluginMethod
    fun listDevices(call: PluginCall) {
        if (!usbHostSupported) {
            val result = JSObject()
            result.put("devices", JSArray())
            call.resolve(result)
            return
        }

        val manager = midiManager
        if (manager == null) {
            call.reject("midi-init-failed", "MIDI service not available")
            return
        }

        val devices = JSArray()
        val deviceInfos = manager.devices

        for (info in deviceInfos) {
            val descriptor = deviceInfoToDescriptor(info)
            if (descriptor != null) {
                devices.put(descriptor)
            }
        }

        val result = JSObject()
        result.put("devices", devices)
        call.resolve(result)
    }

    @PluginMethod
    fun startListening(call: PluginCall) {
        val deviceId = call.getString("deviceId")
        if (deviceId.isNullOrEmpty()) {
            call.reject("device-not-found", "No device ID provided")
            return
        }

        if (!usbHostSupported) {
            call.reject("usb-not-supported", "This device does not support USB host mode")
            return
        }

        val manager = midiManager
        if (manager == null) {
            call.reject("midi-init-failed", "MIDI service not available")
            return
        }

        // Find the target device info
        val targetDeviceInfo = findDeviceById(deviceId)
        if (targetDeviceInfo == null) {
            call.reject("device-not-found", "Device with ID '$deviceId' not found")
            return
        }

        // Single-device invariant: stop previous before starting new
        cleanupActiveDevice()
        isStopped = false

        // Open the device
        manager.openDevice(targetDeviceInfo, { device ->
            if (device == null) {
                mainHandler.post {
                    emitError("port-open-failed", "Failed to open MIDI device '$deviceId'")
                    isStopped = true
                    call.reject("port-open-failed", "Failed to open MIDI device")
                }
                return@openDevice
            }

            // Open the device's output port (device output = our input)
            val portInfo = targetDeviceInfo.ports.firstOrNull { port ->
                port.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT
            }

            if (portInfo == null) {
                device.close()
                mainHandler.post {
                    emitError("port-open-failed", "No output port found on device '$deviceId'")
                    isStopped = true
                    call.reject("port-open-failed", "No output port found on device")
                }
                return@openDevice
            }

            val outputPort = device.openOutputPort(portInfo.portNumber)
            if (outputPort == null) {
                device.close()
                mainHandler.post {
                    emitError("port-open-failed", "Cannot open output port on device '$deviceId'")
                    isStopped = true
                    call.reject("port-open-failed", "Cannot open output port on device")
                }
                return@openDevice
            }

            // Create and connect our MIDI receiver
            val receiver = MidiEventReceiver { event ->
                if (!isStopped) {
                    mainHandler.post {
                        notifyListeners("midiEvent", event)
                    }
                }
            }

            outputPort.connect(receiver)

            // Store active references
            activeDevice = device
            activeOutputPort = outputPort
            activeReceiver = receiver
            activeDeviceId = deviceId

            mainHandler.post {
                call.resolve()
            }
        }, mainHandler)
    }

    @PluginMethod
    fun stopListening(call: PluginCall) {
        cleanupActiveDevice()
        call.resolve()
    }

    private fun cleanupActiveDevice() {
        try {
            activeReceiver?.let { receiver ->
                activeOutputPort?.disconnect(receiver)
            }
            activeOutputPort?.close()
            activeDevice?.close()
        } catch (e: Exception) {
            // Best-effort cleanup; ignore errors during teardown
        } finally {
            activeReceiver = null
            activeOutputPort = null
            activeDevice = null
            activeDeviceId = null
        }
    }

    private fun findDeviceById(deviceId: String): MidiDeviceInfo? {
        val manager = midiManager ?: return null
        return manager.devices.firstOrNull { info ->
            getDeviceId(info) == deviceId
        }
    }

    private fun deviceInfoToDescriptor(info: MidiDeviceInfo): JSObject? {
        // Only expose devices that have output ports (devices that send MIDI data to us)
        val hasOutputPort = info.ports.any { port ->
            port.type == MidiDeviceInfo.PortInfo.TYPE_OUTPUT
        }
        if (!hasOutputPort) return null

        val properties = info.properties
        val name = properties.getString(MidiDeviceInfo.PROPERTY_NAME)
            ?: properties.getString(MidiDeviceInfo.PROPERTY_PRODUCT)
            ?: "Unknown MIDI Device"

        val id = getDeviceId(info)

        return JSObject().apply {
            put("id", id)
            put("name", name)
            put("type", "input") // These are input devices from the app's perspective
        }
    }

    private fun getDeviceId(info: MidiDeviceInfo): String {
        return "${info.id}"
    }

    private fun emitError(code: String, message: String) {
        val data = JSObject().apply {
            put("code", code)
            put("message", message)
        }
        notifyListeners("error", data)
    }

    override fun handleOnDestroy() {
        cleanupActiveDevice()
        midiManager?.unregisterDeviceCallback(deviceCallback)
        midiManager = null
        super.handleOnDestroy()
    }
}
