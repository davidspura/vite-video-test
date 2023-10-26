import {
  GAP_PREFIX,
  INIT_EXT,
  MAXIMUM_GAP_DURATION,
  MINIMUM_GAP_DURATION,
  ONE_PX_IN_SECONDS,
  ONE_SECOND_IN_PX,
  SEGMENT_EXT,
} from "./const";

const decoder = new TextDecoder();
const encoder = new TextEncoder();

const Settings = (function () {
  function getSkip(d: number) {
    return (d * 6).toFixed(1);
  }

  let TARGETDURATION_ = 7;
  let CANSKIP_ = getSkip(TARGETDURATION_);
  let initPlaylistFallback_: Uint8Array;
  let deltaPlaylistFallback_: Uint8Array;

  function generateSettings(targetDuration = 7) {
    TARGETDURATION_ = targetDuration;
    CANSKIP_ = getSkip(TARGETDURATION_);
    const initPlaylistFallbackString = `#EXTM3U
  #EXT-X-TARGETDURATION:${TARGETDURATION_}
  #EXT-X-VERSION:9
  #EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${CANSKIP_}
  #EXT-X-DISCONTINUITY-SEQUENCE:0
  #EXT-X-MEDIA-SEQUENCE:0`;
    const deltaPlaylistFallbackString = `#EXTM3U
  #EXT-X-TARGETDURATION:${TARGETDURATION_}
  #EXT-X-VERSION:9
  #EXT-X-SERVER-CONTROL:CAN-SKIP-UNTIL=${CANSKIP_}
  #EXT-X-DISCONTINUITY-SEQUENCE:0
  #EXT-X-MEDIA-SEQUENCE:0
  #EXT-X-SKIP:SKIPPED-SEGMENTS=0`;

    initPlaylistFallback_ = encoder.encode(initPlaylistFallbackString);
    deltaPlaylistFallback_ = encoder.encode(deltaPlaylistFallbackString);
  }

  generateSettings();
  return {
    get TARGETDURATION() {
      return TARGETDURATION_;
    },
    get CANSKIP() {
      return CANSKIP_;
    },
    get initPlaylistFallback() {
      return initPlaylistFallback_;
    },
    get deltaPlaylistFallback() {
      return deltaPlaylistFallback_;
    },
  };
})();

const isInitFile = (file: string | HlsDbItem) => {
  const filename = typeof file === "string" ? file : file.filename;
  return filename.endsWith(INIT_EXT);
};
const isSegmentFile = (file: string | HlsDbItem) => {
  const filename = typeof file === "string" ? file : file.filename;
  return filename.endsWith(SEGMENT_EXT);
};
const isGapFile = (file: string | HlsDbItem) => {
  const filename = typeof file === "string" ? file : file.filename;
  return filename.startsWith(GAP_PREFIX);
};

const msToSeconds = (ms: number) => ms / 1000;
const secToMs = (seconds: number) => seconds * 1000;

const getGapFilename = (duration: string) => {
  const durationNum = parseFloat(duration);
  const closestDuration =
    Math.round(durationNum / MINIMUM_GAP_DURATION) * MINIMUM_GAP_DURATION;

  if (closestDuration > MAXIMUM_GAP_DURATION) {
    console.log("GAP OUT OF RANGE");
    return `gap_${MAXIMUM_GAP_DURATION}_0.m4s`;
  }

  const filename = `gap_${closestDuration.toFixed(3)}_0.m4s`;
  // console.log("Found gap filename: ", filename);
  return filename;
};

const secondsToPx = (seconds: number) => seconds * ONE_SECOND_IN_PX;
const pxToTime = (px: number) => px * ONE_PX_IN_SECONDS;

const getEventInDateRange = (ranges: CameraEvent[], date: Date) => {
  // binary search
  try {
    let low = 0;
    let high = ranges.length;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const startDate = new Date(ranges[mid].start);
      const endDate = new Date(ranges[mid].end);

      if (startDate <= date && endDate >= date) {
        return ranges[mid];
      } else if (startDate > date) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return false;
  } catch (err) {
    // console.log(err);
    return false;
  }
};

const strictIsEqual = (compare: any, to: any) => {
  return JSON.stringify(compare) === JSON.stringify(to);
};

export {
  decoder,
  encoder,
  Settings,
  isInitFile,
  isSegmentFile,
  isGapFile,
  msToSeconds,
  secToMs,
  getGapFilename,
  secondsToPx,
  pxToTime,
  getEventInDateRange,
  strictIsEqual,
};
