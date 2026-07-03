import { SplashScreen } from '@capacitor/splash-screen';
import { Network, ConnectionStatus } from '@capacitor/network';

const SPLASH_TIMEOUT_MS = 10_000;
const OFFLINE_DETECTION_MAX_MS = 3_000;

export interface AppLifecycleOptions {
  /** Maximum time (ms) to wait for page load before showing error. Default: 10000 */
  splashTimeoutMs?: number;
}

export interface AppLifecycleState {
  pageLoaded: boolean;
  splashDismissed: boolean;
  offlineIndicatorVisible: boolean;
  errorOverlayVisible: boolean;
}

/**
 * Manages splash screen dismissal, load timeout errors,
 * and offline/connectivity handling for the Capacitor shell.
 */
export class AppLifecycle {
  private state: AppLifecycleState = {
    pageLoaded: false,
    splashDismissed: false,
    offlineIndicatorVisible: false,
    errorOverlayVisible: false,
  };

  private splashTimeoutMs: number;
  private splashTimer: ReturnType<typeof setTimeout> | null = null;
  private networkListenerHandle: { remove: () => Promise<void> } | null = null;

  constructor(options?: AppLifecycleOptions) {
    this.splashTimeoutMs = options?.splashTimeoutMs ?? SPLASH_TIMEOUT_MS;
  }

  /**
   * Initialize lifecycle management:
   * - Start splash timeout
   * - Listen for page load events
   * - Monitor network connectivity
   */
  async initialize(): Promise<void> {
    this.startSplashTimeout();
    this.listenForPageLoad();
    await this.startNetworkMonitoring();
  }

  /**
   * Clean up all listeners and timers.
   */
  async destroy(): Promise<void> {
    if (this.splashTimer) {
      clearTimeout(this.splashTimer);
      this.splashTimer = null;
    }
    if (this.networkListenerHandle) {
      await this.networkListenerHandle.remove();
      this.networkListenerHandle = null;
    }
  }

  getState(): Readonly<AppLifecycleState> {
    return { ...this.state };
  }

  // --- Splash Screen ---

  private startSplashTimeout(): void {
    this.splashTimer = setTimeout(() => {
      if (!this.state.pageLoaded) {
        this.state.splashDismissed = true;
        this.state.errorOverlayVisible = true;
        // Fire SplashScreen.hide asynchronously but don't await
        SplashScreen.hide().catch(() => {});
        this.showErrorOverlay('Content failed to load. Please check your connection and try again.');
      }
    }, this.splashTimeoutMs);
  }

  private listenForPageLoad(): void {
    // When running inside Capacitor WebView loading a remote URL,
    // the 'load' event on window fires when the page finishes loading.
    if (typeof window !== 'undefined') {
      if (document.readyState === 'complete') {
        this.onPageLoaded();
      } else {
        window.addEventListener('load', () => this.onPageLoaded(), { once: true });
      }
    }
  }

  /** Called when the web page finishes loading successfully. */
  onPageLoaded(): void {
    if (this.state.pageLoaded) return;
    this.state.pageLoaded = true;
    if (this.splashTimer) {
      clearTimeout(this.splashTimer);
      this.splashTimer = null;
    }
    this.dismissSplash();
  }

  private async dismissSplash(): Promise<void> {
    if (this.state.splashDismissed) return;
    this.state.splashDismissed = true;
    try {
      await SplashScreen.hide();
    } catch {
      // SplashScreen.hide may throw in web/test environments — safe to ignore
    }
  }

  // --- Error Overlay ---

  showErrorOverlay(message: string): void {
    this.state.errorOverlayVisible = true;
    if (typeof document === 'undefined') return;

    this.removeOverlayById('app-error-overlay');

    const overlay = document.createElement('div');
    overlay.id = 'app-error-overlay';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: #fff; display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 99999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 24px; text-align: center;
    `;

    const msgEl = document.createElement('p');
    msgEl.textContent = message;
    msgEl.style.cssText = 'font-size: 16px; color: #333; margin-bottom: 24px; max-width: 320px;';

    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry';
    retryBtn.style.cssText = `
      padding: 12px 32px; font-size: 16px; border: none;
      background: #007AFF; color: #fff; border-radius: 8px; cursor: pointer;
    `;
    retryBtn.addEventListener('click', () => this.retry());

    overlay.appendChild(msgEl);
    overlay.appendChild(retryBtn);
    document.body.appendChild(overlay);
  }

  hideErrorOverlay(): void {
    this.state.errorOverlayVisible = false;
    this.removeOverlayById('app-error-overlay');
  }

  // --- Offline Indicator ---

  showOfflineIndicator(): void {
    this.state.offlineIndicatorVisible = true;
    if (typeof document === 'undefined') return;

    this.removeOverlayById('app-offline-indicator');

    const overlay = document.createElement('div');
    overlay.id = 'app-offline-indicator';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(255,255,255,0.95); display: flex; flex-direction: column;
      align-items: center; justify-content: center; z-index: 99998;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 24px; text-align: center;
    `;

    const msgEl = document.createElement('p');
    msgEl.textContent = 'You are offline. Please check your internet connection.';
    msgEl.style.cssText = 'font-size: 16px; color: #333; margin-bottom: 24px; max-width: 320px;';

    const retryBtn = document.createElement('button');
    retryBtn.textContent = 'Retry';
    retryBtn.style.cssText = `
      padding: 12px 32px; font-size: 16px; border: none;
      background: #007AFF; color: #fff; border-radius: 8px; cursor: pointer;
    `;
    retryBtn.addEventListener('click', () => this.retry());

    overlay.appendChild(msgEl);
    overlay.appendChild(retryBtn);
    document.body.appendChild(overlay);
  }

  hideOfflineIndicator(): void {
    this.state.offlineIndicatorVisible = false;
    this.removeOverlayById('app-offline-indicator');
  }

  // --- Network Monitoring ---

  private async startNetworkMonitoring(): Promise<void> {
    try {
      this.networkListenerHandle = await Network.addListener(
        'networkStatusChange',
        (status: ConnectionStatus) => {
          this.handleNetworkStatusChange(status);
        }
      );
    } catch {
      // Network plugin may not be available in web/test environments
    }
  }

  handleNetworkStatusChange(status: ConnectionStatus): void {
    if (!status.connected) {
      this.showOfflineIndicator();
    } else if (this.state.offlineIndicatorVisible) {
      // Auto-reload when connectivity restores while offline indicator is displayed
      this.hideOfflineIndicator();
      this.reloadPage();
    }
  }

  // --- Retry / Reload ---

  retry(): void {
    this.hideErrorOverlay();
    this.hideOfflineIndicator();
    this.reloadPage();
  }

  private reloadPage(): void {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload();
    }
  }

  // --- Helpers ---

  private removeOverlayById(id: string): void {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(id);
    if (existing) {
      existing.remove();
    }
  }
}
