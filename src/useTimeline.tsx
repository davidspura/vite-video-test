import {
  useCallback,
  useEffect,
  useRef,
  MouseEvent as ReactMouseEvent,
} from "react";
import { hashCode } from "./utils";
import {
  pxToTime,
  secToMs,
  secondsToPx,
  strictIsEqual,
} from "./Recorder/extensions";
import { INDICATOR_PX_WIDTH, TIMESTAMP_PX_DISTANCE } from "./Recorder/const";
import { testEvents } from "./mockupEvents";
import useTimelineEvents from "./useTimelineEvents";

export default function useTimeline() {
  const video = useRef<HTMLVideoElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const timelineStartDate = useRef<string | null>(null);

  const isDragging = useRef(false);
  const mouseX = useRef<null | number>(null);
  const initialMouseX = useRef<null | number>(null);

  const timeDisplay = useRef<HTMLDivElement>(null);
  const metadataContainer = useRef<HTMLDivElement>(null);
  const originalTimelineStartDate = useRef<string | null>(null);

  const trueTimelineWidth = useRef(0);
  const previousTime = useRef(0);
  const manualVisualSyncTimeout = useRef<number | null>(null);

  const playbaleRangesMap = useRef(
    new Map<string, { start: number; duration: number; elementId: string }>()
  );
  const lastReceivedGaps = useRef<TimeRange[] | null>(null);
  const currentlyUpdatingRangeId = useRef<string | null>(null);

  const getCurrentPlayerDateTime = useCallback(() => {
    if (!video.current || !timelineStartDate.current) return 0;
    return (
      new Date(timelineStartDate.current).getTime() +
      secToMs(video.current.currentTime)
    );
  }, []);

  const {
    mapEvents,
    updateMetaEvent,
    startUpdatingCurrentEvent,
    stopUpdatingCurrentEvent,
  } = useTimelineEvents(getCurrentPlayerDateTime);

  const didRender = useRef(false);
  useEffect(() => {
    if (didRender.current) return;
    didRender.current = true;

    setTimeout(() => {
      mapEvents(testEvents);
      renderEvents(testEvents);
    }, 10000);
  }, []);

  const updateTimelineWidth = useCallback((e: Event) => {
    const { detail } = e as TimelineEvent;
    const { duration, startDate } = detail;
    timelineStartDate.current = startDate;
    if (!originalTimelineStartDate.current)
      originalTimelineStartDate.current = startDate;

    const width = secondsToPx(duration / 1000);
    if (trueTimelineWidth.current === 0 && timeline.current)
      timeline.current.style.width = `${width}px`;

    trueTimelineWidth.current = width;
  }, []);

  const addTimestamps = useCallback(() => {
    if (!timeline.current) return;
    const numberOfTimestamps =
      Math.floor(
        timeline.current.getBoundingClientRect().width / TIMESTAMP_PX_DISTANCE
      ) + 1;
    const timestamps = new Array(numberOfTimestamps).fill(1) as number[];

    const event = new CustomEvent("timestamps-update", {
      detail: { startDate: timelineStartDate.current, timestamps },
    });
    document.dispatchEvent(event);
  }, []);

  const renderPlayableRanges = useCallback((e: Event) => {
    if (
      !metadataContainer.current ||
      !timelineStartDate.current ||
      !timeline.current
    )
      return;
    const { detail } = e as TimelineEvent;
    const { gaps: gapTimeRanges } = detail;

    if (
      lastReceivedGaps.current?.length === gapTimeRanges.length &&
      strictIsEqual(gapTimeRanges[0], lastReceivedGaps.current[0])
    )
      return;

    const map = playbaleRangesMap.current;
    const render = (range: {
      elementId: string;
      start: number;
      duration: number;
    }) => {
      const playableRangeEl = document.createElement("div");

      playableRangeEl.id = range.elementId;
      playableRangeEl.style.height = "40px";
      playableRangeEl.style.background = "rgba(0, 0, 0, 0.7)";
      playableRangeEl.style.position = "absolute";

      const startTime =
        range.start - new Date(timelineStartDate.current!).getTime();

      playableRangeEl.style.left = secondsToPx(startTime / 1000) + "px";
      playableRangeEl.style.width = secondsToPx(range.duration / 1000) + "px";

      metadataContainer.current?.append(playableRangeEl);
    };
    const remove = (elementId: string) => {
      document.querySelector(`#${elementId}`)?.remove();
    };
    const removeCurrentlyUpdatingRangeEl = () => {
      document.querySelector(`#${currentlyUpdatingRangeId.current}`)?.remove();
      currentlyUpdatingRangeId.current = null;
    };

    if (gapTimeRanges.length === 0) {
      timeline.current.style.backgroundColor = "rgba(0, 0, 0, 0.7)";
      if (currentlyUpdatingRangeId.current) removeCurrentlyUpdatingRangeEl();
    } else {
      timeline.current.style.backgroundColor = "transparent";
      let playableRangeStartTime = new Date(
        timelineStartDate.current
      ).getTime();
      gapTimeRanges.forEach((timerange) => {
        const startDate = new Date(timerange.start);
        const endDate = new Date(timerange.end);
        const id = "id" + hashCode(startDate.toString() + endDate.toString());

        const key = JSON.stringify(timerange);
        if (!map.has(key)) {
          const range = {
            elementId: id,
            start: playableRangeStartTime,
            duration:
              new Date(timerange.start).getTime() - playableRangeStartTime,
          };
          console.log("Got new timerange, about to render & add to map", range);
          map.set(key, range);
          render(range);
        }
        playableRangeStartTime = new Date(timerange.end).getTime();
      });
      for (let key of map.keys()) {
        if (
          !gapTimeRanges.some((timerange) => JSON.stringify(timerange) === key)
        ) {
          console.log("Found old timerange, about to remove from map and DOM");
          const range = map.get(key);
          if (range) remove(range.elementId);
          map.delete(key);
        }
      }

      if (currentlyUpdatingRangeId.current) removeCurrentlyUpdatingRangeEl();

      const lastGap = gapTimeRanges[gapTimeRanges.length - 1];
      const endTime =
        new Date(timelineStartDate.current).getTime() +
        pxToTime(timeline.current.getBoundingClientRect().width) * 1000;

      if (!currentlyUpdatingRangeId.current) {
        const elementId = "id" + hashCode(lastGap.start + lastGap.end);
        const lastPlayableRange = {
          elementId,
          start: new Date(lastGap.end).getTime(),
          duration: endTime - new Date(lastGap.end).getTime(),
        };
        render(lastPlayableRange);
        currentlyUpdatingRangeId.current = elementId;
      }
    }
    lastReceivedGaps.current = gapTimeRanges;
  }, []);

  const renderEvents = useCallback(
    (events: (CameraEvent | CameraEvent[])[]) => {
      const render = (event: CameraEvent) => {
        const eventEl = document.createElement("div");

        eventEl.id = event.uniqueId;
        eventEl.style.zIndex = event.type === "AWAKE" ? "1" : "2";
        eventEl.style.height = "12px";
        eventEl.style.borderRadius = "24px";
        eventEl.style.background =
          event.type === "AWAKE"
            ? "rgba(186, 26, 26, 0.85)"
            : "rgba(103, 67, 203, 0.85)";
        eventEl.style.position = "absolute";
        const startTime =
          new Date(event.start).getTime() -
          new Date(timelineStartDate.current!).getTime();
        const timeWidth =
          new Date(event.end).getTime() - new Date(event.start).getTime();

        eventEl.style.left = secondsToPx(startTime / 1000) + "px";
        eventEl.style.width = secondsToPx(timeWidth / 1000) + "px";

        metadataContainer.current?.append(eventEl);
      };

      events.forEach((event) => {
        if (Array.isArray(event)) event.forEach((e) => render(e));
        else render(event);
      });
    },
    []
  );

  const onDurationUpdate = useCallback(
    (e: Event) => {
      updateTimelineWidth(e);
      addTimestamps();
      renderPlayableRanges(e);
    },
    [updateTimelineWidth, addTimestamps, renderPlayableRanges]
  );

  useEffect(() => {
    document.addEventListener("duration-update", onDurationUpdate);
    return () => {
      document.removeEventListener("duration-update", onDurationUpdate);
      if (manualVisualSyncTimeout.current)
        clearInterval(manualVisualSyncTimeout.current);
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

    const adjustedTime = Math.min(timeWithOffset, originalTime);
    return adjustedTime;
  };

  const getTimelineStartDateOffset = () => {
    return (new Date(timelineStartDate.current!).getTime() / 1000) % 60;
  };

  const prevTimelineTime = useRef(0);
  const onTimeUpdate = () => {
    if (!video.current || !indicator.current || !timeline.current) return;
    if (isDragging.current) return;

    const time = Math.round(getTimelineOffsetTime());

    const timelineStartDateOffset = getTimelineStartDateOffset();

    if (time !== prevTimelineTime.current) {
      timeline.current.style.backgroundPositionX = `-${secondsToPx(
        timelineStartDateOffset
      )}px`;
      timeline.current.style.left = `-${secondsToPx(time)}px`;
    }
    prevTimelineTime.current = time;

    syncVisuals();
    checkForDesync();
  };

  const checkForDesync = () => {
    let isOutOfBounds = false;
    const { left: indicatorLeftPos, right: indicatorRightPos } =
      indicator.current!.getBoundingClientRect();
    const {
      left: timelineLeftPos,
      right: timelineRightPos,
      width,
    } = timeline.current!.getBoundingClientRect();

    if (timelineLeftPos >= indicatorLeftPos) isOutOfBounds = true;
    if (indicatorRightPos >= timelineRightPos) isOutOfBounds = true;

    if (isOutOfBounds) {
      const remainingSpace = trueTimelineWidth.current - width;
      console.log("OUT OF BOUNDS, reserves: ", remainingSpace);
      if (timeline.current)
        timeline.current.style.width = `${trueTimelineWidth.current}px`;
    }
  };

  const syncVisuals = (forceSync = false) => {
    if (manualVisualSyncTimeout.current) {
      clearTimeout(manualVisualSyncTimeout.current);
      manualVisualSyncTimeout.current = null;
    }

    updateMetaTime();
    updateTimelineVisualWidth(forceSync);
    if (!forceSync) updateMetaEvent();

    manualVisualSyncTimeout.current = setTimeout(() => {
      console.log("Forcing timeline visual update");
      manualVisualSyncTimeout.current = null;
      syncVisuals(true);
    }, 1000);
  };

  const updateMetaTime = () => {
    // could be merged with 'updateMetaEvent' function
    if (!timelineStartDate.current) return;

    const event = new CustomEvent("meta-time-update", {
      detail: { time: getCurrentPlayerDateTime() },
    });
    document.dispatchEvent(event);
  };

  const updateTimelineVisualWidth = (forceUpdate = false) => {
    if (!timeline.current || !video.current) return;
    const currentTime = Math.round(video.current.currentTime);
    if (currentTime === previousTime.current && !forceUpdate) return;

    if (
      previousTime.current > currentTime ||
      Math.abs(previousTime.current - currentTime) > 1
    ) {
      console.log("SHOULD NOT HAPPEN WITHOUT SEEKING");
      previousTime.current = currentTime;
    }
    const timeUpdate = forceUpdate ? 1 : currentTime - previousTime.current;

    const updateWidth = secondsToPx(timeUpdate);
    const currentWidth = timeline.current!.getBoundingClientRect().width;

    const newWidth = currentWidth + updateWidth;
    if (newWidth <= trueTimelineWidth.current) {
      timeline.current.style.width = `${newWidth}px`;

      const currentlyUpdatingRange = document.querySelector<HTMLDivElement>(
        `#${currentlyUpdatingRangeId.current}`
      );
      if (currentlyUpdatingRange)
        currentlyUpdatingRange.style.width = `${newWidth}px`;
    }

    previousTime.current = currentTime;
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
      timeline.current!.style.left = `${-width + INDICATOR_PX_WIDTH / 2}px`;
      isOutOfBounds = true;
    }
    return isOutOfBounds;
  };

  const addToCurrentTime = (t: number) => {
    if (!video.current) return;
    video.current.currentTime = video.current.currentTime + t;
    updateMetaTime();
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
    startUpdatingCurrentEvent();
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
    stopUpdatingCurrentEvent();
  };

  return {
    onTimeUpdate,
    startDrag,
    video,
    timeDisplay,
    indicator,
    timeline,
    metadataContainer,
  };
}
