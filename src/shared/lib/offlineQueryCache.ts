import { dehydrate, hydrate, type DehydratedState, type QueryClient } from '@tanstack/react-query';

const DATABASE_NAME = 'rent-offline-cache';
const STORE_NAME = 'query-cache';
const CACHE_KEY = 'v1';
const BOOTSTRAP_CACHE_KEY = 'rent-offline-cache-bootstrap-v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 48;

type StoredQueryCache = {
  savedAt: number;
  state: DehydratedState;
};

function isUsableCache(cache: StoredQueryCache | null): cache is StoredQueryCache {
  return Boolean(cache && Date.now() - cache.savedAt <= MAX_AGE_MS);
}

function readBootstrapCache(): StoredQueryCache | null {
  try {
    const value = window.localStorage.getItem(BOOTSTRAP_CACHE_KEY);
    return value ? JSON.parse(value) as StoredQueryCache : null;
  } catch {
    return null;
  }
}

function writeBootstrapCache(cache: StoredQueryCache): void {
  try {
    window.localStorage.setItem(BOOTSTRAP_CACHE_KEY, JSON.stringify(cache));
  } catch {
    // IndexedDB remains available when local storage is unavailable or full.
  }
}

function openDatabase(): Promise<IDBDatabase | null> {
  if (!('indexedDB' in window)) return Promise.resolve(null);

  return new Promise((resolve) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onerror = () => resolve(null);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function readCache(): Promise<StoredQueryCache | null> {
  const database = await openDatabase();
  if (!database) return null;

  return new Promise((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(CACHE_KEY);
    request.onerror = () => resolve(null);
    request.onsuccess = () => resolve((request.result as StoredQueryCache | undefined) ?? null);
  });
}

async function writeCache(cache: StoredQueryCache): Promise<void> {
  writeBootstrapCache(cache);
  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(cache, CACHE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}

/** Restores the last successful read results so the app can paint before the network responds. */
export async function restoreOfflineQueryCache(queryClient: QueryClient): Promise<void> {
  const cache = await readCache();
  if (!isUsableCache(cache)) return;

  hydrate(queryClient, cache.state);
}

/** Restores the latest small launch snapshot before React mounts, without waiting for IndexedDB. */
export function restoreSynchronousOfflineQueryCache(queryClient: QueryClient): void {
  const cache = readBootstrapCache();
  if (!isUsableCache(cache)) return;

  hydrate(queryClient, cache.state);
}

/** Persists only successful reads; pending requests and errors are never restored. */
export function persistOfflineQueryCache(queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof window.setTimeout> | undefined;

  return queryClient.getQueryCache().subscribe(() => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const state = dehydrate(queryClient, {
        shouldDehydrateQuery: (query) => query.state.status === 'success',
      });
      if (state.queries.length === 0) {
        void clearOfflineQueryCache();
        return;
      }
      void writeCache({ savedAt: Date.now(), state });
    }, 500);
  });
}

export async function clearOfflineQueryCache(): Promise<void> {
  try {
    window.localStorage.removeItem(BOOTSTRAP_CACHE_KEY);
  } catch {
    // Nothing else is needed when local storage is unavailable.
  }
  const database = await openDatabase();
  if (!database) return;

  await new Promise<void>((resolve) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(CACHE_KEY);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => resolve();
  });
}
