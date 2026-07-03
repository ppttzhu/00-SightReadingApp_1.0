#import <Capacitor/Capacitor.h>

CAP_PLUGIN(MidiPlugin, "Midi",
    CAP_PLUGIN_METHOD(listDevices, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(startListening, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stopListening, CAPPluginReturnPromise);
)
