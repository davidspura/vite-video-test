import { isGapFile } from "../extensions";

export default class GapTimeRanges {
  private static index = 0;
  static _timeRanges: { [key: string]: TimeRange } = {};
  private static previousFile: HlsDbItem | null = null;
  private static currentTimeRange: Partial<TimeRange> = {};
  static endDate: Date | undefined;

  static get timeRanges() {
    return Object.values(this._timeRanges);
  }

  private static _addToTimeRange = (
    item: HlsDbItem,
    { log } = { log: false }
  ) => {
    const _isGapFile = isGapFile(item);
    const isGapStart =
      (!this.previousFile || !isGapFile(this.previousFile)) && _isGapFile;
    const isGapEnd =
      this.previousFile && isGapFile(this.previousFile) && !_isGapFile;

    if (isGapStart) {
      if (log)
        console.log(
          "found gap start: ",
          item.createdAt,
          new Date(item.createdAt).toLocaleTimeString()
        );
      this.currentTimeRange.start = item.createdAt;
    }
    if (isGapEnd) {
      if (log)
        console.log(
          "found gap end: ",
          item.createdAt,
          new Date(item.createdAt).toLocaleTimeString()
        );
      this.currentTimeRange.end = item.createdAt;
    }

    if (this.currentTimeRange.start && this.currentTimeRange.end) {
      if (log)
        console.log("ADDING new gap to timerange: ", this.currentTimeRange);

      this.currentTimeRange.id = this.index;
      this._timeRanges[item.createdAt] = this.currentTimeRange as TimeRange;
      this.currentTimeRange = {};
      this.index++;
    }

    this.previousFile = item;
  };

  static payload = {
    payloadData: [] as HlsDbItem[],
    add(item: HlsDbItem, addToEnd = true) {
      if (addToEnd) this.payloadData.push(item);
      else this.payloadData.unshift(item);
    },
    finish() {
      GapTimeRanges.addToTimeRange(this.payloadData);
      this.payloadData = [];
    },
  };

  static addToTimeRange = (
    item: HlsDbItem | HlsDbItem[],
    { log } = { log: false }
  ) => {
    if (Array.isArray(item)) {
      item.forEach((i) => {
        this._addToTimeRange(i, { log });
      });
    } else {
      this._addToTimeRange(item, { log });
    }
  };

  static closeOpennedGaps = () => {
    if (
      this.currentTimeRange.start &&
      !this.currentTimeRange.end &&
      this.previousFile
    ) {
      this.currentTimeRange.id = this.index;
      this.index++;

      this.currentTimeRange.end =
        this.endDate?.toISOString() || new Date().toISOString();
      console.log(
        "Closing openned Timerange ",
        this.currentTimeRange.end,
        new Date(this.currentTimeRange.end).toLocaleTimeString()
      );

      this._timeRanges[this.previousFile.createdAt] = this
        .currentTimeRange as TimeRange;
      this.currentTimeRange = {};
    }
  };
  static removeFromTimeRange = (removedItem: HlsDbItem) => {
    if (!removedItem.duration) return;
    const oldStartDate = new Date(removedItem.createdAt);
    const duration = Math.round(parseFloat(removedItem.duration) * 1000);

    this.timeRanges.forEach((timerange, i) => {
      const timerangeStartTime = new Date(timerange.start).getTime();
      const timerangeEndTime = new Date(timerange.end).getTime();
      const isOutOfRange = oldStartDate.getTime() >= timerangeStartTime;
      const newStartTime = timerangeStartTime + duration;
      const newDuration = timerangeEndTime - newStartTime;
      const isDeleted = newDuration <= 0;

      if (isOutOfRange) {
        if (isDeleted) {
          console.log("removing gap from timerange");
          delete this._timeRanges[timerange.end];
        } else {
          console.log("Adjusting start of gap", timerange);
          this._timeRanges[timerange.end] = {
            start: new Date(newStartTime).toISOString(),
            end: timerange.end,
            id: timerange.id,
          };
        }
      }
    });
  };

  static reset = () => {
    this._timeRanges = {};
    this.previousFile = null;
    this.currentTimeRange = {};
  };
}
