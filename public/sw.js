console.log("Alive");

const INITIAL_PLAYLIST = "playlist.m3u8";
const DELTA_PLAYLIST = "playlist.m3u8?_HLS_skip=YES";

const requests = new Map();
const hslFilenames = [".m4s", ".mp4", ".m3u8"];

self.addEventListener("activate", (event) => {
  console.log("Activate event fired, claiming...");
  event.waitUntil(clients.claim());
});

self.addEventListener("install", (event) => {
  console.log("Install event fired ");
});

self.addEventListener("fetch", async (event) => {
  if (hslFilenames.some((f) => event.request.url.includes(f))) {
    const filename = event.request.url.split("/").pop();

    event.respondWith(
      (async () => {
        if (filename === INITIAL_PLAYLIST)
          send("initial-playlist-request", { filename });
        else if (filename.includes(DELTA_PLAYLIST))
          send("delta-playlist-request", { filename });
        else if (filename.startsWith("g") && filename.endsWith(".mp4")) {
          send("gap-init", { filename });
        } else if (filename.startsWith("g") && filename.endsWith(".m4s")) {
          send("gap-segment", { filename });
        } else send("file-request", { filename });

        try {
          const file = await waitForFile(filename);

          // send("file-data", file);
          // console.timeEnd("fetch");
          return new Response(file.data);
        } catch (err) {
          return new Response("Error");
        }
      })()
    );
  }
});

const waitForFile = async (filename) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject();
    }, 5000);
    requests.set(filename, (data) => {
      clearTimeout(timeout);
      resolve(data);
    });
  });
};

const send = async (type, payload) => {
  const message = {
    type,
    ...payload,
  };

  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage(message);
  });
};

self.addEventListener("message", (event) => {
  if (requests.has(event.data?.filename)) {
    requests.get(event.data.filename)(event.data);
    requests.delete(event.data.filename);
  }
});
