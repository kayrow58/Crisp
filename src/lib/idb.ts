// Tiny IndexedDB key-value store for the on-phone copy of data and the offline write queue.
const DB = 'crisp'
const STORE = 'kv'

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => req.result.createObjectStore(STORE)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then(
    (d) =>
      new Promise<T>((resolve, reject) => {
        const t = d.transaction(STORE, mode)
        const req = fn(t.objectStore(STORE))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export const idb = {
  get: <T>(key: string) => tx<T | undefined>('readonly', (s) => s.get(key) as IDBRequest<T | undefined>).catch(() => undefined),
  set: (key: string, value: unknown) => tx('readwrite', (s) => s.put(value, key)).catch(() => undefined),
  del: (key: string) => tx('readwrite', (s) => s.delete(key)).catch(() => undefined),
  clear: () => tx('readwrite', (s) => s.clear()).catch(() => undefined),
}
