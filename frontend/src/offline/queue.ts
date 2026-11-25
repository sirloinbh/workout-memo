// #476: workout saves that could not reach the server wait here (IndexedDB) and are sent later.
// Each entry keeps the request's Idempotency-Key, so a resend after an uncertain first try never makes a second log.

export type QueuedSave = {
  key: string;
  path: string;
  method: string;
  /** The JSON request body, exactly as it was first built. */
  body: string;
  queuedAt: number;
  /** Set when the server rejected the save; the entry then stays until the user discards it. */
  error?: string;
};

export type QueueStore = {
  all(): Promise<QueuedSave[]>;
  put(entry: QueuedSave): Promise<void>;
  remove(key: string): Promise<void>;
};

const dbName = 'workout-memo-offline';
const storeName = 'saves';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

export function indexedDbStore(factory: IDBFactory | undefined = globalThis.indexedDB): QueueStore {
  let opened: Promise<IDBDatabase> | undefined;
  const open = () => {
    if (!factory) return Promise.reject(new Error('IndexedDB is not available'));
    opened ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = factory.open(dbName, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(storeName, { keyPath: 'key' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
      req.onblocked = () => reject(new Error('IndexedDB open blocked'));
    }).catch((e) => {
      opened = undefined;
      throw e;
    });
    return opened;
  };
  const objects = async (mode: IDBTransactionMode) =>
    (await open()).transaction(storeName, mode).objectStore(storeName);
  return {
    async all() {
      const rows = await request<QueuedSave[]>((await objects('readonly')).getAll());
      return rows.sort((a, b) => a.queuedAt - b.queuedAt || a.key.localeCompare(b.key));
    },
    async put(entry) {
      await request((await objects('readwrite')).put(entry));
    },
    async remove(key) {
      await request((await objects('readwrite')).delete(key));
    },
  };
}

let store: QueueStore = indexedDbStore();
/** Tests swap the store; returns the previous one. */
export function useQueueStore(next: QueueStore): QueueStore {
  const previous = store;
  store = next;
  return previous;
}

export const listQueue = (): Promise<QueuedSave[]> => store.all();
export const removeQueued = (key: string): Promise<void> => store.remove(key);
export const updateQueued = (entry: QueuedSave): Promise<void> => store.put(entry);

/** Queues a save. Resolves false when the phone cannot store it, so the caller keeps its local draft. */
export async function enqueueSave(
  save: Omit<QueuedSave, 'queuedAt' | 'error'>,
  now = Date.now(),
): Promise<boolean> {
  try {
    await store.put({ ...save, queuedAt: now });
    return true;
  } catch {
    return false;
  }
}
