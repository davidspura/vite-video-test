import { loadPreview } from "../utils";
import Recorder from "../final/Recorder";
// import { createFFmpeg } from "@ffmpeg/ffmpeg";

import SW from "../SW";

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

// const ffmpeg = createFFmpeg({ log: false });
// if (!ffmpeg.isLoaded())
//   ffmpeg.load().then(() => {
//     console.log("ffmpeg appended to window");
//   });
// window.ffmpeg = ffmpeg;

export default async function createMediaRecorder() {
  const sw = new SW();
  const stream = await loadPreview();
  const recorder = new Recorder(stream);

  await recorder.init();
  sw.db = recorder.db;
  sw.playlist = recorder.playlist;
  await sw.start();

  window.download = async () => {
    const files = await recorder.db.getReadAll()();

    const chunkSize = 10;
    for (let i = 0; i < files.length; i += chunkSize) {
      const chunk = files.slice(i, i + chunkSize);
      download(chunk);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    function download(f: (HlsDbItem | HlsDbPlaylist)[]) {
      for (const file of f) {
        const url = URL.createObjectURL(
          new Blob([file.data], { type: "application/octet-stream" })
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = file.filename;
        a.click();
        a.remove();
      }
    }
  };

  return recorder;
}
