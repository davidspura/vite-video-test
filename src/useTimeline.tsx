import {
  useCallback,
  useEffect,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
} from "react";
import { Box } from "@chakra-ui/react";
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
  const [gaps, setGaps] = useState<JSX.Element[]>([]);
  const mouseX = useRef<null | number>(null);
  const initialMouseX = useRef<null | number>(null);
  const timeDisplay = useRef<HTMLDivElement>(null);
  const didRenderGaps = useRef(false);

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
    const timestamps = new Array(numberOfTimestamps).fill(1) as number[];

    const event = new CustomEvent("timestamps-update", {
      detail: { startDate: timelineStartDate.current, timestamps },
    });
    document.dispatchEvent(event);
  }, []);

  const renderGaps = useCallback((e: Event) => {
    const { detail } = e as CustomEvent;
    const { gaps: timeranges } = detail as {
      gaps: { start: string; end: string }[];
    };

    if (timeranges.length !== 0) didRenderGaps.current = true;

    const elements: JSX.Element[] = [];
    for (const gap of timeranges) {
      const startTime =
        new Date(gap.start).getTime() -
        new Date(timelineStartDate.current!).getTime();
      const width = new Date(gap.end).getTime() - new Date(gap.start).getTime();
      const gapEl = (
        <Box
          key={gap.start}
          pos="absolute"
          left={timeToPx(startTime / 1000) + "px"}
          w={timeToPx(width / 1000) + "px"}
          h="40px"
          bg="red"
        />
      );
      elements.push(gapEl);
    }
    console.log("About to render gaps: ", timeranges, elements);
    setGaps(elements);
  }, []);

  const onDurationUpdate = useCallback(
    (e: Event) => {
      updateTimelineWidth(e);
      addTimestamps();
      if (!didRenderGaps.current) renderGaps(e);
    },
    [updateTimelineWidth, addTimestamps, gaps]
  );

  useEffect(() => {
    document.addEventListener("duration-update", onDurationUpdate);
    return () => {
      document.removeEventListener("duration-update", onDurationUpdate);
    };
  }, []);

  const getTimelineOffsetTime = () => {
    if (
      !timelineStartDate.current ||
      !originalTimelineStartDate.current ||
      !video.current
    )
      return 0;
    const originalTime = video.current.currentTime;

    const offset =
      (new Date(timelineStartDate.current).getTime() -
        new Date(originalTimelineStartDate.current).getTime()) /
      1000;

    const timeWithOffset = originalTime - offset;
    if (timeWithOffset < 0) return 0;
    // if (timeWithOffset < 0) return originalTime;

    const adjustedTime = Math.min(timeWithOffset, originalTime);
    return adjustedTime;
  };

  const getTimelineStartDateOffset = () => {
    return (new Date(timelineStartDate.current!).getTime() / 1000) % 60;
  };

  const onTimeUpdate = () => {
    if (!video.current || !indicator.current || !timeline.current) return;
    if (isDragging.current) return;

    const time = getTimelineOffsetTime();
    const timelineStartDateOffset = getTimelineStartDateOffset();

    timeline.current.style.backgroundPositionX = `-${timeToPx(
      timelineStartDateOffset
    )}px`;
    timeline.current.style.left = `-${timeToPx(time)}px`;

    const currentTime = new Date(
      new Date(timelineStartDate.current!).getTime() +
        video.current!.currentTime * 1000
    );
    timeDisplay.current!.innerText = `${currentTime.getHours()} : ${currentTime.getMinutes()} : ${currentTime.getSeconds()}`;
  };

  const onTimelineClick = (e: MouseEvent) => {
    const seekDistance =
      e.pageX - indicator.current!.getBoundingClientRect().left;
    const currentTime = pxToTime(seekDistance);
    addToCurrentTime(currentTime);
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

  const addToCurrentTime = (t: number) => {
    video.current!.currentTime = video.current!.currentTime + t;
  };

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

      timeline.current.style.left = `${distance * -1}px`;
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
    gaps,
  };
}
