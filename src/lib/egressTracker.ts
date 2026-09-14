// Egress Optimization & Bandwidth Conservation Tracker

export interface EgressStats {
  totalBytesSaved: number;
  totalOriginalBytes: number;
  totalTransferredBytes: number;
  savingsPercentage: number;
  
  // Category breakdowns (in bytes)
  databaseEgressSaved: number;
  databaseTransferredBytes: number;
  fullFetchesAvoided: number;
  deltaSyncsExecuted: number;

  imagePreCompressionSaved: number;
  imageOriginalBytes: number;
  imageTransferredBytes: number;
  imagesCompressed: number;

  cacheHits: number;
  realtimeEventsProcessed: number;
  
  // Mode configuration
  mode: 'aggressive' | 'balanced' | 'network-first';
}

const STORAGE_KEY = 'sparezy_egress_metrics_v1';

let currentStats: EgressStats = {
  totalBytesSaved: 0,
  totalOriginalBytes: 0,
  totalTransferredBytes: 0,
  savingsPercentage: 0,
  databaseEgressSaved: 0,
  databaseTransferredBytes: 0,
  fullFetchesAvoided: 0,
  deltaSyncsExecuted: 0,
  imagePreCompressionSaved: 0,
  imageOriginalBytes: 0,
  imageTransferredBytes: 0,
  imagesCompressed: 0,
  cacheHits: 0,
  realtimeEventsProcessed: 0,
  mode: 'aggressive',
};

// Initialize from storage if present
try {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      currentStats = { ...currentStats, ...parsed };
      recalcTotals();
    }
  }
} catch (e) {
  // safe fallback
}

function recalcTotals() {
  currentStats.totalBytesSaved = 
    currentStats.databaseEgressSaved + 
    currentStats.imagePreCompressionSaved;
    
  currentStats.totalTransferredBytes = 
    currentStats.databaseTransferredBytes + 
    currentStats.imageTransferredBytes;

  currentStats.totalOriginalBytes = 
    currentStats.totalTransferredBytes + currentStats.totalBytesSaved;

  if (currentStats.totalOriginalBytes > 0) {
    currentStats.savingsPercentage = Number(
      ((currentStats.totalBytesSaved / currentStats.totalOriginalBytes) * 100).toFixed(1)
    );
  } else {
    currentStats.savingsPercentage = 0;
  }
}

function persist() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(currentStats));
    }
  } catch (e) {}
}

const listeners = new Set<(stats: EgressStats) => void>();

function notify() {
  recalcTotals();
  persist();
  listeners.forEach(fn => {
    try { fn({ ...currentStats }); } catch {}
  });
}

export const egressTracker = {
  getStats(): EgressStats {
    return { ...currentStats };
  },

  getMetrics(): EgressStats {
    return { ...currentStats };
  },

  subscribe(fn: (stats: EgressStats) => void): () => void {
    listeners.add(fn);
    fn({ ...currentStats });
    return () => listeners.delete(fn);
  },

  setMode(mode: 'aggressive' | 'balanced' | 'network-first') {
    currentStats.mode = mode;
    notify();
  },

  getMode(): 'aggressive' | 'balanced' | 'network-first' {
    return currentStats.mode;
  },

  recordDatabaseDeltaSync(fullFetchEstimatedBytes: number, deltaTransferredBytes: number, rowsFetched: number, totalCachedRows: number) {
    const saved = Math.max(0, fullFetchEstimatedBytes - deltaTransferredBytes);
    currentStats.databaseEgressSaved += saved;
    currentStats.databaseTransferredBytes += deltaTransferredBytes;
    currentStats.deltaSyncsExecuted += 1;
    notify();
  },

  recordAvoidedFullFetch(estimatedBytes: number) {
    currentStats.databaseEgressSaved += estimatedBytes;
    currentStats.fullFetchesAvoided += 1;
    currentStats.cacheHits += 1;
    notify();
  },

  recordImageCompression(originalBytes: number, compressedBytes: number) {
    const saved = Math.max(0, originalBytes - compressedBytes);
    currentStats.imageOriginalBytes += originalBytes;
    currentStats.imageTransferredBytes += compressedBytes;
    currentStats.imagePreCompressionSaved += saved;
    currentStats.imagesCompressed += 1;
    notify();
  },

  recordRealtimeDelta(payloadBytes: number = 250) {
    currentStats.realtimeEventsProcessed += 1;
    // Each realtime event avoids a 50KB-2MB full table poll
    currentStats.databaseEgressSaved += 45000;
    currentStats.databaseTransferredBytes += payloadBytes;
    notify();
  },

  recordCacheHit() {
    currentStats.cacheHits += 1;
    notify();
  },

  reset() {
    currentStats = {
      totalBytesSaved: 0,
      totalOriginalBytes: 0,
      totalTransferredBytes: 0,
      savingsPercentage: 0,
      databaseEgressSaved: 0,
      databaseTransferredBytes: 0,
      fullFetchesAvoided: 0,
      deltaSyncsExecuted: 0,
      imagePreCompressionSaved: 0,
      imageOriginalBytes: 0,
      imageTransferredBytes: 0,
      imagesCompressed: 0,
      cacheHits: 0,
      realtimeEventsProcessed: 0,
      mode: currentStats.mode,
    };
    notify();
  },

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    const val = (bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 2);
    return `${val} ${sizes[i]}`;
  }
};
