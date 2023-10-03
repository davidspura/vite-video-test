import {
  useCallback,
  useEffect,
  useRef,
  useState,
  MouseEvent as ReactMouseEvent,
} from "react";
import { Box } from "@chakra-ui/react";
import { hashCode, throttle } from "./lib/utils";
import { nanoid } from "nanoid";

type TimeRange = { start: string; end: string; id: number };
type EventData = {
  duration: number;
  startDate: string;
  gaps: TimeRange[];
};
type TimelineEvent = CustomEvent<EventData>;

const indicatorWidthInPx = 4;
const pxBetweenSeconds = 0.8;
const FIVE_MINUTE_IN_PX = 5 * 60 * pxBetweenSeconds;

const timeToPx = (time: number) => time * pxBetweenSeconds;
const pxToTime = (px: number) => px * 1.25;

export default function useTimeline() {
  const video = useRef<HTMLVideoElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const timelineStartDate = useRef<string | null>(null);
  const isDragging = useRef(false);
  const mouseX = useRef<null | number>(null);
  const initialMouseX = useRef<null | number>(null);
  const timeDisplay = useRef<HTMLDivElement>(null);
  const metadataContainerRef = useRef<HTMLDivElement>(null);
  const originalTimelineStartDate = useRef<string | null>(null);

  const updateTimelineWidth = useCallback((e: Event) => {
    const { detail } = e as TimelineEvent;
    const { duration, startDate } = detail;
    timelineStartDate.current = startDate;
    if (!originalTimelineStartDate.current)
      originalTimelineStartDate.current = startDate;

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

  const gapMap = useRef(new Map<string, TimeRange & { elementId: string }>());

  const renderGaps = useCallback((e: Event) => {
    if (!metadataContainerRef.current || !timelineStartDate.current) return;
    const { detail } = e as TimelineEvent;
    const { gaps: timeranges } = detail;

    const map = gapMap.current;

    const render = (range: TimeRange & { elementId: string }) => {
      const gapEl = document.createElement("div");

      gapEl.id = range.elementId;
      gapEl.style.height = "40px";
      gapEl.style.background = "red";
      gapEl.style.position = "absolute";
      gapEl.innerHTML = String(range.id);
      const startTime =
        new Date(range.start).getTime() -
        new Date(timelineStartDate.current!).getTime();
      const width =
        new Date(range.end).getTime() - new Date(range.start).getTime();

      gapEl.style.left = timeToPx(startTime / 1000) + "px";
      gapEl.style.width = timeToPx(width / 1000) + "px";

      metadataContainerRef.current?.append(gapEl);
    };
    const remove = (elementId: string) => {
      document.querySelector(`#${elementId}`)?.remove();
    };

    timeranges.forEach((timerange) => {
      const startDate = new Date(timerange.start);
      const endDate = new Date(timerange.end);
      const id = "id" + hashCode(startDate.toString() + endDate.toString());

      const key = JSON.stringify(timerange);
      if (!map.has(key)) {
        console.log("Got new timerange, about to render & add to map");
        const range = { ...timerange, elementId: id };
        map.set(key, range);
        render(range);
      }
    });
    for (let key of map.keys()) {
      if (!timeranges.some((timerange) => JSON.stringify(timerange) === key)) {
        console.log("Found old timerange, about to remove from map and DOM");
        const range = map.get(key);
        if (range) remove(range.elementId);
        map.delete(key);
      }
    }
  }, []);

  const onDurationUpdate = useCallback(
    (e: Event) => {
      updateTimelineWidth(e);
      addTimestamps();
      // if (!didRenderGaps.current) renderGaps(e);
      renderGaps(e);
    },
    [updateTimelineWidth, addTimestamps]
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
    // timestamps,
    timelineStartDate,
    metadataContainerRef,
    // gaps,
  };
}
