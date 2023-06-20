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
  private store: IDBObjectStore | null = null;

  constructor() {
    window.db = {
      write: this.write,
      delete: this.delete,
      read: this.read,
      reset: () =>
        (indexedDB.deleteDatabase(DB_NAME).onsuccess = () =>
          console.log(`${DB_NAME} deleted`)),
    };
  }

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
    // const promise = new Promise((resolve, reject) => {
    transaction.oncomplete = (e) => {
      this.store = null;
      console.log("Transaction complete ", e);
      // resolve(e);
    };
    transaction.onerror = (e) => {
      this.store = null;
      console.log("Transaction failed ", e);
      // reject();
    };
    transaction.onabort = (e) => {
      this.store = null;
      console.log("Transaction aborted ", e);
    };
    // });
    return {
      objectStore,
      //  promise
    };
  };

  private getStore = (mode: IDBTransactionMode) => {
    // temp workaround
    // if (!this.store) {
    const { objectStore } = this.createTransaction(mode);
    return objectStore;
    //   this.store = objectStore;
    // }
    // return this.store;
  };

  write = async (hlsItem: HlsDbItem | HlsDbPlaylist) => {
    return new Promise((resolve, reject) => {
      const objectStore = this.getStore("readwrite");
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

  delete = async (filename: string) => {
    return new Promise((resolve, reject) => {
      const objectStore = this.getStore("readwrite");
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

  read = async (filename: string) => {
    return new Promise<HlsDbItem | HlsDbPlaylist>((resolve, reject) => {
      const objectStore = this.getStore("readonly");
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

  readAll = async () => {
    return new Promise<(HlsDbItem | HlsDbPlaylist)[]>((resolve, reject) => {
      const objectStore = this.getStore("readonly");
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
