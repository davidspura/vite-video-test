import { FFmpeg } from "@ffmpeg/ffmpeg";
import { TRANSCODER_RESET_TIME } from "../const";
import { decoder } from "../extensions";

export default class Transcoder {
  constructor(private playlist: Playlist) {}
  private ffmpeg!: FFmpeg;
  private initDate = new Date();

  private create = async () => {
    this.ffmpeg = new FFmpeg();
    await this.ffmpeg.load({
      coreURL: `${location.origin}/ffmpeg/ffmpeg-core.js`,
      wasmURL: `${location.origin}/ffmpeg/ffmpeg-core.wasm`,
    });
  };

  init = async () => {
    // create outside of the class
    if (!this.ffmpeg) await this.create();
    if (!this.ffmpeg.loaded) {
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
      this.ffmpeg.terminate();

      if (!this.ffmpeg.loaded) {
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
    this.ffmpeg.writeFile("input.webm", new Uint8Array(arrayBuffer));

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
    await this.ffmpeg.exec(options);
    // console.timeEnd("run-method");

    const ffmpegFilenames = (await this.ffmpeg.listDir("/")).map(
      (fsnode) => fsnode.name
    );
    const playlistData = (await this.ffmpeg.readFile(
      "playlist.m3u8"
    )) as Uint8Array;

    const segmentFilenames = ffmpegFilenames
      .filter((file) => file.includes("segment"))
      .sort(this.sortSegmentFiles);

    const segmentDurations = this.playlist.getDurationsForSegmentsFromPlaylist(
      decoder.decode(playlistData)
    );

    const segmentsData = await Promise.all(
      segmentFilenames.map(async (filename, index) => {
        const data = (await this.ffmpeg.readFile(filename)) as Uint8Array;
        this.ffmpeg.deleteFile(filename);

        return {
          data,
          duration: segmentDurations[index],
        };
      })
    );

    const initData = includeInitData
      ? ((await this.ffmpeg.readFile("init.mp4")) as Uint8Array)
      : null;

    this.ffmpeg.deleteFile("input.webm");
    this.ffmpeg.deleteFile("playlist.m3u8");
    this.ffmpeg.deleteFile("init.mp4");

    await this.refreshInstance();
    return {
      segmentsData,
      initData,
    };
  };
}
