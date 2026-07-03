package com.sightreading.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.sightreading.app.plugins.midi.MidiPlugin;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MidiPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
