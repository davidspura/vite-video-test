import DB from "./DB";
import { Timeline } from "./Player";
import { Playlist } from "./final/Recorder";

export default class SW {
  db: DB | null = null;
  playlist: Playlist | null = null;

  constructor(private timeline: Timeline, private workerPath = "/sw.js") {
    this.workerPath = workerPath;
    this.timeline = timeline;
    this.init();
  }

  private init = async () => {
    navigator.serviceWorker.addEventListener("message", async (e) => {
      // console.log("Received request from SW: ", e.data);

      if (!this.db) return;
      if (!this.playlist) return;

      const { type, filename } = e.data;

      if (type === "file-request") {
        // will be done on CAMERA
        const file = await this.db.getRead()(filename);
        console.log("Got file from DB: ", file.filename);
        this.post(file);
      }

      if (type === "initial-playlist-request") {
        // will be done on CAMERA
        const { data, duration, startDate } =
          await this.playlist.generatePlaylist();
        this.timeline.update(duration);
        this.post({ filename, data });
      }
      if (type === "delta-playlist-request") {
        // will be done on CAMERA
        const { data, duration, startDate } =
          await this.playlist.generateDeltaPlaylist();
        this.timeline.update(duration);
        this.post({ filename, data });
      }

      // if (e.data.type === "file-data") {
      //   console.log("got file data: ", e.data);
      // }
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
