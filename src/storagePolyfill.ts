// Helper to create an in-memory storage fallback
function createMemoryStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem(key: string): string | null {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key: string, value: string): void {
      store[key] = String(value);
    },
    removeItem(key: string): void {
      delete store[key];
    },
    clear(): void {
      for (const key in store) {
        if (Object.prototype.hasOwnProperty.call(store, key)) {
          delete store[key];
        }
      }
    },
    key(index: number): string | null {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
    get length(): number {
      return Object.keys(store).length;
    }
  } as Storage;
}

// Check and polyfill localStorage
try {
  if (typeof window !== 'undefined') {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
  }
} catch (e) {
  console.warn("⚠️ LocalStorage is blocked or unsupported in this context. Using in-memory fallback.", e);
  const fallback = createMemoryStorage();
  try {
    Object.defineProperty(window, 'localStorage', {
      value: fallback,
      writable: true,
      configurable: true
    });
  } catch (err) {
    try {
      (window as any).localStorage = fallback;
    } catch (_) {}
  }
}

// Check and polyfill sessionStorage
try {
  if (typeof window !== 'undefined') {
    const testKey = '__storage_test__';
    window.sessionStorage.setItem(testKey, testKey);
    window.sessionStorage.removeItem(testKey);
  }
} catch (e) {
  console.warn("⚠️ SessionStorage is blocked or unsupported in this context. Using in-memory fallback.", e);
  const fallback = createMemoryStorage();
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: fallback,
      writable: true,
      configurable: true
    });
  } catch (err) {
    try {
      (window as any).sessionStorage = fallback;
    } catch (_) {}
  }
}

// Check and polyfill BroadcastChannel for older browsers or restricted sandboxes
if (typeof window !== 'undefined' && !('BroadcastChannel' in window)) {
  try {
    (window as any).BroadcastChannel = class BroadcastChannelMock {
      name: string;
      onmessage: ((this: any, ev: MessageEvent) => any) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage(message: any) {}
      close() {}
    };
  } catch (_) {}
}
