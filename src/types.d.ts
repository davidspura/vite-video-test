type ImageRotation =
  | "ROTATION_0"
  | "ROTATION_90"
  | "ROTATION_180"
  | "ROTATION_270";

type HlsDbItem = {
  index: number;
  filename: string;
  data: Uint8Array;
  createdAt: string;
  duration: string | null;
  discontinuity: boolean;
  rotation: ImageRotation;
  isUneven?: boolean;
  initFilename?: string;
};

type PlaylistPayload = {
  data: Uint8Array;
  startDate?: string;
  duration?: number;
};

type TimeRange = { start: string; end: string };

type TimelineEventData = {
  duration: number;
  startDate: string;
  gaps: TimeRange[];
};

type TimelineEvent = CustomEvent<TimelineEventData>;
type DB = import("./Recorder/DB").default;
type DbController = import("./Recorder/modules/DbController").default;
type Playlist = import("./Recorder/modules/Playlist").default;

type CameraEvent = {
  uniqueId: string;
  start: string;
  end: string;
  intervalEvent: boolean;
  type: "AWAKE" | "MOTION" | "CONNECT" | "DISCONNECT";
  additionalData: string;
  finished: boolean;
};
