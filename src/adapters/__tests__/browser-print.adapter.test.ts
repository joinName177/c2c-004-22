import { describe, expect, it, vi } from 'vitest';
import { BrowserPrintAdapter } from '../browser-print.adapter';

class FakeWindow {
  private listeners = new Map<string, EventListener>();
  print = vi.fn();
  addEventListener = vi.fn((type: string, listener: EventListener) => { this.listeners.set(type, listener); });
  removeEventListener = vi.fn((type: string, listener: EventListener) => {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  });
  emit(type: string) { this.listeners.get(type)?.(new Event(type)); }
}

describe('BrowserPrintAdapter', () => {
  it('calls window.print and runs the callback once when afterprint fires', () => {
    const target = new FakeWindow();
    const adapter = new BrowserPrintAdapter(target);
    const done = vi.fn();

    adapter.print(done);
    expect(target.print).toHaveBeenCalledTimes(1);
    expect(target.addEventListener).toHaveBeenCalledWith('afterprint', expect.any(Function));

    // 真实浏览器在用户确认或取消打印后各触发一次 afterprint；这里触发后监听即移除。
    target.emit('afterprint');
    expect(done).toHaveBeenCalledTimes(1);
    target.emit('afterprint');
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('works without a callback', () => {
    const target = new FakeWindow();
    const adapter = new BrowserPrintAdapter(target);
    expect(() => adapter.print()).not.toThrow();
    expect(target.addEventListener).not.toHaveBeenCalled();
  });
});
