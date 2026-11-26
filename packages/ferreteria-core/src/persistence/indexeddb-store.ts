export interface ILocalDocumentStore {
  getCollection<T>(collectionName: string): Promise<T[]>;
  saveCollection<T>(collectionName: string, items: T[]): Promise<void>;
  clearAll(): Promise<void>;
  exportAllCollections(): Promise<Record<string, unknown[]>>;
  importAllCollections(collections: Record<string, unknown[]>): Promise<void>;
}

export class InMemoryDocumentStore implements ILocalDocumentStore {
  private readonly store = new Map<string, unknown[]>();

  async getCollection<T>(collectionName: string): Promise<T[]> {
    const items = this.store.get(collectionName) ?? [];
    return structuredClone(items) as T[];
  }

  async saveCollection<T>(collectionName: string, items: T[]): Promise<void> {
    this.store.set(collectionName, structuredClone(items) as unknown[]);
  }

  async clearAll(): Promise<void> {
    this.store.clear();
  }

  async exportAllCollections(): Promise<Record<string, unknown[]>> {
    const result: Record<string, unknown[]> = {};
    for (const [key, value] of this.store.entries()) {
      result[key] = structuredClone(value);
    }
    return result;
  }

  async importAllCollections(collections: Record<string, unknown[]>): Promise<void> {
    this.store.clear();
    for (const [key, value] of Object.entries(collections)) {
      this.store.set(key, structuredClone(value));
    }
  }
}

const DB_NAME = 'ferreteria_tornillo_fuerte_db';
const DB_VERSION = 1;
const STORE_NAME = 'collections';

export class IndexedDbDocumentStore implements ILocalDocumentStore {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(private readonly idbFactory: IDBFactory = globalThis.indexedDB) {
    if (!this.idbFactory) {
      throw new Error('IndexedDB is not available in this environment.');
    }
  }

  private openDb(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise((resolve, reject) => {
      const request = this.idbFactory.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    });

    return this.dbPromise;
  }

  async getCollection<T>(collectionName: string): Promise<T[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(collectionName);
      req.onsuccess = () => resolve((req.result as T[] | undefined) ?? []);
      req.onerror = () => reject(req.error ?? new Error(`Failed to read ${collectionName}`));
    });
  }

  async saveCollection<T>(collectionName: string, items: T[]): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(items, collectionName);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`Failed to save ${collectionName}`));
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('Failed to clear IndexedDB'));
    });
  }

  async exportAllCollections(): Promise<Record<string, unknown[]>> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = async () => {
        try {
          const keys = keysReq.result as string[];
          const out: Record<string, unknown[]> = {};
          for (const key of keys) {
            out[String(key)] = await this.getCollection<unknown>(String(key));
          }
          resolve(out);
        } catch (err) {
          reject(err);
        }
      };
      keysReq.onerror = () => reject(keysReq.error ?? new Error('Failed to export IndexedDB'));
    });
  }

  async importAllCollections(collections: Record<string, unknown[]>): Promise<void> {
    await this.clearAll();
    for (const [key, items] of Object.entries(collections)) {
      await this.saveCollection(key, items);
    }
  }
}
