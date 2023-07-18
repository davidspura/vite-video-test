import {
  useCallback,
  useEffect,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
} from "react";
import { throttle } from "./lib/utils";

const indicatorWidthInPx = 4;
const pxBetweenSeconds = 0.8;
const FIVE_MINUTE_IN_PX = 5 * 60 * pxBetweenSeconds;

const timeToPx = (time: number) => time * pxBetweenSeconds;
const pxToTime = (px: number) => px * 1.25;

export default function useTimeline() {
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const video = useRef<HTMLVideoElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const timelineStartDate = useRef<string | null>(null);
  const isDragging = useRef(false);
  const mouseX = useRef<null | number>(null);
  const initialMouseX = useRef<null | number>(null);
  const timeDisplay = useRef<HTMLDivElement>(null);

  const updateTimelineWidth = useCallback((e: Event) => {
    const { detail } = e as CustomEvent;
    const { duration, startDate } = detail;
    timelineStartDate.current = startDate;
    const width = timeToPx(duration / 1000);
    if (timeline.current) timeline.current.style.width = `${width}px`;
  }, []);

  const addTimestamps = useCallback(() => {
    if (!timeline.current) return;
    const numberOfTimestamps =
      Math.floor(
        timeline.current.getBoundingClientRect().width / FIVE_MINUTE_IN_PX
      ) + 1;
    setTimestamps(new Array(numberOfTimestamps).fill(1));
  }, []);

  const onDurationUpdate = useCallback(
    (e: Event) => {
      updateTimelineWidth(e);
      addTimestamps();
    },
    [updateTimelineWidth, addTimestamps]
  );

  useEffect(() => {
    document.addEventListener("duration-update", onDurationUpdate);
    return () => {
      document.removeEventListener("duration-update", onDurationUpdate);
    };
  }, []);

  const onTimeUpdate = () => {
    if (!video.current || !indicator.current || !timeline.current) return;
    if (isDragging.current) return;
    const time = video.current.currentTime;
    timeline.current.style.left = `-${timeToPx(time)}px`;
    timeDisplay.current!.innerText =
      timelineStartDate.current! + video.current!.currentTime * 1000;
  };

  const onTimelineClick = (e: MouseEvent) => {
    if (!timeline.current || !video.current) return;
    const rect = timeline.current.getBoundingClientRect();
    const mouseX = pxToTime(e.clientX + 1) - pxToTime(rect.left);
    video.current.currentTime = mouseX;
  };

  const onMouseMove = (e: MouseEvent) => {
    mouseX.current = e.pageX;
  };

  const getIsOutOfBounds = () => {
    let isOutOfBounds = false;
    const { left: indicatorLeftPos, right: indicatorRightPos } =
      indicator.current!.getBoundingClientRect();
    const {
      left: timelineLeftPos,
      right: timelineRightPos,
      width,
    } = timeline.current!.getBoundingClientRect();

    if (timelineLeftPos >= indicatorLeftPos) {
      timeline.current!.style.left = `0px`;
      isOutOfBounds = true;
    }
    if (indicatorRightPos >= timelineRightPos) {
      timeline.current!.style.left = `${-width + indicatorWidthInPx / 2}px`;
      isOutOfBounds = true;
    }
    return isOutOfBounds;
  };

  const addToCurrentTime =
    //  throttle(
    (t: number) => {
      video.current!.currentTime = video.current!.currentTime + t;
    };
  // , 500);

  const startDrag = (e: ReactMouseEvent) => {
    video.current?.pause();
    initialMouseX.current = e.pageX;
    let lastSeekDistance = 0;

    const diff =
      indicator.current!.getBoundingClientRect().left -
      timeline.current!.getBoundingClientRect().left +
      2;

    const drag = () => {
      if (!timeline.current) return;
      let distance: number;
      if (mouseX.current === null) distance = diff;
      else distance = diff + (e.pageX - mouseX.current);
      const timelinePosition = distance;

      timeline.current.style.left = `${timelinePosition * -1}px`;
      const isOutOfBounds = getIsOutOfBounds();

      if (!isOutOfBounds) {
        const currentSeekDistance = e.pageX - (mouseX.current || e.pageX);
        const trueSeekDistance = currentSeekDistance - lastSeekDistance;
        const currentTime = pxToTime(trueSeekDistance);
        addToCurrentTime(currentTime);
        lastSeekDistance = currentSeekDistance;
      }

      if (isDragging.current) requestAnimationFrame(drag);
      else mouseX.current = null;
    };

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", stopDrag);
    isDragging.current = true;
    requestAnimationFrame(drag);
  };

  const stopDrag = (e: MouseEvent) => {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", stopDrag);
    isDragging.current = false;
    video.current?.play();

    if (e.pageX === initialMouseX.current) {
      onTimelineClick(e);
    }
    initialMouseX.current = null;
  };

  return {
    onTimeUpdate,
    startDrag,
    video,
    timeDisplay,
    indicator,
    timeline,
    timestamps,
    timelineStartDate,
  };
}
