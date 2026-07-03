import { describe, it, expect, vi } from 'vitest';
import { ListenerManager } from '../ListenerManager';

describe('ListenerManager', () => {
  it('should start with zero listeners', () => {
    const manager = new ListenerManager<string>();
    expect(manager.getListenerCount()).toBe(0);
  });

  it('should add a listener and increase count', () => {
    const manager = new ListenerManager<string>();
    manager.add(() => {});
    expect(manager.getListenerCount()).toBe(1);
  });

  it('should notify all registered listeners with the event', () => {
    const manager = new ListenerManager<number>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    manager.add(cb1);
    manager.add(cb2);
    manager.notify(42);

    expect(cb1).toHaveBeenCalledWith(42);
    expect(cb2).toHaveBeenCalledWith(42);
  });

  it('should return a handle that removes the listener on remove()', () => {
    const manager = new ListenerManager<string>();
    const cb = vi.fn();

    const handle = manager.add(cb);
    expect(manager.getListenerCount()).toBe(1);

    handle.remove();
    expect(manager.getListenerCount()).toBe(0);

    manager.notify('event');
    expect(cb).not.toHaveBeenCalled();
  });

  it('should not invoke removed listener on subsequent notifications', () => {
    const manager = new ListenerManager<string>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();

    const handle1 = manager.add(cb1);
    manager.add(cb2);

    manager.notify('first');
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);

    handle1.remove();
    manager.notify('second');

    expect(cb1).toHaveBeenCalledTimes(1); // not called again
    expect(cb2).toHaveBeenCalledTimes(2);
    expect(cb2).toHaveBeenLastCalledWith('second');
  });

  it('should handle remove() being called multiple times gracefully', () => {
    const manager = new ListenerManager<string>();
    const cb = vi.fn();

    const handle = manager.add(cb);
    handle.remove();
    handle.remove(); // second call should not throw

    expect(manager.getListenerCount()).toBe(0);
  });

  it('should clear all listeners on removeAll()', () => {
    const manager = new ListenerManager<number>();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    const cb3 = vi.fn();

    manager.add(cb1);
    manager.add(cb2);
    manager.add(cb3);
    expect(manager.getListenerCount()).toBe(3);

    manager.removeAll();
    expect(manager.getListenerCount()).toBe(0);

    manager.notify(99);
    expect(cb1).not.toHaveBeenCalled();
    expect(cb2).not.toHaveBeenCalled();
    expect(cb3).not.toHaveBeenCalled();
  });

  it('should allow adding new listeners after removeAll()', () => {
    const manager = new ListenerManager<string>();
    manager.add(vi.fn());
    manager.removeAll();

    const cb = vi.fn();
    manager.add(cb);
    manager.notify('after-clear');

    expect(cb).toHaveBeenCalledWith('after-clear');
    expect(manager.getListenerCount()).toBe(1);
  });

  it('should not notify if no listeners are registered', () => {
    const manager = new ListenerManager<number>();
    // Should not throw
    expect(() => manager.notify(1)).not.toThrow();
  });

  it('should support typed events with complex payloads', () => {
    interface MidiEvent {
      type: 'noteOn' | 'noteOff';
      note: number;
      velocity: number;
    }

    const manager = new ListenerManager<MidiEvent>();
    const cb = vi.fn();

    manager.add(cb);
    const event: MidiEvent = { type: 'noteOn', note: 60, velocity: 100 };
    manager.notify(event);

    expect(cb).toHaveBeenCalledWith(event);
  });

  it('should allow same callback to be added multiple times', () => {
    const manager = new ListenerManager<string>();
    const cb = vi.fn();

    // Set doesn't allow duplicates, so adding same reference twice results in one entry
    manager.add(cb);
    manager.add(cb);

    // Set deduplicates by reference
    expect(manager.getListenerCount()).toBe(1);
    manager.notify('test');
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
