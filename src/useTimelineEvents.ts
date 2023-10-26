import { useCallback, useRef } from "react";
import {
  getEventInDateRange,
  msToSeconds,
  strictIsEqual,
} from "./Recorder/extensions";

export default function useTimelineEvents(
  getCurrentPlayerDateTime: () => number
) {
  const motionEvents = useRef<CameraEvent[]>([]);
  const noiseEvents = useRef<CameraEvent[]>([]);
  const indexedEvents = useRef<{
    [startDate: string]: CameraEvent | CameraEvent[];
  }>({});

  const metaEventsReference = useRef<CameraEvent[]>([]);

  const updateInterval = useRef<number | null>(null);
  const previousTime = useRef(0);

  const updateMetaEvents = (update: CameraEvent[]) => {
    metaEventsReference.current = update;
    const event = new CustomEvent("meta-events-update", {
      detail: { events: update },
    });
    document.dispatchEvent(event);
  };

  const mapEvents = useCallback((cameraEvents: CameraEvent[]) => {
    cameraEvents
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .forEach((event) => {
        const startInMs = new Date(event.start).getTime();
        const start = Math.round(msToSeconds(startInMs));
        const existingIndexedEvent = indexedEvents.current[start];

        if (existingIndexedEvent) {
          if (Array.isArray(existingIndexedEvent))
            existingIndexedEvent.push(event);
          else indexedEvents.current[start] = [existingIndexedEvent, event];
        } else indexedEvents.current[start] = event;

        if (event.type === "AWAKE") noiseEvents.current.push(event);
        if (event.type === "MOTION") motionEvents.current.push(event);
      });
  }, []);

  const updateMetaEvent = useCallback(() => {
    // could be merged with 'updateMetaTime' function

    const time = Math.round(msToSeconds(getCurrentPlayerDateTime()));
    if (time === previousTime.current) return;

    const newlySelectedEvent = indexedEvents.current[time];
    let currentEvents: CameraEvent[] = [...metaEventsReference.current];

    const alreadyExists =
      newlySelectedEvent &&
      currentEvents.some((e) => {
        if (Array.isArray(newlySelectedEvent)) {
          return newlySelectedEvent.some(
            (newEvent) => newEvent.uniqueId === e.uniqueId
          );
        }
        return newlySelectedEvent.uniqueId === e.uniqueId;
      });

    if (newlySelectedEvent && !alreadyExists) {
      if (Array.isArray(newlySelectedEvent))
        currentEvents.push(...newlySelectedEvent);
      else currentEvents.push(newlySelectedEvent);

      console.log("Found new meta events: ", newlySelectedEvent);
    }

    currentEvents = currentEvents.filter((event) => {
      const isOutOfDate =
        time > Math.round(msToSeconds(new Date(event.end).getTime())) ||
        time < Math.round(msToSeconds(new Date(event.start).getTime()));
      if (isOutOfDate) console.log("Found out of date meta event ", event);
      return !isOutOfDate;
    });

    const isStale = strictIsEqual(metaEventsReference.current, currentEvents);
    if (!isStale) {
      console.log("Updating meta events in 'updateMetaEvent'");
      updateMetaEvents(currentEvents);
    }
    previousTime.current = time;
  }, [getCurrentPlayerDateTime]);

  const startUpdatingCurrentEvent = useCallback(
    (once = false) => {
      const tryUpdate = () => {
        const currentDate = new Date(getCurrentPlayerDateTime());
        const update: CameraEvent[] = [];
        const noiseEvent = getEventInDateRange(
          noiseEvents.current,
          currentDate
        );
        const motionEvent = getEventInDateRange(
          motionEvents.current,
          currentDate
        );

        if (noiseEvent) update.push(noiseEvent);
        if (motionEvent) update.push(motionEvent);

        const isStale = strictIsEqual(metaEventsReference.current, update);
        if (!isStale) {
          console.log("Updating meta events in 'startUpdatingCurrentEvent'");
          updateMetaEvents(update);
        }
      };

      console.log("'startUpdatingCurrentEvent' called");
      if (once) tryUpdate();
      else {
        if (updateInterval.current) return;
        updateInterval.current = setInterval(() => {
          console.log("Forcing update");
          tryUpdate();
        }, 1000);
      }
    },
    [getCurrentPlayerDateTime]
  );

  const stopUpdatingCurrentEvent = useCallback(() => {
    console.log("'stopUpdatingCurrentEvent' called");
    if (updateInterval.current) {
      clearInterval(updateInterval.current);
      updateInterval.current = null;
    }
    startUpdatingCurrentEvent(true);
  }, [startUpdatingCurrentEvent]);

  return {
    mapEvents,
    updateMetaEvent,
    startUpdatingCurrentEvent,
    stopUpdatingCurrentEvent,
  };
}
