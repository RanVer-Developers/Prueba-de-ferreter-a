import { COLLECTION_NAMES, type CollectionName, type Collections } from './types';

/** Local-first persistence port. IndexedDB in the browser, in-memory in tests. */
export interface LocalStore {
  getAll<K extends CollectionName>(name: K): Promise<Collections[K][]>;
  put<K extends CollectionName>(name: K, record: Collections[K]): Promise<void>;
  remove<K extends CollectionName>(name: K, id: string): Promise<void>;
}

export class MemoryStore implements LocalStore {
  private readonly data = new Map<string, Map<string, unknown>>();
  private bucket(name: string) {
    let b = this.data.get(name);
    if (!b) { b = new Map(); this.data.set(name, b); }
    return b;
  }
  async getAll<K extends CollectionName>(name: K) {
    return [...this.bucket(name).values()] as Collections[K][];
  }
  async put<K extends CollectionName>(name: K, record: Collections[K]) {
    this.bucket(name).set((record as { id: string }).id, structuredClone(record));
  }
  async remove<K extends CollectionName>(name: K, id: string) {
    this.bucket(name).delete(id);
  }
}

const DB_NAME = 'ferre-aguilar';
const DB_VERSION = 2;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

export class IndexedDbStore implements LocalStore {
  private constructor(private readonly db: IDBDatabase) {}

  static open(): Promise<IndexedDbStore> {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        for (const name of COLLECTION_NAMES) {
          if (!open.result.objectStoreNames.contains(name)) {
            open.result.createObjectStore(name, { keyPath: 'id' });
          }
        }
      };
      open.onsuccess = () => resolve(new IndexedDbStore(open.result));
      open.onerror = () => reject(open.error ?? new Error('No se pudo abrir la base local'));
    });
  }

  async getAll<K extends CollectionName>(name: K) {
    const tx = this.db.transaction(name, 'readonly');
    return (await req(tx.objectStore(name).getAll())) as Collections[K][];
  }
  async put<K extends CollectionName>(name: K, record: Collections[K]) {
    const tx = this.db.transaction(name, 'readwrite');
    await req(tx.objectStore(name).put(record));
  }
  async remove<K extends CollectionName>(name: K, id: string) {
    const tx = this.db.transaction(name, 'readwrite');
    await req(tx.objectStore(name).delete(id));
  }
}
