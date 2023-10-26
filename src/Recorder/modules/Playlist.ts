import {
  MAXIMUM_GAP_DURATION,
  SEGMENT_DURATION_REGEX,
  SW_IGNORE_TAG,
} from "../const";
import {
  Settings,
  encoder,
  getGapFilename,
  isInitFile,
  isSegmentFile,
} from "../extensions";
import GapTimeRanges from "./GapTimeRanges";

export default class Playlist {
  constructor(private dbController: DbController) {}
  private latestSegmentIndex = 0;
  private latestInitIndex = 0;
  lastSentSegment: HlsDbItem | null = null;
  lastSentInit: HlsDbItem | null = null;

  lastSentDeltaPlaylist: {
    data: Uint8Array;
    startDate: string;
    duration: number;
    gaps: TimeRange[];
  } | null = null;
  discontinuitySequence: number = 0;

  private initGapData!: Uint8Array;
  private segmentGapData!: Uint8Array;

  loadGapFiles = async () => {
    const initResponse = await fetch(`/gapFiles/gap.mp4?${SW_IGNORE_TAG}`);
    const initBuffer = await initResponse.arrayBuffer();
    const initData = new Uint8Array(initBuffer);

    const segmentResponse = await fetch(
      `/gapFiles/gap_${MAXIMUM_GAP_DURATION}_0.m4s?${SW_IGNORE_TAG}`
    );
    const segmentBuffer = await segmentResponse.arrayBuffer();
    const segmentData = new Uint8Array(segmentBuffer);

    this.initGapData = initData;
    this.segmentGapData = segmentData;
  };

  getGapInit = async () => {
    return this.initGapData;
  };

  getGapSegment = async (filename: string) => {
    const file = await this.dbController.getRead()(filename);
    if (file.isUneven) {
      const filename = getGapFilename(file.duration!);
      const buffer = await (
        await fetch(`/gapFiles/${filename}?${SW_IGNORE_TAG}`)
      ).arrayBuffer();
      return new Uint8Array(buffer);
    }
    return this.segmentGapData;
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
    const payload = {
      data,
      startDate,
      duration,
      gaps: GapTimeRanges.timeRanges,
    };
    this.lastSentDeltaPlaylist = payload;
    return payload;
  };

  generatePlaylist = async () => {
    const playlistBase = `#EXTM3U
  #EXT-X-TARGETDURATION:${Settings.TARGETDURATION}
  #EXT-X-VERSION:9
  #EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${Settings.CANSKIP}
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
      gaps: TimeRange[];
    }>((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const file = cursor.value as HlsDbItem;

          const { discontinuity, duration, filename, createdAt, index } = file;
          const isInit = isInitFile(filename);

          let playlistUpdate = "";

          if (isInit) {
            playlistUpdate = this.createInit(filename, createdAt);
            this.lastSentInit = file;
          } else {
            GapTimeRanges.addToTimeRange(file);
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
          GapTimeRanges.closeOpennedGaps();
          console.log("Created initial playlist");
          const encodedPlaylist = encoder.encode(playlist);

          const hadSegments = Boolean(oldestSegment);
          if (!hadSegments) {
            resolve(
              this.createPayload({ data: Settings.initPlaylistFallback })
            );
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
      // console.log("Reusing old delta update...");
      return this.lastSentDeltaPlaylist;
    }

    const oldestSegment = await this.dbController.getSegmentFile("next");
    const request = this.dbController.getCursor("readonly", [null, "prev"]);

    const playlistBase = `#EXTM3U
  #EXT-X-TARGETDURATION:${Settings.TARGETDURATION}
  #EXT-X-VERSION:9
  #EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${Settings.CANSKIP}
  #EXT-X-DISCONTINUITY-SEQUENCE:${this.discontinuitySequence}
  #EXT-X-MEDIA-SEQUENCE:${oldestSegment?.index || 0}
  #EXT-X-SKIP:SKIPPED-SEGMENTS=SKIPPED_PLACEHOLDER`;

    let playlist = playlistBase;
    let skipNumber: string;
    let files: HlsDbItem[] = [];

    const stopDate = new Date(this.lastSentSegment?.createdAt || new Date());
    stopDate.setSeconds(stopDate.getSeconds() - Number(Settings.CANSKIP));

    return new Promise<{
      data: Uint8Array;
      duration: number;
      startDate: string;
      gaps: TimeRange[];
    }>((resolve) => {
      const finish = () => {
        const hadFiles = files.length !== 0;

        if (hadFiles) {
          GapTimeRanges.payload.finish();
          GapTimeRanges.closeOpennedGaps();

          if (!isInitFile(files[0])) {
            files.unshift(this.lastSentInit!);
          }

          files.forEach((file) => {
            const { discontinuity, duration, filename, createdAt, index } =
              file;
            const isInit = isInitFile(filename);

            let playlistUpdate = "";
            if (isInit) {
              this.lastSentInit = file;
              playlistUpdate = this.createInit(filename, createdAt);
            } else {
              skipNumber = (index - (oldestSegment?.index || 0)).toString();
              playlist = playlist.replaceAll("SKIPPED_PLACEHOLDER", skipNumber);
              if (discontinuity) {
                if (index > (this.lastSentSegment?.index || 0)) {
                  this.discontinuitySequence++;
                }
                playlistUpdate = this.createDiscontinuity(createdAt);
              }
              playlistUpdate += this.createSegment(filename, duration!);
              this.lastSentSegment = file;
            }

            playlist = playlist.concat("\n" + playlistUpdate);
          });
        }
        // console.log("Created DELTA playlist");
        const encodedPlaylist = encoder.encode(playlist);

        if (!hadFiles) {
          resolve(this.createPayload({ data: Settings.deltaPlaylistFallback }));
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
          const isCandidateForTimeRange =
            isSegmentFile(file) &&
            fileDate.getTime() >
              new Date(this.lastSentSegment?.createdAt || new Date()).getTime();

          if (isCandidateForTimeRange) GapTimeRanges.payload.add(file, false);

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
