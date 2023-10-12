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

type TimeRange = { start: string; end: string; id: number };

type TimelineEventData = {
  duration: number;
  startDate: string;
  gaps: TimeRange[];
};

type TimelineEvent = CustomEvent<TimelineEventData>;
