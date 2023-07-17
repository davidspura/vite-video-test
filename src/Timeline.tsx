import { Box, Flex, chakra } from "@chakra-ui/react";
import {
  useRef,
  useEffect,
  MouseEvent as ReactMouseEvent,
  useCallback,
  useState,
} from "react";
import { HlsDbItem } from "./DB";
import { throttle } from "./lib/utils";

const Video = chakra("video");
const MAX_TIMELINE_LENGTH_IN_SEC = 8 * 60 * 60;
const SECONDS_BETWEEN_LINES = 10;

const TestTimeline = ({ canStart }: { canStart: boolean }) => {
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
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
    const width = duration / 1000;
    if (timeline.current) timeline.current.style.width = `${width * 0.8}px`;
  }, []);

  const addTimestamps = useCallback(() => {
    const fiveMinsInPx = 240;
    const numberOfTimestamps =
      Math.floor(
        timeline.current!.getBoundingClientRect().width / fiveMinsInPx
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

  useEffect(() => {
    const addTimelineHighlights = (e: Event) => {
      const { detail } = e as CustomEvent<HlsDbItem>;
      const startDate = new Date(timelineStartDate.current || new Date());
      const highlightStartDate = new Date(detail.createdAt);

      const highlightStartTime =
        highlightStartDate.getTime() - startDate.getTime();
      const scaledHighlighStartTime = (highlightStartTime / 1000) * 0.8;
    };

    document.addEventListener("timeline-update", addTimelineHighlights);
    return () => {
      document.removeEventListener("timeline-update", addTimelineHighlights);
    };
  }, []);

  const onTimeUpdate = () => {
    if (!videoRef.current || !indicator.current || !timeline.current) return;
    if (isDragging.current) return;
    const time = videoRef.current.currentTime;
    const currentTime = time * 0.8;
    timeline.current.style.left = `-${currentTime}px`;
    timeDisplay.current!.innerText =
      timelineStartDate.current! + videoRef.current!.currentTime * 1000;
  };

  if (!canStart) return null;

  const onTimelineClick = (e: MouseEvent) => {
    if (!timeline.current || !videoRef.current) return;
    const rect = timeline.current.getBoundingClientRect();
    const mouseX = (e.clientX + 1) * 1.25 - rect.left * 1.25;
    videoRef.current.currentTime = mouseX;
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
      timeline.current!.style.left = `${-width + 2}px`;
      isOutOfBounds = true;
    }
    return isOutOfBounds;
  };

  const addToCurrentTime = throttle((t: number) => {
    videoRef.current!.currentTime = videoRef.current!.currentTime + t;
  }, 500);

  const startDrag = (e: ReactMouseEvent) => {
    initialMouseX.current = e.pageX;
    let lastSeekDistance = 0;
    videoRef.current?.pause();
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
        const currentTime = trueSeekDistance * 1.25;
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
    videoRef.current?.play();

    if (e.pageX === initialMouseX.current) onTimelineClick(e);
    initialMouseX.current = null;
  };

  return (
    <>
      <Box overflow="hidden">
        <Video
          ref={videoRef}
          id="playlist_video"
          className="video-js vjs-default-skin"
          controls
          preload="auto"
          muted
          data-setup="{}"
          onTimeUpdate={onTimeUpdate}
          maxW="100vw"
          onError={(e) => console.log("CRASHED ", e)}
        />

        {/* </Video> */}
        <Flex
          maxW="100vw"
          mt="4rem"
          pos="relative"
          mb="8rem"
          justify="center"
          alignItems="center"
          direction="column"
        >
          {/* <canvas ref={canvasRef} height="200" /> */}
          <Box ref={timeDisplay}>Time</Box>
          <Box ref={indicator} w="4px" h="60px" bg="blue" pos="relative">
            <Box
              ref={timeline}
              h="48px"
              bg="blackAlpha.700"
              // w="0px"
              w="250px"
              left="0px"
              pos="absolute"
              top="50%"
              transform="translate(2px, -50%)"
              bgImage="/IntervalR.svg"
              bgRepeat="repeat-x"
              sx={{ backgroundPositionY: "center" }}
              // onClick={onTimelineClick}
              onMouseDown={startDrag}
            >
              <Flex
                alignItems="center"
                transform="translateY(54px)"
                userSelect="none"
              >
                {timestamps.map((_, i) => {
                  const timeWithAddedMins = new Date(
                    new Date(timelineStartDate.current!).getTime() +
                      5 * i * 60000
                  );
                  return (
                    <Box key={i} minW="240px">
                      <Box display="inline-flex" transform="translateX(-50%)">
                        {timeWithAddedMins.toDateString()}
                      </Box>
                    </Box>
                  );
                })}
              </Flex>
            </Box>
          </Box>
        </Flex>
      </Box>
    </>
  );
};

export default TestTimeline;
