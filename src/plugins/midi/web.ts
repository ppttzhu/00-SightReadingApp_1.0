import { WebPlugin } from '@capacitor/core';

import type { MidiPlugin, DeviceDescriptor } from './definitions';

export class MidiWeb extends WebPlugin implements MidiPlugin {
  async listDevices(): Promise<{ devices: DeviceDescriptor[] }> {
    return { devices: [] };
  }

  async startListening(_options: { deviceId: string }): Promise<void> {
    // No-op on web — MidiProvider handles web MIDI directly
  }

  async stopListening(): Promise<void> {
    // No-op on web
  }
}
