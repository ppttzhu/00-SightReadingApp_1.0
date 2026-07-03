import { registerPlugin } from '@capacitor/core';

import type { MidiPlugin } from './definitions';

const Midi = registerPlugin<MidiPlugin>('Midi', {
  web: () => import('./web').then((m) => new m.MidiWeb()),
});

export * from './definitions';
export { Midi };
