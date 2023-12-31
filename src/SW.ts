import DB from "./DB";
import { Playlist, getGapInit, getGapSegment } from "./final/Recorder";

export default class SW {
  db: DB | null = null;
  playlist: Playlist | null = null;

  constructor(private workerPath = "/sw.js") {
    this.workerPath = workerPath;
    this.init();
  }

  private init = async () => {
    navigator.serviceWorker.addEventListener("message", async (e) => {
      // console.log("Received request from SW: ", e.data);

      if (!this.db) return;
      if (!this.playlist) return;

      const { type, filename } = e.data;
      const read = this.db.getRead();

      if (type === "file-request") {
        // will be done on CAMERA
        const file = await read(filename);
        console.log("Got file from DB: ", file.filename);
        const event = new CustomEvent("timeline-update", { detail: file });
        document.dispatchEvent(event);
        this.post(file);
      }

      if (type === "initial-playlist-request") {
        // will be done on CAMERA
        const { data, duration, startDate } =
          await this.playlist.generatePlaylist();
        const event = new CustomEvent("duration-update", {
          detail: { duration, startDate },
        });
        document.dispatchEvent(event);
        this.post({ filename, data });
      }
      if (type === "delta-playlist-request") {
        // will be done on CAMERA
        const { data, duration, startDate } =
          await this.playlist.generateDeltaPlaylist();
        const event = new CustomEvent("duration-update", {
          detail: { duration, startDate },
        });
        document.dispatchEvent(event);
        this.post({ filename, data });
      }

      if (type === "gap-init") {
        const data = getGapInit();
        this.post({ data, filename });
      }

      if (type === "gap-segment") {
        const data = getGapSegment();
        this.post({ data, filename });
      }
    });
  };

  private checkForExistingWorker = () => {
    return navigator.serviceWorker.controller;
  };

  private register = async () => {
    console.log("Worker not found, registering...");
    await this.unregister();

    const registration = await navigator.serviceWorker.register(
      this.workerPath
    );
    return new Promise((resolve) => {
      if (!registration.active) {
        const onStateChange = () => {
          if (registration.active?.state === "activated") {
            registration.installing?.removeEventListener(
              "statechange",
              onStateChange
            );
            resolve(1);
          }
        };
        registration.installing?.addEventListener("statechange", onStateChange);
      } else resolve(1);
    });
  };

  start = async () => {
    console.log("About to start worker");
    const worker = this.checkForExistingWorker();
    if (!worker) await this.register();
    console.log("Worker has started");
    return worker as ServiceWorker;
  };

  unregister = async () => {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      await registration.unregister();
    }
  };

  post = (message: any) => {
    navigator.serviceWorker.controller?.postMessage(message);
  };
}
