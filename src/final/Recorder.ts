import { FFmpeg, createFFmpeg } from "@ffmpeg/ffmpeg";
import DB, { HlsDbItem } from "../DB";

const SEGMENT_LENGTH = 10000; // 10 seconds split into 2 second segment in Transcoder
// const SEGMENT_LENGTH = 2000;
const SEGMENT_INDEX_REGEX = /s(\d+)\.m4s/;
const INIT_INDEX_REGEX = /i(\d+)\.mp4/;
const SEGMENT_DURATION_REGEX = /#EXTINF:([\d.]+),/g;
// const TRANSCODER_RESET_TIME = 2 * 60000; // 2 minutes
const TRANSCODER_RESET_TIME = 30000;

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

  //   private sourceDates: Date[] = [];
  private sourceDate: Date = new Date();
  private trancoderQue: Blob[] = [];

  db = new DB();
  playlist = new Playlist(this.db);
  private transcoder = new Transcoder(this.playlist);

  status: "idle" | "recording" = "idle";

  init = async () => {
    await this.db.init();
    await this.playlist.init();
    await this.transcoder.init();

    // this.playlist.generatePlaylist();
    // setTimeout(() => {
    //   this.playlist.generateDeltaPlaylist();
    // }, 1000);
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

    // const sourceVideoDate = new Date();
    // this.sourceDates.push(sourceVideoDate);
    this.mediaRecorder?.start();

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
    this.sourceDate = new Date();
    this.createSourceVideo();
  };

  private onDataAvailable = async (event: BlobEvent) => {
    console.log("OnDataAvailable fired");
    // const sourceVideoDate = this.sourceDates.shift()!;

    if (this.isTranscoding) {
      console.log("Transcoding in progress, adding to que...");
      this.trancoderQue.push(event.data);
      return;
    }

    try {
      this.isTranscoding = true;
      await this.transcode(event.data);
      if (!this.hasCreatedInitFile) this.hasCreatedInitFile = true;

      while (this.trancoderQue.length > 0) {
        console.log("Found items in que: ", this.trancoderQue);
        await this.transcode(this.trancoderQue.shift()!);
      }
      this.isTranscoding = false;
    } catch (err) {
      console.log("Error while transcoding", err);
      this.isTranscoding = false;
    }
  };

  private transcode = async (blob: Blob) => {
    console.time("transcoding-time");
    const { initData, segmentsData } = await this.transcoder.transcode({
      blob,
      includeInitData: !this.hasCreatedInitFile,
    });

    console.timeEnd("transcoding-time");

    if (initData) {
      const index = this.playlist.getLatestInitIndex();
      const initPayload = {
        filename: `i${index}.mp4`,
        data: initData,
        createdAt: this.sourceDate.toISOString(),
        rotation: "horizontal",
        duration: null,
        discontinuity: false,
        index,
      } as const;
      await this.db.getWrite()(initPayload);
      this.playlist.addToNextInitIndex(1);
    }

    const segmentStartIndex = this.playlist.getLatestSegmentIndex();
    // const segmentStartDate = new Date(sourceVideoDate);
    const write = this.db.getWrite();

    let i = 0;
    for (const segment of segmentsData) {
      const { data, duration } = segment;
      const index = segmentStartIndex + i;
      const segmentPayload = {
        filename: `s${index}.m4s`,
        data,
        duration,
        createdAt: this.sourceDate.toISOString(),
        rotation: "horizontal",
        discontinuity: i === 0,
        index,
      } as const;
      await write(segmentPayload);
      console.log("DONE saving segment ", index);

      this.sourceDate.setMilliseconds(
        this.sourceDate.getMilliseconds() + Number(duration) * 1000
      );
      i++;
    }

    this.playlist.addToNextSegmentIndex(segmentsData.length);
    this.playlist.lastSentDeltaPlaylist = null;
  };
}

export class Playlist {
  constructor(private db: DB) {}
  private latestSegmentIndex = 0;
  private latestInitIndex = 0;
  lastSentSegment: HlsDbItem | null = null;
  lastSentInit: HlsDbItem | null = null;

  lastSentDeltaPlaylist: {
    data: Uint8Array;
    startDate: string;
    duration: number;
  } | null = null;
  discontinuitySequence: number = 0;
  //   name = "playlist.m3u8";

  init = async () => {
    const { initIndex, segmentIndex } = await this.populateInitialIndexes();
    this.latestInitIndex = initIndex;
    this.latestSegmentIndex = segmentIndex;
    console.log("Initial init index ", this.latestInitIndex);
    console.log("Initial segment index ", this.latestSegmentIndex);
  };

  private populateInitialIndexes = () => {
    const cursor = this.db.getCursor("createdAt");
    const request = cursor.openCursor(null, "prev");

    let segmentIndex: number;
    let initIndex: number;

    return new Promise<{ segmentIndex: number; initIndex: number }>(
      (resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const record = cursor.value as HlsDbItem;
            if (!segmentIndex && record.filename.startsWith("s")) {
              segmentIndex = record.index + 1;
            }
            if (!initIndex && record.filename.startsWith("i")) {
              initIndex = record.index + 1;
            }

            if (segmentIndex != null && initIndex != null) {
              console.log(
                "Found both indexes ",
                initIndex,
                "and",
                segmentIndex
              );
              resolve({ segmentIndex, initIndex });
            } else {
              cursor.continue();
            }
          } else {
            console.log("Cursor finished");
            resolve({
              segmentIndex: segmentIndex || 0,
              initIndex: initIndex || 0,
            });
          }
        };
        request.onerror = (e) => {
          console.log("Cursor failed: ", e);
          reject();
        };
      }
    );
  };

  private createDiscontinuity = (programDate: string) =>
    `#EXT-X-PROGRAM-DATE-TIME:${programDate}\n#EXT-X-DISCONTINUITY\n`;
  private createSegment = (filename: string, duration: string) =>
    `#EXTINF:${duration}\n${filename}`;
  private createInit = (filename: string, programDate: string) =>
    `#EXT-X-PROGRAM-DATE-TIME:${programDate}\n#EXT-X-MAP:URI="${filename}"`;

  private getSegmentFile = (direction: IDBCursorDirection) => {
    const index = this.db.getCursor("createdAt");
    const request = index.openCursor(null, direction);
    return new Promise<HlsDbItem>((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const file = cursor.value as HlsDbItem;
          if (file.filename.startsWith("s")) resolve(file);
          else cursor.continue();
        }
      };
    });
  };

  generatePlaylist = async () => {
    const playlistBase = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-VERSION:9
#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=12.0
#EXT-X-DISCONTINUITY-SEQUENCE:0
#EXT-X-MEDIA-SEQUENCE:SEQUENCE_PLACEHOLDER`;

    const index = this.db.getCursor("createdAt");
    const request = index.openCursor(null, "next");

    let oldestSegment: HlsDbItem;

    let playlist = playlistBase;
    let sequenceNumber: string;

    return new Promise<{
      data: Uint8Array;
      duration: number;
      startDate: string;
    }>((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const file = cursor.value as HlsDbItem;
          const { discontinuity, duration, filename, createdAt, index } = file;
          const isInit = filename.startsWith("i");

          let playlistUpdate = "";
          if (isInit) {
            playlistUpdate = this.createInit(filename, createdAt);
            this.lastSentInit = file;
          } else {
            this.lastSentSegment = file;
            if (!oldestSegment) oldestSegment = file;

            if (!sequenceNumber) {
              sequenceNumber = index.toString();
              playlist = playlist.replace(
                "SEQUENCE_PLACEHOLDER",
                sequenceNumber
              );
            }
            if (discontinuity) {
              playlistUpdate = this.createDiscontinuity(createdAt);
              this.discontinuitySequence++;
            }
            playlistUpdate += this.createSegment(filename, duration!);
          }

          playlist = playlist.concat("\n" + playlistUpdate);
          cursor.continue();
        } else {
          console.log("Read all files");
          console.log("Created playlist ", playlist);

          const encodedPlaylist = encoder.encode(playlist);

          const payload = {
            data: encodedPlaylist,
            startDate: oldestSegment.createdAt,
            duration:
              new Date(
                this.lastSentSegment?.createdAt || new Date()
              ).getTime() - new Date(oldestSegment.createdAt).getTime(),
          };
          this.lastSentDeltaPlaylist = payload;
          resolve(payload);
        }
      };
    });
  };

  generateDeltaPlaylist = async () => {
    if (this.lastSentDeltaPlaylist) {
      console.log("Reusing old delta update...");
      return this.lastSentDeltaPlaylist;
    }
    const oldestSegment = await this.getSegmentFile("next");
    const cursor = this.db.getCursor("createdAt");
    const request = cursor.openCursor(null, "prev");

    const playlistBase = `#EXTM3U
#EXT-X-TARGETDURATION:2
#EXT-X-VERSION:9
#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=12.0
#EXT-X-DISCONTINUITY-SEQUENCE:${this.discontinuitySequence}
#EXT-X-MEDIA-SEQUENCE:${oldestSegment.index}
#EXT-X-SKIP:SKIPPED-SEGMENTS=SKIPPED_PLACEHOLDER`;

    let playlist = playlistBase;
    let skipNumber: string;
    let files: HlsDbItem[] = [];

    const stopDate = new Date(this.lastSentSegment?.createdAt || new Date());
    stopDate.setSeconds(stopDate.getSeconds() - 12);

    return new Promise<{
      data: Uint8Array;
      duration: number;
      startDate: string;
    }>((resolve) => {
      const finish = () => {
        let indexHelper = 0;

        files.unshift(this.lastSentInit!);
        files.forEach((file) => {
          const { discontinuity, duration, filename, createdAt, index } = file;
          const isInit = filename.startsWith("i");

          let playlistUpdate = "";
          if (isInit) {
            this.lastSentInit = file;
            playlistUpdate = this.createInit(filename, createdAt);
          } else {
            if (file.index < indexHelper) {
              console.error(
                `WRONG ORDER current is ${file.index} and prev is ${indexHelper}}`
              );
            }
            indexHelper = file.index;
            this.lastSentSegment = file;
            skipNumber = (index - oldestSegment.index).toString();
            playlist = playlist.replaceAll("SKIPPED_PLACEHOLDER", skipNumber);
            if (discontinuity) {
              this.discontinuitySequence++;
              playlistUpdate = this.createDiscontinuity(createdAt);
            }
            playlistUpdate += this.createSegment(filename, duration!);
          }

          playlist = playlist.concat("\n" + playlistUpdate);
        });

        console.log("Created DELTA playlist ", playlist);
        const encodedPlaylist = encoder.encode(playlist);

        const payload = {
          data: encodedPlaylist,
          startDate: oldestSegment.createdAt,
          duration:
            new Date(this.lastSentSegment?.createdAt || new Date()).getTime() -
            new Date(oldestSegment.createdAt).getTime(),
        };
        this.lastSentDeltaPlaylist = payload;
        resolve(payload);
      };

      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const file = cursor.value as HlsDbItem;
          const fileDate = new Date(file.createdAt);
          fileDate.setMilliseconds(0);

          const isNewSegment = fileDate.getTime() > stopDate.getTime();

          if (!isNewSegment) {
            finish();
            return;
          }
          files.unshift(file);
          cursor.continue();
        } else {
          finish();
        }
      };
    });
  };

  private readFromPlaylist = (regex: RegExp, playlist: string) => {
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
    return this.readFromPlaylist(SEGMENT_DURATION_REGEX, playlist);
  };

  addToNextSegmentIndex = (segmentIndex: number) => {
    this.latestSegmentIndex += segmentIndex;
    // console.log("Updated latestSegmentIndex: ", this.latestSegmentIndex);
  };

  addToNextInitIndex = (initIndex: number) => {
    this.latestInitIndex += initIndex;
    // console.log("Updated latestInitIndex: ", this.latestInitIndex);
  };

  private getNextSafeInteger = (integer: number) => {
    if (integer >= Number.MAX_SAFE_INTEGER) {
      console.warn("Integer is equal or bigger then Number.MAX_SAFE_INTEGER");
      return 0;
    }
    return integer;
  };

  getLatestSegmentIndex = () => {
    const nextSafeInteger = this.getNextSafeInteger(this.latestSegmentIndex);
    this.latestSegmentIndex = nextSafeInteger;
    return nextSafeInteger;
  };

  getLatestInitIndex = () => {
    const nextSafeInteger = this.getNextSafeInteger(this.latestInitIndex);
    this.latestInitIndex = nextSafeInteger;
    return nextSafeInteger;
  };
}

export class Transcoder {
  constructor(private playlist: Playlist) {}
  private ffmpeg!: FFmpeg;
  private initDate = new Date();

  private create = () => {
    this.ffmpeg = createFFmpeg({
      log: false,
      corePath: "/dist/ffmpeg-core.js",
      wasmPath: "/dist/ffmpeg-core.wasm",
      workerPath: "/dist/ffmpeg-core.worker.js",
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

  private filterZeroTimeSegments = (segmentDurations: string[]) => {
    return (filename: string, index: number) => {
      const duration = segmentDurations[index];
      return Number(duration) > 0.1;
    };
  };

  private refreshInstance = () => {
    const now = new Date().getTime();
    if (this.initDate.getTime() + TRANSCODER_RESET_TIME < now) {
      console.log("Creating new FFMPEG instance");
      this.create();
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
    if (!this.ffmpeg.isLoaded()) {
      console.time("Ffmpegloaded");
      await this.ffmpeg.load();
      console.timeEnd("Ffmpegloaded");
    }

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

    console.time("run-method");
    await this.ffmpeg.run(...options);
    console.timeEnd("run-method");

    const ffmpegFilenames = this.ffmpeg.FS("readdir", "/");
    const playlistData = this.ffmpeg.FS("readFile", "playlist.m3u8");
    // console.log("Generated playlist: ", decoder.decode(playlistData));
    // console.log(ffmpegFilenames);

    const segmentFilenames = ffmpegFilenames
      .filter((file) => file.includes("segment"))
      .sort(this.sortSegmentFiles);

    const segmentDurations = this.playlist.getDurationsForSegmentsFromPlaylist(
      decoder.decode(playlistData)
    );
    // console.log("segment durations: ", segmentDurations);
    // console.log("for files: ", segmentFilenames);

    const nonZeroSegmentsFilenames = segmentFilenames.filter(
      this.filterZeroTimeSegments(segmentDurations)
    );

    const segmentsData = nonZeroSegmentsFilenames.map((filename, index) => {
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

    // console.log("Files after transcoding: ", this.ffmpeg.FS("readdir", "/"));

    this.ffmpeg.exit();
    this.refreshInstance();
    return {
      segmentsData,
      initData,
    };
  };
}
