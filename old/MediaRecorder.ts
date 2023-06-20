import ISOBoxer from "codem-isoboxer";
import { createFFmpeg } from "@ffmpeg/ffmpeg";
import { nanoid } from "nanoid";
import { loadPreview, SLICE_IN_MS } from "../utils";
import DB from "../DB";

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

let log = "";
const ffmpeg = createFFmpeg();
ffmpeg.setLogger(({ type, message }) => {
  log += message + "\n";
  if (message.includes("failed")) console.log(message);
});
ffmpeg.setLogging(false);
const db = new DB();

export default async function createMediaRecorder() {
  const stream = await loadPreview();
  await db.init();
  if (!ffmpeg.isLoaded()) await ffmpeg.load();

  const textDecoder = new TextDecoder();

  let index = 0;
  const recorder = new MediaRecorder(stream);

  const data = [];
  recorder.ondataavailable = async (e) => {
    // console.log("Received data: ", e.data);
    // data.push(e.data);
    transcode(e.data);
  };

  let hasInit = false;

  const transcode = async (chunk: Blob) => {
    log = "";
    // const filename = `segment${index}.m4s`;
    const arrayBuffer = await chunk.arrayBuffer();
    ffmpeg.FS("writeFile", "input.webm", new Uint8Array(arrayBuffer));

    console.time("TranscodingTime");
    await ffmpeg.run(
      "-i",
      "input.webm",
      "-c:a",
      "aac",
      "-c:v",
      "h264",
      "-hls_time",
      "2",
      "-hls_list_size",
      "0",
      "-hls_flags",
      "append_list+omit_endlist",
      "-hls_segment_type",
      "fmp4",
      "-force_key_frames",
      "expr:gte(t,n_forced*1)",
      "-hls_segment_filename",
      "segment%01d.m4s",
      "-hls_fmp4_init_filename",
      "init.mp4",
      "playlist.m3u8"
    );

    // console.log(ffmpeg.FS("readdir", "/"));
    const playlistContent = ffmpeg.FS("readFile", "playlist.m3u8");
    const initData = ffmpeg.FS("readFile", "init.mp4");
    // const segmentData = ffmpeg.FS("readFile", `segment${index}.m4s`);
    // console.log(textDecoder.decode(playlistContent));

    // read all files in the output directory that have segment in the name and unlink them after
    const files = ffmpeg.FS("readdir", "/");
    const segmentFilenames = files.filter((file) => file.includes("segment"));

    const write = db.getWrite();
    write({
      data: playlistContent,
      filename: "playlist.m3u8",
      createdAt: new Date().toString(),
      rotation: "horizontal",
    });

    if (!hasInit) {
      hasInit = true;
      write({
        filename: "init.mp4",
        data: initData,
        createdAt: new Date().toString(),
        rotation: "horizontal",
      });
    }

    for (const filename of segmentFilenames) {
      const segmentData = ffmpeg.FS("readFile", filename);
      ffmpeg.FS("unlink", filename);
      write({
        filename,
        data: segmentData,
        createdAt: new Date().toString(),
        rotation: "horizontal",
      });
    }

    console.timeEnd("TranscodingTime");
    // index++;

    // const segmentData = ffmpeg.FS("readFile", `segment${index}.m4s`);

    // const segmentData = ffmpeg.FS("readFile", `out${index}.m4s`);
    // 7,8 bit, 2===keyframe
    // sample_size
    // data_offest
    // size@offset
    // const parsedFile = ISOBoxer.parseBuffer(segmentData.buffer);
    // const moof = parsedFile.fetch("moof");

    // const trafs = moof.boxes.filter((b) => b.type === "traf");

    // trafs.forEach((traf) => {
    //   const truns = traf.boxes.filter((b) => b.type === "trun");
    //   truns.forEach((trun) => {
    //     let offset = trun.data_offset;
    //     trun.samples?.forEach((sample) => {
    //       if (sample.sample_flags) {
    //         const num = (sample.sample_flags & 0x03000000) >> 24;
    //         const isKeyframe = num === 2;
    //         if (isKeyframe) {
    //           console.log(`${sample.sample_size}@${offset}`);
    //         }
    //       }
    //       if (offset && sample.sample_size) offset += sample.sample_size;
    //     });
    //   });
    // });

    // console.log(ffmpeg.FS("readdir", "/"));
    // const keyframePlaylistContent = ffmpeg.FS("readFile", "keyframe.m3u8");
    // console.log(textDecoder.decode(keyframePlaylistContent));
  };

  window.download = async () => {
    // const fileNames = [".mp4", ".m3u8", ".m4s"];
    // const files = ffmpeg.FS("readdir", "/");
    // console.log("downloading files: ", files);

    // for (const file of files) {
    //   if (fileNames.some((f) => file.includes(f))) {
    //     const data = ffmpeg.FS("readFile", file);
    //     await db.write({
    //       createdAt: new Date().toISOString(),
    //       data,
    //       filename: file,
    //       rotation: "horizontal",
    //     });
    //   }
    // }

    // await new Promise((resolve) => setTimeout(resolve, 5000));

    const dbfiles = await db.getReadAll()();

    const chunkSize = 10;
    for (let i = 0; i < dbfiles.length; i += chunkSize) {
      const chunk = dbfiles.slice(i, i + chunkSize);
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

    // const chunkSize = 10;
    // for (let i = 0; i < files.length; i += chunkSize) {
    //   const chunk = files.slice(i, i + chunkSize);
    //   download(chunk);
    //   await new Promise((resolve) => setTimeout(resolve, 1000));
    // }

    // function download(f: string[]) {
    //   for (const file of f) {
    //     if (fileNames.some((f) => file.includes(f))) {
    //       const data = ffmpeg.FS("readFile", file);
    //       const url = URL.createObjectURL(
    //         new Blob([data.buffer], { type: "application/octet-stream" })
    //       );
    //       const a = document.createElement("a");
    //       a.href = url;
    //       a.download = file;
    //       a.click();
    //       a.remove();
    //     }
    //   }
    // }
  };

  let stop = false;
  // let intervalId: number;

  window.stop = () => {
    stop = true;
    // recorder.stop();
    // clearInterval(intervalId);
  };

  const record = () => {
    // recorder.start();
    // intervalId = setInterval(() => {
    //   new Promise((resolve) => {
    //     recorder.onstop = resolve;
    //     recorder.stop();
    //   }).then(() => {
    //     recorder.start();
    //   });
    // }, 6000);

    stop = false;
    recorder.start();

    setTimeout(() => {
      recorder.stop();
      if (stop) return;
      console.log("Recorder stopped");
      record();
    }, SLICE_IN_MS);
    // }, 5 * 60 * 1000);
    // }, 6000);
  };

  return record;
}
