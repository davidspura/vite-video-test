import { createFFmpeg, type FFmpeg } from "@ffmpeg/ffmpeg";
import { TRANSCODER_RESET_TIME } from "../const";
import { decoder } from "../extensions";

export default class Transcoder {
  constructor(private playlist: Playlist) {}
  private ffmpeg!: FFmpeg;
  private initDate = new Date();

  private create = () => {
    this.ffmpeg = createFFmpeg({
      log: false,
      corePath: "/ffmpeg/ffmpeg-core.js",
      wasmPath: "/ffmpeg/ffmpeg-core.wasm",
      workerPath: "/ffmpeg/ffmpeg-core.worker.js",
    });
  };

  init = async () => {
    // create outside of the class
    if (!this.ffmpeg) this.create();
    if (!this.ffmpeg.isLoaded()) {
      console.time("Ffmpegloaded");
      await this.ffmpeg.load();
      console.timeEnd("Ffmpegloaded");
    }
  };

  private sortSegmentFiles = (a: string, b: string) => {
    const segmentNumberA = parseInt(a.match(/\d+/)![0]);
    const segmentNumberB = parseInt(b.match(/\d+/)![0]);
    return segmentNumberA - segmentNumberB;
  };

  private refreshInstance = async () => {
    const now = new Date().getTime();
    if (this.initDate.getTime() + TRANSCODER_RESET_TIME < now) {
      console.log("Creating new FFMPEG instance");
      this.ffmpeg.exit();

      if (!this.ffmpeg.isLoaded()) {
        console.time("Ffmpegloaded");
        await this.ffmpeg.load();
        console.timeEnd("Ffmpegloaded");
      }

      this.initDate = new Date();
    }
  };

  transcode = async ({
    blob,
    includeInitData,
  }: {
    blob: Blob;
    includeInitData?: boolean;
  }) => {
    if (!this.ffmpeg) console.error("Ffmpeg not initialized");

    const arrayBuffer = await blob.arrayBuffer();
    this.ffmpeg.FS("writeFile", "input.webm", new Uint8Array(arrayBuffer));

    const options = [
      "-i",
      "input.webm",
      "-c:a",
      "aac",
      "-c:v",
      "copy",
      "-hls_time",
      "2",
      "-hls_list_size",
      "0",
      "-hls_flags",
      "omit_endlist",
      "-hls_segment_type",
      "fmp4",
      "-hls_segment_filename",
      "segment%01d.m4s",
      "-hls_fmp4_init_filename",
      "init.mp4",
      "playlist.m3u8",
    ];

    // console.time("run-method");
    await this.ffmpeg.run(...options);
    // console.timeEnd("run-method");

    const ffmpegFilenames = this.ffmpeg.FS("readdir", "/");
    const playlistData = this.ffmpeg.FS("readFile", "playlist.m3u8");

    const segmentFilenames = ffmpegFilenames
      .filter((file) => file.includes("segment"))
      .sort(this.sortSegmentFiles);

    const segmentDurations = this.playlist.getDurationsForSegmentsFromPlaylist(
      decoder.decode(playlistData)
    );

    const segmentsData = segmentFilenames.map((filename, index) => {
      const data = this.ffmpeg.FS("readFile", filename);
      this.ffmpeg.FS("unlink", filename);

      return {
        data,
        duration: segmentDurations[index],
      };
    });

    const initData = includeInitData
      ? this.ffmpeg.FS("readFile", "init.mp4")
      : null;

    this.ffmpeg.FS("unlink", "input.webm");
    this.ffmpeg.FS("unlink", "playlist.m3u8");
    this.ffmpeg.FS("unlink", "init.mp4");

    await this.refreshInstance();
    return {
      segmentsData,
      initData,
    };
  };
}
