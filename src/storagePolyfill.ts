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

// Check and polyfill localStorage safely
if (typeof window !== 'undefined') {
  let localStorageWorking = false;
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    localStorageWorking = true;
  } catch (e) {
    console.warn("⚠️ LocalStorage is blocked or partitioned in iframe. Using in-memory fallback.", e);
  }

  if (!localStorageWorking) {
    const fallback = createMemoryStorage();
    try {
      Object.defineProperty(window, 'localStorage', {
        value: fallback,
        writable: true,
        configurable: true
      });
    } catch (_) {
      try {
        (window as any).localStorage = fallback;
      } catch (_) {}
    }
  }
}

// Check and polyfill sessionStorage safely
if (typeof window !== 'undefined') {
  let sessionStorageWorking = false;
  try {
    const testKey = '__storage_test__';
    window.sessionStorage.setItem(testKey, testKey);
    window.sessionStorage.removeItem(testKey);
    sessionStorageWorking = true;
  } catch (e) {
    console.warn("⚠️ SessionStorage is blocked or partitioned in iframe. Using in-memory fallback.", e);
  }

  if (!sessionStorageWorking) {
    const fallback = createMemoryStorage();
    try {
      Object.defineProperty(window, 'sessionStorage', {
        value: fallback,
        writable: true,
        configurable: true
      });
    } catch (_) {
      try {
        (window as any).sessionStorage = fallback;
      } catch (_) {}
    }
  }
}

// Check and polyfill BroadcastChannel safely (especially for cross-origin iframes)
if (typeof window !== 'undefined') {
  let bcWorking = false;
  try {
    if ('BroadcastChannel' in window) {
      const testBc = new window.BroadcastChannel('__test_bc__');
      testBc.close();
      bcWorking = true;
    }
  } catch (_) {
    bcWorking = false;
  }

  if (!bcWorking) {
    class SafeBroadcastChannelMock {
      name: string;
      onmessage: ((this: any, ev: MessageEvent) => any) | null = null;
      constructor(name: string) {
        this.name = name;
      }
      postMessage(_message: any) {}
      close() {}
      addEventListener() {}
      removeEventListener() {}
      dispatchEvent() { return true; }
    }
    try {
      (window as any).BroadcastChannel = SafeBroadcastChannelMock;
    } catch (_) {}
  }
}

// Check and polyfill window.matchMedia safely (crucial for sandboxed iframe environments)
if (typeof window !== 'undefined') {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = function (query: string): MediaQueryList {
      return {
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      } as any;
    };
  }
}


