/**
 * A handle returned when adding a listener, providing a way to unsubscribe.
 */
export interface ListenerHandle {
  /** Removes this listener from the manager. Subsequent events will not invoke the callback. */
  remove(): void;
}

/**
 * Generic typed listener manager for event subscription and notification.
 *
 * Manages a set of callbacks that can be registered, removed individually,
 * or cleared entirely. Notifying invokes all currently registered callbacks.
 *
 * @typeParam T - The event payload type delivered to each callback.
 */
export class ListenerManager<T> {
  private listeners: Set<(event: T) => void> = new Set();

  /**
   * Registers a callback to be invoked on each notification.
   *
   * @param callback - Function to call when `notify()` is invoked.
   * @returns A handle with a `remove()` method to unsubscribe this callback.
   */
  add(callback: (event: T) => void): ListenerHandle {
    this.listeners.add(callback);

    return {
      remove: () => {
        this.listeners.delete(callback);
      },
    };
  }

  /**
   * Invokes all registered callbacks with the given event payload.
   * Callbacks are invoked synchronously in insertion order.
   *
   * @param event - The event payload to deliver to each listener.
   */
  notify(event: T): void {
    for (const callback of this.listeners) {
      callback(event);
    }
  }

  /**
   * Removes all registered listeners. After this call, `notify()` will
   * not invoke any callbacks until new ones are added.
   */
  removeAll(): void {
    this.listeners.clear();
  }

  /**
   * Returns the number of currently registered listeners.
   */
  getListenerCount(): number {
    return this.listeners.size;
  }
}
