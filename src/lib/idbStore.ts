// IndexedDB storage engine for offline-first caching and zero-egress state hydration

const DB_NAME = 'sparezy_idb_cache_v1';
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function getIDB(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not supported'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        // Key-value store for table collections and sync meta
        if (!db.objectStoreNames.contains('cache_partitions')) {
          db.createObjectStore('cache_partitions');
        }
        if (!db.objectStoreNames.contains('sync_metadata')) {
          db.createObjectStore('sync_metadata');
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export const idbStore = {
  async set<T>(storeName: 'cache_partitions' | 'sync_metadata', key: string, value: T): Promise<void> {
    try {
      const db = await getIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(value, key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`[IDB Set Warning] Failed to write key "${key}":`, err);
    }
  },

  async get<T>(storeName: 'cache_partitions' | 'sync_metadata', key: string): Promise<T | null> {
    try {
      const db = await getIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`[IDB Get Warning] Failed to read key "${key}":`, err);
      return null;
    }
  },

  async delete(storeName: 'cache_partitions' | 'sync_metadata', key: string): Promise<void> {
    try {
      const db = await getIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(key);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`[IDB Delete Warning] Failed to delete key "${key}":`, err);
    }
  },

  async clear(storeName: 'cache_partitions' | 'sync_metadata'): Promise<void> {
    try {
      const db = await getIDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch (err) {
      console.warn(`[IDB Clear Warning] Failed to clear store "${storeName}":`, err);
    }
  },

  async clearAll(): Promise<void> {
    try {
      const db = await getIDB();
      const tx = db.transaction(['cache_partitions', 'sync_metadata'], 'readwrite');
      tx.objectStore('cache_partitions').clear();
      tx.objectStore('sync_metadata').clear();
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
      });
    } catch (err) {
      console.warn('[IDB Clear Warning] Failed to clear DB:', err);
    }
  }
};
