import { FFmpeg, createFFmpeg } from "@ffmpeg/ffmpeg";
import DB from "../DB";

const SEGMENT_LENGTH = 10000; // 10 seconds split into 2 second segment in Transcoder
const SEGMENT_INDEX_REGEX = /segment(\d+)\.m4s/g;
const INIT_INDEX_REGEX = /init(\d+)\.mp4/g;
const SEGMENT_DURATION_REGEX = /#EXTINF:([\d.]+),/g;

const decoder = new TextDecoder();
const encoder = new TextEncoder();

export default class Recorder {
  private mediaRecorder: MediaRecorder;
  constructor(private stream: MediaStream) {
    this.mediaRecorder = new MediaRecorder(this.stream);
    this.mediaRecorder.addEventListener("dataavailable", this.onDataAvailable);
  }
  private timeout: number | null = null;
  private hasCreatedInitFile = false;
  private isTranscoding = false;

  private sourceDates: Date[] = [];
  private trancoderQue: { date: Date; blob: Blob }[] = [];

  db = new DB();
  private playlist = new Playlist(this.db);
  private transcoder = new Transcoder(this.playlist);

  status: "idle" | "recording" = "idle";

  init = async () => {
    await this.db.init();
    await this.playlist.create();
    await this.transcoder.init();
  };

  start = () => {
    this.startRecordingSourceVideo();
  };

  stop = () => {
    console.log("Stop called");
    if (this.timeout) clearTimeout(this.timeout);
    this.status = "idle";
    this.mediaRecorder?.stop();
  };

  private createSourceVideo = () => {
    if (this.status === "idle") {
      console.warn("Recorder is in idle state, but createSourceVideo fired");
      return;
    }

    this.mediaRecorder?.start();
    const sourceVideoDate = new Date();
    this.sourceDates.push(sourceVideoDate);
    console.log("expected next sourceVideoDate: ", sourceVideoDate.getTime());

    console.log("Called mediaRecorder.start()");
    this.timeout = setTimeout(() => {
      this.mediaRecorder?.stop();
      console.log("Called mediaRecorder.stop()");
      this.createSourceVideo();
    }, SEGMENT_LENGTH);
  };

  private startRecordingSourceVideo = () => {
    if (this.status === "recording") return;
    console.log("Starting creating segments");
    this.status = "recording";
    this.createSourceVideo();
  };

  private onDataAvailable = async (event: BlobEvent) => {
    // // remove the condition once que is implemented
    // if (this.status === "idle") return;

    console.log("OnDataAvailable fired");
    const sourceVideoDate = this.sourceDates.shift()!;

    if (this.isTranscoding) {
      console.log("Transcoding in progress, adding to que...");
      this.trancoderQue.push({ date: sourceVideoDate, blob: event.data });
      return;
    }

    try {
      this.isTranscoding = true;
      await this.transcode(event.data, sourceVideoDate);
      if (!this.hasCreatedInitFile) this.hasCreatedInitFile = true;

      while (this.trancoderQue.length > 0) {
        console.log("Found items in que: ", this.trancoderQue);
        const { date, blob } = this.trancoderQue.shift()!;
        await this.transcode(blob, date);
      }
      this.isTranscoding = false;
    } catch (err) {
      console.log("Error while transcoding", err);
    }
  };

  private transcode = async (blob: Blob, sourceVideoDate: Date) => {
    const { initData, segmentsData } = await this.transcoder.transcode({
      blob,
      includeInitData: !this.hasCreatedInitFile,
    });

    console.log("Finished transcoding");

    const sourceVideoTime = sourceVideoDate.getTime();
    const sourceVideoDateISO = sourceVideoDate.toISOString();

    if (initData) {
      const initPayload = {
        filename: `init${sourceVideoTime}.mp4`,
        data: initData,
        createdAt: new Date().toISOString(),
        rotation: "horizontal",
      } as const;
      await this.db.getWrite()(initPayload);
      await this.playlist.addInit(initPayload.filename, sourceVideoDateISO);
    }

    const segmentDate = new Date(sourceVideoDate);

    const write = this.db.getWrite();
    const segmentFiles = segmentsData.map((segment) => {
      const { data, duration } = segment;
      segmentDate.setMilliseconds(
        segmentDate.getMilliseconds() + Number(duration) * 1000
      );
      const segmentTime = segmentDate.getTime();

      const segmentPayload = {
        filename: `segment${segmentTime}.m4s`,
        data,
        createdAt: new Date().toISOString(),
        rotation: "horizontal",
      } as const;
      write(segmentPayload);
      return { duration, filename: segmentPayload.filename };
    });

    this.playlist.addSegments(segmentFiles, sourceVideoDateISO);
  };
}

export class Playlist {
  constructor(private db: DB) {}
  private initialPlaylist = `#EXTM3U
#EXT-X-VERSION:7
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0`;
  name = "playlist.m3u8";
  playlist: string | null = null;

  create = async () => {
    const playlistFile = await this.db.getRead()(this.name);
    if (playlistFile) this.playlist = playlistFile.data as string;
    else this.playlist = this.initialPlaylist;
    console.log("current playlist: ", this.playlist);
  };

  private readAllFromPlaylist = (regex: RegExp, playlist = this.playlist) => {
    let match: null | RegExpExecArray;
    const result: string[] = [];
    if (!playlist) {
      console.error("Trying to get read from playlist which is null");
      return result;
    }
    while ((match = regex.exec(playlist)) !== null) {
      result.push(match[1]);
    }
    return result;
  };

  getDurationsForSegmentsFromPlaylist = (playlist: string) => {
    return this.readAllFromPlaylist(SEGMENT_DURATION_REGEX, playlist);
  };

  private update = async (data: string) => {
    if (!this.playlist)
      throw Error("Couldn't update playlist, this.playlist is null");
    this.playlist = this.playlist.concat("\n" + data);
    console.log("Updated playlist: ", this.playlist);

    const payload = {
      filename: this.name,
      data: this.playlist,
      createdAt: new Date().toISOString(),
      rotation: "horizontal",
    } as const;

    await this.db.getWrite()(payload);
  };

  addSegments = async (
    segmentFiles: {
      filename: string;
      duration: string;
    }[],
    programDate: string
  ) => {
    const segments = segmentFiles.reduce((acc, segment, i) => {
      const isLast = i === segmentFiles.length - 1;
      const { duration, filename } = segment;
      return acc + `#EXTINF:${duration},\n${filename}` + (isLast ? "" : "\n");
    }, `#EXT-X-PROGRAM-DATE-TIME:${programDate}\n#EXT-X-DISCONTINUITY\n`);

    await this.update(segments);
  };

  addInit = async (filename: string, programDate: string) => {
    const init = `#EXT-X-PROGRAM-DATE-TIME:${programDate}\n#EXT-X-MAP:URI="${filename}"`;
    await this.update(init);
  };
}

export class Transcoder {
  constructor(private playlist: Playlist) {}
  private ffmpeg!: FFmpeg;

  init = async () => {
    // create outside of the class
    if (!this.ffmpeg) this.ffmpeg = createFFmpeg({ log: false });
    if (!this.ffmpeg.isLoaded()) await this.ffmpeg.load();
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
      "h264",
      "-hls_time",
      "2",
      "-hls_list_size",
      "0",
      "-hls_flags",
      //   "append_list+omit_endlist",
      "omit_endlist",
      "-hls_segment_type",
      "fmp4",
      "-force_key_frames",
      "expr:gte(t,n_forced*1)",
      "-hls_segment_filename",
      "segment%01d.m4s",
      "-hls_fmp4_init_filename",
      "init.mp4",
      "playlist.m3u8",
    ];

    await this.ffmpeg.run(...options);

    const ffmpegFilenames = this.ffmpeg.FS("readdir", "/");
    const playlistData = this.ffmpeg.FS("readFile", "playlist.m3u8");
    console.log("Generated playlist: ", decoder.decode(playlistData));
    console.log(ffmpegFilenames);

    const segmentFilenames = ffmpegFilenames.filter((file) =>
      file.includes("segment")
    );

    const segmentDurations = this.playlist.getDurationsForSegmentsFromPlaylist(
      decoder.decode(playlistData)
    );
    console.log("segment durations: ", segmentDurations);

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

    return {
      segmentsData,
      initData,
    };
  };
}
