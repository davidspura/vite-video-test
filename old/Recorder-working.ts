import { FFmpeg, createFFmpeg } from "@ffmpeg/ffmpeg";
import DB from "../DB";

// type TranscodePayload = {
//   blob: Blob;
//   segmentFilename: `segment${number}.m4s`;
//   initFilename?: `init${number}.mp4`;
// };

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
    this.startCreatingSegments();
  };

  stop = () => {
    if (this.timeout) clearTimeout(this.timeout);
    this.status = "idle";
    this.mediaRecorder?.stop();
  };

  private createSegment = () => {
    if (this.status === "idle") {
      console.warn("Recorder is in idle state, but createSegment fired");
      return;
    }
    this.mediaRecorder?.start();
    console.log("Called mediaRecorder.start()");
    this.timeout = setTimeout(() => {
      this.mediaRecorder?.stop();
      console.log("Called mediaRecorder.stop()");
      this.createSegment();
    }, SEGMENT_LENGTH);
  };

  private startCreatingSegments = () => {
    if (this.status === "recording") return;
    console.log("Starting creating segments");
    this.status = "recording";
    this.createSegment();
  };

  private onDataAvailable = async (event: BlobEvent) => {
    const segmentIndex = this.playlist.getLatestSegmentIndex();
    const payload = {
      blob: event.data,
      ...(!this.hasCreatedInitFile &&
        ({
          initFilename: `init${this.playlist.getLatestInitIndex()}.mp4`,
        } as const)),
    } as const;

    try {
      await this.transcode(payload, segmentIndex);
      if (!this.hasCreatedInitFile) this.hasCreatedInitFile = true;
    } catch (err) {
      console.log("Error while transcoding", err);
    }
  };

  private transcode = async (
    payload: { initFilename?: string; blob: Blob },
    segmentIndex: number
  ) => {
    const { initFilename, blob } = payload;

    const { initData, segmentsData } = await this.transcoder.transcode({
      blob,
      includeInitData: Boolean(initFilename),
      startingSegmentIndex: segmentIndex,
    });
    console.log("Finished transcoding");

    this.playlist.setNextSegmentIndex(segmentsData.length);

    if (initData && initFilename) {
      const initPayload = {
        filename: initFilename,
        data: initData,
        createdAt: new Date().toString(),
        rotation: "horizontal",
      } as const;
      this.db.write(initPayload);
      await this.playlist.addInit(initFilename);
    }

    segmentsData.forEach((segment) => {
      const { data, filename } = segment;
      const segmentPayload = {
        filename,
        data,
        createdAt: new Date().toString(),
        rotation: "horizontal",
      } as const;
      this.db.write(segmentPayload);
    });

    this.playlist.addSegments(segmentsData);
  };
}

export class Playlist {
  constructor(private db: DB) {}
  private initialPlaylist = `#EXTM3U
  #EXT-X-VERSION:7
  #EXT-X-TARGETDURATION:2
  #EXT-X-MEDIA-SEQUENCE:0`;
  filename = "playlist.m3u8";
  playlist: string | null = null;

  private latestSegmentIndex = 0;
  private latestInitIndex = 0;

  create = async () => {
    const playlistFile = await this.db.read(this.filename);
    if (playlistFile) {
      this.playlist = playlistFile.data as string;
      this.populateIndexes();
    } else this.playlist = this.initialPlaylist;

    console.log("current playlist: ", this.playlist);
  };

  private populateIndexes = () => {
    this.latestSegmentIndex =
      parseInt(this.readFromPlaylist(SEGMENT_INDEX_REGEX)) + 1;
    this.latestInitIndex =
      parseInt(this.readFromPlaylist(INIT_INDEX_REGEX)) + 1;
  };

  private readFromPlaylist = (regex: RegExp, playlist = this.playlist) => {
    let match: null | RegExpExecArray;
    let latestIndex = "0";

    if (!playlist) {
      console.error("Trying to get read from playlist which is null");
      return latestIndex;
    }
    while ((match = regex.exec(playlist)) !== null) {
      latestIndex = match[1];
    }
    console.log("Index from playlist: ", latestIndex);
    return latestIndex;
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

  setNextSegmentIndex = (segmentIndex: number) => {
    this.latestSegmentIndex += segmentIndex;
    console.log("Updated latestSegmentIndex: ", this.latestSegmentIndex);
  };

  private getNextSafeInteger = (integer: number) => {
    if (integer >= Number.MAX_SAFE_INTEGER) {
      console.warn("Integer is equal or bigger then Number.MAX_SAFE_INTEGER");
      return 0;
    }
    return integer;
  };

  getDurationsForSegmentsFromPlaylist = (playlist: string) => {
    return this.readAllFromPlaylist(SEGMENT_DURATION_REGEX, playlist);
  };

  getLatestSegmentIndex = () =>
    this.getNextSafeInteger(this.latestSegmentIndex);
  getLatestInitIndex = () => {
    const nextSafeInteger = this.getNextSafeInteger(this.latestInitIndex);
    this.latestInitIndex++;
    return nextSafeInteger;
  };

  private update = async (data: string) => {
    if (!this.playlist)
      throw Error("Couldn't update playlist, this.playlist is null");
    this.playlist = this.playlist.concat("\n" + data);
    console.log("Updated playlist: ", this.playlist);

    const payload = {
      filename: this.filename,
      data: this.playlist,
      createdAt: new Date().toString(),
      rotation: "horizontal",
    } as const;

    await this.db.write(payload);
  };

  addSegments = async (
    segmentsData: {
      filename: string;
      duration: string;
      data: Uint8Array;
    }[]
  ) => {
    console.log("segmentsData in addSegments: ", segmentsData);
    const segments = segmentsData.reduce((acc, segment, i) => {
      const isLastSegment = i === segmentsData.length - 1;
      const { duration, filename } = segment;

      const segmentInfo = `#EXTINF:${duration},\n${filename}`;
      return acc + segmentInfo + (isLastSegment ? "" : "\n");
    }, "#EXT-X-DISCONTINUITY\n");

    console.log("about to add segments: ", segments);
    await this.update(segments);
  };

  addInit = async (filename: string) => {
    const init = `#EXT-X-MAP:URI="${filename}"`;
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
    startingSegmentIndex,
  }: {
    blob: Blob;
    includeInitData?: boolean;
    startingSegmentIndex: number;
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
      "append_list+omit_endlist",
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

    let nextSegmentIndex = startingSegmentIndex;

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

      const indexedFilename = `segment${nextSegmentIndex}.m4s`;
      nextSegmentIndex++;

      return {
        data,
        filename: indexedFilename,
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
