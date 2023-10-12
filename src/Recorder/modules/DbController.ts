import { MAXIMUM_GAP_DURATION } from "../const";
import { isInitFile, isSegmentFile } from "../extensions";
import GapTimeRanges from "./GapTimeRanges";

export default class DbController {
  getRead: DB["getRead"];

  constructor(private db: DB) {
    this.db = db;
    this.getRead = this.db.getRead;
  }

  getCursor = (
    mode: IDBTransactionMode = "readonly",
    cursorOptions: Parameters<IDBObjectStore["openCursor"]>
  ) => {
    const index = this.db.createTransaction(mode);
    const request = index.openCursor(...cursorOptions);
    return request;
  };

  private deleteRemainingFiles = async (initFilenames: string[]) => {
    const remove = this.db.getDelete();

    console.log("About to delete remaining files: ", initFilenames);
    initFilenames.forEach((filename) => {
      remove(filename);
    });
  };

  deleteOlderThan = (time: number, onDiscontinuityDelete?: () => void) => {
    const upperBound = new Date(Date.now() - time).toISOString();
    const range = IDBKeyRange.upperBound(upperBound);

    const objectStore = this.db.createTransaction("readwrite");
    const index = objectStore.index("createdAt");
    const request = index.openCursor(range);

    return new Promise((resolve) => {
      const initFilenamesToDelete: string[] = [];

      const finish = async () => {
        const hasSegments = await this.getSegmentFile("prev");
        if (hasSegments) initFilenamesToDelete.pop();

        if (initFilenamesToDelete.length !== 0)
          await this.deleteRemainingFiles(initFilenamesToDelete);
        resolve(1);
      };

      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const file = cursor.value as HlsDbItem;
          const isInit = isInitFile(file);

          if (isInit) {
            console.log("found init, not deleting with others");
            initFilenamesToDelete.push(file.filename);
            cursor.continue();
          } else {
            GapTimeRanges.removeFromTimeRange(file);
            console.warn("Deleting ", file.filename);
            if (file.discontinuity && onDiscontinuityDelete) {
              onDiscontinuityDelete();
            }
            cursor.delete();
            cursor.continue();
          }
        } else finish();
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

    while (seconds >= MAXIMUM_GAP_DURATION) {
      gaps.push(MAXIMUM_GAP_DURATION);
      seconds -= MAXIMUM_GAP_DURATION;
    }
    if (seconds > 0.02) gaps.push(seconds);

    const { initIndex, segmentIndex: startSegmentIndex } =
      await this.getNextUsableIndexes();

    const startDate = new Date(gapStartTime);
    let initFilename = `g${initIndex}.mp4`;
    const initPayload: HlsDbItem = {
      filename: initFilename,
      index: initIndex,
      createdAt: startDate.toISOString(),
      data: new Uint8Array(),
      discontinuity: false,
      duration: null,
      rotation: "ROTATION_0",
    };

    const write = this.db.getWrite();
    await write(initPayload);

    let segmentIndex = startSegmentIndex;
    const segmentDate = startDate;

    console.log("gaps: ", gaps);
    const unevenGapInitIndex = initIndex + 1;

    for (const [index, gapDuration] of gaps.entries()) {
      const isLast = index === gaps.length - 1;

      if (isLast) {
        initFilename = `g${unevenGapInitIndex}.mp4`;
        const initPayload: HlsDbItem = {
          filename: initFilename,
          index: unevenGapInitIndex,
          createdAt: new Date(segmentDate).toISOString(),
          data: new Uint8Array(),
          discontinuity: false,
          duration: null,
          rotation: "ROTATION_0",
          isUneven: true,
        };
        await write(initPayload);
      }

      const payload: HlsDbItem = {
        filename: `g${segmentIndex}.m4s`,
        index: segmentIndex,
        createdAt: new Date(segmentDate).toISOString(),
        data: new Uint8Array(),
        discontinuity: true,
        duration: gapDuration.toFixed(6),
        rotation: "ROTATION_0",
        isUneven: isLast,
        initFilename,
      };
      if (isLast) {
        console.log("Start of gap: ", initPayload.createdAt);
        console.log("End of gap: ", payload.createdAt);
      }
      await write(payload);

      segmentDate.setMilliseconds(
        segmentDate.getMilliseconds() + gapDuration * 1000
      );
      segmentIndex++;
    }

    GapTimeRanges.endDate = segmentDate;
  };

  getSegmentFile = (direction: IDBCursorDirection) => {
    const request = this.getCursor("readonly", [null, direction]);

    return new Promise<HlsDbItem | null>((resolve) => {
      request.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          const file = cursor.value as HlsDbItem;
          if (isSegmentFile(file)) resolve(file);
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
            const file = cursor.value as HlsDbItem;
            if (!segmentIndex && isSegmentFile(file)) {
              segmentIndex = file.index + 1;
            }
            if (!initIndex && isInitFile(file)) {
              initIndex = file.index + 1;
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
