import { AppLifecycle } from './AppLifecycle';

export { AppLifecycle } from './AppLifecycle';
export type { AppLifecycleOptions, AppLifecycleState } from './AppLifecycle';

/**
 * Initialize the app lifecycle management.
 * Call this from the entry point once the Capacitor shell is ready.
 */
export async function initializeAppLifecycle(): Promise<AppLifecycle> {
  const lifecycle = new AppLifecycle();
  await lifecycle.initialize();
  return lifecycle;
}
