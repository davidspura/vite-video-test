type HlsDbItem = {
  filename: string;
  data: Uint8Array;
  createdAt: string;
  rotation: "horizontal";
};

type HlsDbPlaylist = {
  filename: string;
  data: string;
  createdAt: string;
  rotation: "horizontal";
};

const DB_NAME = "hls-database";
const STORE_NAME = "hls-files";

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
          keyPath: "filename",
        });
        objectStore.transaction.oncomplete = (event) => {
          console.log("Object store created ", event);
        };
      };
    });
  };

  private createTransaction = (mode: IDBTransactionMode) => {
    if (!this.db) throw Error("Transaction couldn't be created, db is null");
    console.log("Creating transaction");
    const transaction = this.db.transaction(STORE_NAME, mode);
    const objectStore = transaction.objectStore(STORE_NAME);
    transaction.oncomplete = (e) => {
      console.log("Transaction complete ", e);
    };
    transaction.onerror = (e) => {
      console.log("Transaction failed ", e);
    };
    transaction.onabort = (e) => {
      console.log("Transaction aborted ", e);
    };
    return objectStore;
  };

  getWrite = () => {
    const objectStore = this.createTransaction("readwrite");
    return (hlsItem: HlsDbItem | HlsDbPlaylist) =>
      new Promise((resolve, reject) => {
        const request = objectStore.put(hlsItem);
        request.onsuccess = (e) => {
          console.log("DB 'write' OK");
          resolve(e);
        };
        request.onerror = (e) => {
          console.log("DB 'write' failed ", e);
          reject();
        };
      });
  };

  getDelete = () => {
    const objectStore = this.createTransaction("readwrite");
    return (filename: string) =>
      new Promise((resolve, reject) => {
        const request = objectStore.delete(filename);
        request.onsuccess = (e) => {
          console.log("DB 'delete' OK");
          resolve(e);
        };
        request.onerror = (e) => {
          console.log("DB 'delete' failed");
          reject();
        };
      });
  };

  getRead = () => {
    const objectStore = this.createTransaction("readwrite");
    return (filename: string) =>
      new Promise<HlsDbItem | HlsDbPlaylist>((resolve, reject) => {
        const request = objectStore.get(filename);
        request.onsuccess = (e) => {
          const result = (e.target as IDBRequest<HlsDbItem | HlsDbPlaylist>)
            .result;
          console.log("DB 'read' OK: ", result);
          resolve(result);
        };
        request.onerror = (e) => {
          console.log("DB 'read' failed ", e);
          reject();
        };
      });
  };

  getReadAll = () => {
    const objectStore = this.createTransaction("readwrite");
    return () =>
      new Promise<(HlsDbItem | HlsDbPlaylist)[]>((resolve, reject) => {
        const request = objectStore.getAll();
        request.onsuccess = (e) => {
          const result = (e.target as IDBRequest<(HlsDbItem | HlsDbPlaylist)[]>)
            .result;
          console.log("DB 'read ALL' OK");
          resolve(result);
        };
        request.onerror = (e) => {
          console.log("DB 'read ALL' failed");
          reject();
        };
      });
  };
}
