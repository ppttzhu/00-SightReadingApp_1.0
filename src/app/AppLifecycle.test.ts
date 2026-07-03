/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppLifecycle } from './AppLifecycle';

// Mock @capacitor/splash-screen
vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: {
    hide: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock @capacitor/network
const mockNetworkListenerRemove = vi.fn().mockResolvedValue(undefined);
let networkStatusCallback: ((status: { connected: boolean; connectionType: string }) => void) | null = null;

vi.mock('@capacitor/network', () => ({
  Network: {
    addListener: vi.fn().mockImplementation((_event: string, callback: any) => {
      networkStatusCallback = callback;
      return Promise.resolve({ remove: mockNetworkListenerRemove });
    }),
  },
}));

describe('AppLifecycle', () => {
  let lifecycle: AppLifecycle;

  beforeEach(() => {
    vi.useFakeTimers();
    networkStatusCallback = null;
    // Reset DOM
    document.body.innerHTML = '';
  });

  afterEach(async () => {
    if (lifecycle) {
      await lifecycle.destroy();
    }
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe('Splash Screen', () => {
    it('should dismiss splash screen when page loads', async () => {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      lifecycle = new AppLifecycle();

      lifecycle.onPageLoaded();

      expect(SplashScreen.hide).toHaveBeenCalledOnce();
      expect(lifecycle.getState().splashDismissed).toBe(true);
      expect(lifecycle.getState().pageLoaded).toBe(true);
    });

    it('should not dismiss splash screen twice', async () => {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      lifecycle = new AppLifecycle();

      lifecycle.onPageLoaded();
      lifecycle.onPageLoaded();

      expect(SplashScreen.hide).toHaveBeenCalledOnce();
    });

    it('should show error overlay after 10-second timeout if page has not loaded', async () => {
      lifecycle = new AppLifecycle({ splashTimeoutMs: 10_000 });

      // Directly test the timeout mechanism without calling initialize()
      // (initialize also sets up page-load listener which fires immediately in test env)
      // Access the private method via type assertion to start only the timeout
      (lifecycle as any).startSplashTimeout();

      expect(lifecycle.getState().errorOverlayVisible).toBe(false);

      // Fast-forward past the timeout
      vi.advanceTimersByTime(10_000);

      expect(lifecycle.getState().splashDismissed).toBe(true);
      expect(lifecycle.getState().errorOverlayVisible).toBe(true);

      // Verify error overlay is in the DOM
      const overlay = document.getElementById('app-error-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay!.textContent).toContain('Content failed to load');
    });

    it('should not show error if page loads before timeout', async () => {
      lifecycle = new AppLifecycle({ splashTimeoutMs: 10_000 });
      (lifecycle as any).startSplashTimeout();

      // Page loads after 5 seconds
      vi.advanceTimersByTime(5_000);
      lifecycle.onPageLoaded();

      // Continue past timeout
      vi.advanceTimersByTime(6_000);

      expect(lifecycle.getState().errorOverlayVisible).toBe(false);
      expect(lifecycle.getState().pageLoaded).toBe(true);
    });

    it('should use custom timeout value', async () => {
      lifecycle = new AppLifecycle({ splashTimeoutMs: 5_000 });
      (lifecycle as any).startSplashTimeout();

      vi.advanceTimersByTime(5_000);

      expect(lifecycle.getState().errorOverlayVisible).toBe(true);
    });
  });

  describe('Error Overlay', () => {
    it('should render error overlay with retry button', () => {
      lifecycle = new AppLifecycle();
      lifecycle.showErrorOverlay('Test error message');

      const overlay = document.getElementById('app-error-overlay');
      expect(overlay).not.toBeNull();
      expect(overlay!.textContent).toContain('Test error message');
      expect(overlay!.textContent).toContain('Retry');
    });

    it('should reload page when retry button is clicked', () => {
      lifecycle = new AppLifecycle();
      lifecycle.showErrorOverlay('Test error');

      // Mock window.location.reload
      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      const retryBtn = document.querySelector('#app-error-overlay button') as HTMLButtonElement;
      retryBtn.click();

      expect(reloadMock).toHaveBeenCalledOnce();
      expect(lifecycle.getState().errorOverlayVisible).toBe(false);
    });

    it('should remove previous error overlay before showing new one', () => {
      lifecycle = new AppLifecycle();
      lifecycle.showErrorOverlay('First error');
      lifecycle.showErrorOverlay('Second error');

      const overlays = document.querySelectorAll('#app-error-overlay');
      expect(overlays.length).toBe(1);
      expect(overlays[0].textContent).toContain('Second error');
    });
  });

  describe('Offline Indicator', () => {
    it('should show offline indicator when network is lost', async () => {
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();

      lifecycle.handleNetworkStatusChange({ connected: false, connectionType: 'none' });

      expect(lifecycle.getState().offlineIndicatorVisible).toBe(true);
      const overlay = document.getElementById('app-offline-indicator');
      expect(overlay).not.toBeNull();
      expect(overlay!.textContent).toContain('You are offline');
    });

    it('should show retry button in offline indicator', async () => {
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();

      lifecycle.handleNetworkStatusChange({ connected: false, connectionType: 'none' });

      const overlay = document.getElementById('app-offline-indicator');
      expect(overlay!.textContent).toContain('Retry');
    });

    it('should auto-reload when connectivity restores while offline indicator is shown', async () => {
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();

      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      // Go offline
      lifecycle.handleNetworkStatusChange({ connected: false, connectionType: 'none' });
      expect(lifecycle.getState().offlineIndicatorVisible).toBe(true);

      // Come back online
      lifecycle.handleNetworkStatusChange({ connected: true, connectionType: 'wifi' });

      expect(lifecycle.getState().offlineIndicatorVisible).toBe(false);
      expect(reloadMock).toHaveBeenCalledOnce();
    });

    it('should not auto-reload when connectivity changes if offline indicator is not shown', async () => {
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();

      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      // Network connected but no offline indicator shown
      lifecycle.handleNetworkStatusChange({ connected: true, connectionType: 'wifi' });

      expect(reloadMock).not.toHaveBeenCalled();
    });

    it('should reload when retry button is clicked in offline indicator', async () => {
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();

      const reloadMock = vi.fn();
      Object.defineProperty(window, 'location', {
        value: { reload: reloadMock },
        writable: true,
      });

      lifecycle.handleNetworkStatusChange({ connected: false, connectionType: 'none' });

      const retryBtn = document.querySelector('#app-offline-indicator button') as HTMLButtonElement;
      retryBtn.click();

      expect(reloadMock).toHaveBeenCalledOnce();
      expect(lifecycle.getState().offlineIndicatorVisible).toBe(false);
    });
  });

  describe('Network monitoring via plugin', () => {
    it('should register a network status listener on initialize', async () => {
      const { Network } = await import('@capacitor/network');
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();

      expect(Network.addListener).toHaveBeenCalledWith(
        'networkStatusChange',
        expect.any(Function)
      );
    });

    it('should trigger offline indicator via network listener callback', async () => {
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();

      expect(networkStatusCallback).not.toBeNull();
      networkStatusCallback!({ connected: false, connectionType: 'none' });

      expect(lifecycle.getState().offlineIndicatorVisible).toBe(true);
    });

    it('should remove network listener on destroy', async () => {
      lifecycle = new AppLifecycle();
      await lifecycle.initialize();
      await lifecycle.destroy();

      expect(mockNetworkListenerRemove).toHaveBeenCalledOnce();
    });
  });

  describe('Cleanup', () => {
    it('should clear splash timer on destroy', async () => {
      lifecycle = new AppLifecycle({ splashTimeoutMs: 10_000 });
      (lifecycle as any).startSplashTimeout();

      await lifecycle.destroy();

      // Advance past timeout — should NOT trigger error
      vi.advanceTimersByTime(15_000);
      expect(lifecycle.getState().errorOverlayVisible).toBe(false);
    });
  });
});
