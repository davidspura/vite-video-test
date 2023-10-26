export const SEGMENT_DURATION_REGEX = /#EXTINF:([\d.]+),/g;

export const DELETE_THRESHOLD = 8 * 60 * 60 * 1000; // 8 hours
export const TRANSCODER_RESET_TIME = 15 * 60000; // 15 minutes
export const SEGMENT_LENGTH = 10000; // 10 seconds

export const MAXIMUM_GAP_DURATION = 6.997;
export const MINIMUM_GAP_DURATION = 0.02133333;

export const SW_IGNORE_TAG = "sw_ignore=true";

export const INIT_EXT = ".mp4";
export const SEGMENT_EXT = ".m4s";
export const GAP_PREFIX = "g";

export const INDICATOR_PX_WIDTH = 4;
export const ONE_SECOND_IN_PX = 0.8;
export const TIMESTAMP_PX_DISTANCE = 5 * 60 * ONE_SECOND_IN_PX;
export const ONE_PX_IN_SECONDS = 1.25;
