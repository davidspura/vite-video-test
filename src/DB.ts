const DB_NAME = "hls-database";
const STORE_NAME = "hls-files";
const DATE_INDEX = "createdAt";
const FILENAME_INDEX = "filename";

export default class DB {
  private version = 1;
  private db: IDBDatabase | null = null;

  init = async () => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, this.version);
      request.onsuccess = (e) => {
        this.db = (e.target as IDBOpenDBRequest).result;
        console.log("Database openned");
        resolve(this.db);
      };
      request.onerror = (e) => {
        const err = (e.target as IDBOpenDBRequest).error;
        console.log("Access denied ", err);
        reject();
      };
      request.onupgradeneeded = (e) => {
        const db = (e.target as IDBOpenDBRequest).result;
        const objectStore = db.createObjectStore(STORE_NAME, {
          autoIncrement: true,
        });
        objectStore.createIndex(DATE_INDEX, DATE_INDEX, { unique: false });
        objectStore.createIndex(FILENAME_INDEX, FILENAME_INDEX, {
          unique: false,
        });
        objectStore.transaction.oncomplete = (event) => {
          console.log("Object store created ", event);
        };
      };
    });
  };

  createTransaction = (mode: IDBTransactionMode) => {
    if (!this.db) throw Error("Transaction couldn't be created, db is null");
    const transaction = this.db.transaction(STORE_NAME, mode);
    const objectStore = transaction.objectStore(STORE_NAME);
    return objectStore;
  };

  getWrite = () => {
    const objectStore = this.createTransaction("readwrite");
    return (hlsItem: HlsDbItem) =>
      new Promise((resolve, reject) => {
        const request = objectStore.put(hlsItem);
        request.onsuccess = (e) => resolve(e);
        request.onerror = (e) => {
          console.log("DB: 'write' failed ", e);
          reject();
        };
      });
  };

  getDelete = () => {
    const objectStore = this.createTransaction("readwrite");
    return (filename: string) =>
      new Promise((resolve, reject) => {
        const index = objectStore.index(FILENAME_INDEX);
        const singleKeyRange = IDBKeyRange.only(filename);

        const request = index.openCursor(singleKeyRange);

        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest<IDBCursorWithValue>)
            .result;
          if (cursor) {
            const request = cursor.delete();
            request.onsuccess = (e) => resolve(e);
            request.onerror = (e) => {
              console.log("DB: 'delete' failed ", e);
              reject();
            };
          }
        };

        request.onerror = (e) => {
          console.log("DB: 'delete' failed ", e);
          reject();
        };
      });
  };

  getRead = () => {
    const indexObjectStore = this.createTransaction("readonly");
    const index = indexObjectStore.index(FILENAME_INDEX);
    return (filename: string) =>
      new Promise<HlsDbItem>((resolve, reject) => {
        const request = index.get(filename);
        request.onsuccess = (e) => {
          const result = (e.target as IDBRequest<HlsDbItem>).result;
          resolve(result);
        };
        request.onerror = (e) => {
          console.log("DB: 'read' failed ", e);
          reject();
        };
      });
  };

  getReadAll = () => {
    const indexObjectStore = this.createTransaction("readonly");
    const index = indexObjectStore.index(FILENAME_INDEX);
    return () =>
      new Promise<HlsDbItem[]>((resolve, reject) => {
        const request = index.getAll();
        request.onsuccess = (e) => {
          const result = (e.target as IDBRequest<HlsDbItem[]>).result;
          resolve(result);
        };
        request.onerror = (e) => {
          console.log("DB: 'read ALL' failed");
          reject();
        };
      });
  };
}
