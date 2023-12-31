import { FFmpeg, createFFmpeg } from "@ffmpeg/ffmpeg";
import DB, { HlsDbItem } from "../DB";

type PlaylistPayload = {
  data: Uint8Array;
  startDate?: string;
  duration?: number;
};

// const GAP_SOURCE_INIT_FILENAME = "gapSourceInit.mp4";
// const GAP_SOURCE_SEGMENT_FILENAME = "gapSourceSegment.m4s";
// const IGNORED_FILENAME_PREFIX = "gapSource";
// const IGNORED_FILENAMES = [
//   GAP_SOURCE_INIT_FILENAME,
//   GAP_SOURCE_SEGMENT_FILENAME,
// ];

const EIGHT_HOURS_IN_MS = 8 * 60 * 60 * 1000;
const SEGMENT_LENGTH = 10000; // 10 seconds split into 2 second segment in Transcoder
// const SEGMENT_INDEX_REGEX = /s(\d+)\.m4s/;
// const INIT_INDEX_REGEX = /i(\d+)\.mp4/;
const SEGMENT_DURATION_REGEX = /#EXTINF:([\d.]+),/g;
const TRANSCODER_RESET_TIME = 15 * 60000; // 15 minutes

const TARGETDURATION = 2;
const CANSKIP = (TARGETDURATION * 6).toFixed(1);

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const initPlaylistFallbackString = `#EXTM3U
#EXT-X-TARGETDURATION:${TARGETDURATION}
#EXT-X-VERSION:9
#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${CANSKIP}
#EXT-X-DISCONTINUITY-SEQUENCE:0
#EXT-X-MEDIA-SEQUENCE:0`;
const deltaPlaylistFallbackString = `#EXTM3U
#EXT-X-TARGETDURATION:${TARGETDURATION}
#EXT-X-VERSION:9
#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${CANSKIP}
#EXT-X-DISCONTINUITY-SEQUENCE:0
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-SKIP:SKIPPED-SEGMENTS=0`;

const initPlaylistFallback = encoder.encode(initPlaylistFallbackString);
const deltaPlaylistFallback = encoder.encode(deltaPlaylistFallbackString);

let initGapData: Uint8Array;
let segmentGapData: Uint8Array;

export const getGapInit = () => initGapData;
export const getGapSegment = () => segmentGapData;

export default class Recorder {
  private mediaRecorder: MediaRecorder;
  constructor(private stream: MediaStream) {
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: "video/webm; codecs=h264",
      // mimeType: "video/mp4",
    });
    this.mediaRecorder.addEventListener("dataavailable", this.onDataAvailable);
  }
  private timeout: number | null = null;
  private hasCreatedInitFile = false;
  private isTranscoding = false;

  private sourceDate: Date = new Date();
  private trancoderQue: Blob[] = [];

  db = new DB();
  private dbController = new DbController(this.db);
  playlist = new Playlist(this.dbController);
  private transcoder = new Transcoder(this.playlist);

  status: "idle" | "recording" = "idle";

  init = async () => {
    await this.db.init();
    await this.transcoder.init();
    await this.dbController.deleteOlderThan(EIGHT_HOURS_IN_MS);
    await this.playlist.loadGapFiles();
  };

  start = async () => {
    await this.startRecordingSourceVideo();
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

    console.log("Called mediaRecorder.start()");
    this.timeout = setTimeout(() => {
      this.mediaRecorder?.stop();
      console.log("Called mediaRecorder.stop()");
      this.createSourceVideo();
    }, SEGMENT_LENGTH);
  };

  private startRecordingSourceVideo = async () => {
    if (this.status === "recording") return;
    console.log("Starting creating segments");
    this.hasCreatedInitFile = false;
    this.status = "recording";
    const sourceDate = new Date();
    this.sourceDate = sourceDate;
    await this.dbController.fillSegmentGaps(sourceDate.toISOString());
    await this.playlist.prepareNextUsableIndexes();
    this.createSourceVideo();
  };

  private onDataAvailable = async (event: BlobEvent) => {
    // const url = URL.createObjectURL(
    //   new Blob([event.data], { type: "video/webm" })
    // );
    // const a = document.createElement("a");
    // a.href = url;
    // a.download = "video.webm";
    // a.click();
    // a.remove();
    // URL.revokeObjectURL(url);

    console.log("OnDataAvailable fired");
    this.dbController.deleteOlderThan(EIGHT_HOURS_IN_MS, () => {
      this.playlist.discontinuitySequence += 1;
    });

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
        isGap: false,
        index,
      } as const;
      await this.db.getWrite()(initPayload);
      this.playlist.addToNextInitIndex(1);
    }

    const segmentStartIndex = this.playlist.getLatestSegmentIndex();
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
        isGap: false,
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
  constructor(private dbController: DbController) {}
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

  loadGapFiles = async () => {
    const initResponse = await fetch("/gap.mp4");
    const initBuffer = await initResponse.arrayBuffer();
    const initData = new Uint8Array(initBuffer);

    const segmentResponse = await fetch("/gap0.m4s");
    const segmentBuffer = await segmentResponse.arrayBuffer();
    const segmentData = new Uint8Array(segmentBuffer);

    initGapData = initData;
    segmentGapData = segmentData;
  };

  prepareNextUsableIndexes = async () => {
    const { initIndex, segmentIndex } =
      await this.dbController.getNextUsableIndexes();
    this.latestInitIndex = initIndex;
    this.latestSegmentIndex = segmentIndex;
    console.log("Initial init index ", this.latestInitIndex);
    console.log("Initial segment index ", this.latestSegmentIndex);
  };

  private createDiscontinuity = (programDate: string) =>
    `#EXT-X-PROGRAM-DATE-TIME:${programDate}\n#EXT-X-DISCONTINUITY\n`;
  private createSegment = (filename: string, duration: string) =>
    `#EXTINF:${duration}\n${filename}`;
  private createInit = (filename: string, programDate: string) =>
    `#EXT-X-PROGRAM-DATE-TIME:${programDate}\n#EXT-X-MAP:URI="${filename}"`;

  private createPayload = ({
    data,
    startDate = new Date().toISOString(),
    duration = 0,
  }: PlaylistPayload) => {
    const payload = { data, startDate, duration };
    this.lastSentDeltaPlaylist = payload;
    return payload;
  };

  generatePlaylist = async () => {
    const playlistBase = `#EXTM3U
#EXT-X-TARGETDURATION:${TARGETDURATION}
#EXT-X-VERSION:9
#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${CANSKIP}
#EXT-X-DISCONTINUITY-SEQUENCE:0
#EXT-X-MEDIA-SEQUENCE:SEQUENCE_PLACEHOLDER`;

    const request = this.dbController.getCursor("readonly", [null, "next"]);

    let oldestSegment: HlsDbItem;

    let playlist = playlistBase;
    let sequenceNumber: string;
    let playlistDurationInSec = 0;

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
          const isInit = filename.endsWith(".mp4");

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
            playlistDurationInSec += Number(duration);
          }

          playlist = playlist.concat("\n" + playlistUpdate);
          cursor.continue();
        } else {
          console.log("Read all files");
          console.log("Created playlist ", playlist);

          const encodedPlaylist = encoder.encode(playlist);

          const hadSegments = Boolean(oldestSegment);
          if (!hadSegments) {
            resolve(this.createPayload({ data: initPlaylistFallback }));
            return;
          }

          resolve(
            this.createPayload({
              data: encodedPlaylist,
              startDate: oldestSegment.createdAt,
              duration: playlistDurationInSec * 1000,
            })
          );
        }
      };
    });
  };

  generateDeltaPlaylist = async () => {
    if (this.lastSentDeltaPlaylist) {
      console.log("Reusing old delta update...");
      return this.lastSentDeltaPlaylist;
    }

    const oldestSegment = await this.dbController.getSegmentFile("next");
    const request = this.dbController.getCursor("readonly", [null, "prev"]);

    const playlistBase = `#EXTM3U
#EXT-X-TARGETDURATION:${TARGETDURATION}
#EXT-X-VERSION:9
#EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${CANSKIP}
#EXT-X-DISCONTINUITY-SEQUENCE:${this.discontinuitySequence}
#EXT-X-MEDIA-SEQUENCE:${oldestSegment?.index || 0}
#EXT-X-SKIP:SKIPPED-SEGMENTS=SKIPPED_PLACEHOLDER`;

    let playlist = playlistBase;
    let skipNumber: string;
    let files: HlsDbItem[] = [];

    const stopDate = new Date(this.lastSentSegment?.createdAt || new Date());
    stopDate.setSeconds(stopDate.getSeconds() - Number(CANSKIP));

    return new Promise<{
      data: Uint8Array;
      duration: number;
      startDate: string;
    }>((resolve) => {
      const finish = () => {
        const hadFiles = files.length !== 0;
        let indexHelper = 0;

        if (hadFiles) {
          files.unshift(this.lastSentInit!);
          files.forEach((file) => {
            const { discontinuity, duration, filename, createdAt, index } =
              file;
            const isInit = filename.endsWith(".mp4");

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
              skipNumber = (index - (oldestSegment?.index || 0)).toString();
              playlist = playlist.replaceAll("SKIPPED_PLACEHOLDER", skipNumber);
              if (discontinuity) {
                this.discontinuitySequence++;
                playlistUpdate = this.createDiscontinuity(createdAt);
              }
              playlistUpdate += this.createSegment(filename, duration!);
            }

            playlist = playlist.concat("\n" + playlistUpdate);
          });
        }
        console.log("Created DELTA playlist ", playlist);
        const encodedPlaylist = encoder.encode(playlist);

        if (!hadFiles) {
          resolve(this.createPayload({ data: deltaPlaylistFallback }));
          return;
        }

        const playlistDuration =
          new Date(this.lastSentSegment?.createdAt || new Date()).getTime() +
          Number(this.lastSentSegment?.duration || 0) * 1000 -
          new Date(oldestSegment?.createdAt || new Date()).getTime();

        resolve(
          this.createPayload({
            data: encodedPlaylist,
            startDate: oldestSegment?.createdAt,
            duration: playlistDuration,
          })
        );
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
  };

  addToNextInitIndex = (initIndex: number) => {
    this.latestInitIndex += initIndex;
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
    // if (!this.ffmpeg.isLoaded()) {
    //   console.time("Ffmpegloaded");
    //   await this.ffmpeg.load();
    //   console.timeEnd("Ffmpegloaded");
    // }

    const arrayBuffer = await blob.arrayBuffer();
    this.ffmpeg.FS("writeFile", "input.webm", new Uint8Array(arrayBuffer));

    const options = [
      "-i",
      "input.webm",
      "-c:a",
      "aac",
      "-c:v",
      // "copy",
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
    // this.ffmpeg.exit();
    return {
      segmentsData,
      initData,
    };
  };
}

class DbController {
  constructor(private db: DB) {
    this.db = db;
  }

  getCursor = (
    mode: IDBTransactionMode = "readonly",
    cursorOptions: Parameters<IDBObjectStore["openCursor"]>
  ) => {
    const index = this.db.createTransaction(mode);
    const request = index.openCursor(...cursorOptions);
    return request;
  };

  deleteOlderThan = (time: number, onDiscontinuityDelete?: () => void) => {
    const upperBound = new Date(Date.now() - time).toISOString();
    const range = IDBKeyRange.upperBound(upperBound);

    const objectStore = this.db.createTransaction("readwrite");
    const index = objectStore.index("createdAt");
    const request = index.openCursor(range);

    return new Promise((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const record = cursor.value as HlsDbItem;
          console.warn("Deleting ", record.filename);
          if (record.discontinuity && onDiscontinuityDelete) {
            onDiscontinuityDelete();
          }
          cursor.delete();
          cursor.continue();
        } else resolve(1);
      };
      request.onerror = (e) => console.log("'deleteOlderThan' failed data ", e);
    });
  };

  fillSegmentGaps = async (date: string) => {
    const oldestSegment = await this.getSegmentFile("prev");
    if (!oldestSegment) {
      console.log("Not adding any gaps");
      return;
    }

    const { createdAt, duration } = oldestSegment;
    const gapStartTime =
      new Date(createdAt).getTime() + Number(duration) * 1000;
    const gapEndTime = new Date(date).getTime();

    const timeDifference = gapEndTime - gapStartTime;

    let seconds = timeDifference / 1000;
    const gaps: number[] = [];

    while (seconds >= TARGETDURATION) {
      gaps.push(TARGETDURATION);
      seconds -= TARGETDURATION;
    }
    if (seconds > 0) gaps.push(seconds);

    const { initIndex, segmentIndex: startSegmentIndex } =
      await this.getNextUsableIndexes();

    const startDate = new Date(gapStartTime);
    const initPayload: HlsDbItem = {
      filename: `g${initIndex}.mp4`,
      index: initIndex,
      createdAt: startDate.toISOString(),
      data: new Uint8Array(),
      discontinuity: false,
      duration: null,
      isGap: false,
      rotation: "horizontal",
    };

    const write = this.db.getWrite();
    await write(initPayload);

    let segmentIndex = startSegmentIndex;
    const segmentDate = startDate;

    console.log("gaps: ", gaps);

    for (const gapDuration of gaps) {
      const payload: HlsDbItem = {
        filename: `g${segmentIndex}.m4s`,
        index: segmentIndex,
        createdAt: new Date(segmentDate).toISOString(),
        data: new Uint8Array(),
        discontinuity: true,
        duration: gapDuration.toFixed(6),
        isGap: true,
        rotation: "horizontal",
      };

      await write(payload);

      segmentDate.setMilliseconds(
        segmentDate.getMilliseconds() + gapDuration * 1000
      );
      segmentIndex++;
    }
  };

  getSegmentFile = (direction: IDBCursorDirection) => {
    const request = this.getCursor("readonly", [null, direction]);

    return new Promise<HlsDbItem | null>((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const file = cursor.value as HlsDbItem;
          if (file.filename.endsWith(".m4s")) resolve(file);
          else cursor.continue();
        } else resolve(null);
      };
    });
  };

  getNextUsableIndexes = () => {
    const request = this.getCursor("readonly", [null, "prev"]);

    let segmentIndex: number;
    let initIndex: number;

    return new Promise<{ segmentIndex: number; initIndex: number }>(
      (resolve, reject) => {
        request.onsuccess = (e) => {
          const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
          if (cursor) {
            const record = cursor.value as HlsDbItem;
            if (!segmentIndex && record.filename.endsWith(".m4s")) {
              segmentIndex = record.index + 1;
            }
            if (!initIndex && record.filename.endsWith(".mp4")) {
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
}
