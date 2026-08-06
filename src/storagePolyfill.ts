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

// 1. Establish fully safe storage references
export let safeLocalStorage: Storage;
export let safeSessionStorage: Storage;

try {
  if (typeof window !== 'undefined') {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    safeLocalStorage = window.localStorage;
  } else {
    safeLocalStorage = createMemoryStorage();
  }
} catch (e) {
  console.warn("⚠️ LocalStorage is blocked or unsupported in this context. Using in-memory fallback.", e);
  safeLocalStorage = createMemoryStorage();
}

try {
  if (typeof window !== 'undefined') {
    const testKey = '__storage_test__';
    window.sessionStorage.setItem(testKey, testKey);
    window.sessionStorage.removeItem(testKey);
    safeSessionStorage = window.sessionStorage;
  } else {
    safeSessionStorage = createMemoryStorage();
  }
} catch (e) {
  console.warn("⚠️ SessionStorage is blocked or unsupported in this context. Using in-memory fallback.", e);
  safeSessionStorage = createMemoryStorage();
}

// 2. Also try to polyfill the window objects globally for maximum compatibility
if (typeof window !== 'undefined') {
  try {
    Object.defineProperty(window, 'localStorage', {
      value: safeLocalStorage,
      writable: true,
      configurable: true
    });
  } catch (err) {
    try {
      (window as any).localStorage = safeLocalStorage;
    } catch (_) {}
  }

  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: safeSessionStorage,
      writable: true,
      configurable: true
    });
  } catch (err) {
    try {
      (window as any).sessionStorage = safeSessionStorage;
    } catch (_) {}
  }
}

// 3. Check and polyfill BroadcastChannel for older browsers or restricted sandboxes
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
