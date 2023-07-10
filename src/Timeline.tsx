import { Box, Flex, chakra } from "@chakra-ui/react";
import { useRef, useEffect, MouseEvent } from "react";
import { HlsDbItem } from "./DB";

const Video = chakra("video");
const MAX_TIMELINE_LENGTH_IN_SEC = 8 * 60 * 60;
const SECONDS_BETWEEN_LINES = 10;

const TestTimeline = ({ canStart }: { canStart: boolean }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const timeline = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const timelineStartDate = useRef<string | null>(null);

  useEffect(() => {
    const onDurationUpdate = (e: Event) => {
      const { detail } = e as CustomEvent;
      const { duration, startDate } = detail;
      timelineStartDate.current = startDate;
      const width = duration / 1000;
      if (timeline.current) timeline.current.style.width = `${width * 0.8}px`;
    };
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
    const time = videoRef.current.currentTime;
    const currentTime = time * 0.8;
    // indicator.current.style.left = `${currentTime}px`;
    timeline.current.style.left = `-${currentTime}px`;
  };

  if (!canStart) return null;

  const onTimelineClick = (e: MouseEvent) => {
    if (!timeline.current || !videoRef.current) return;
    const rect = timeline.current.getBoundingClientRect();
    const mouseX = (e.clientX + 1) * 1.25 - rect.left * 1.25;

    console.log("Setting new player time: ", mouseX);
    videoRef.current.currentTime = mouseX;
  };

  return (
    <>
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
      <Flex maxW="100vw" mt="4rem" pos="relative" mb="8rem" justify="center">
        {/* <canvas ref={canvasRef} height="200" /> */}
        <Box ref={indicator} w="4px" h="60px" bg="blue" pos="relative">
          <Box
            ref={timeline}
            h="48px"
            bg="blackAlpha.700"
            // w="0px"
            w="48px"
            left="0px"
            pos="absolute"
            top="50%"
            transform="translate(2px, -50%)"
            bgImage="/IntervalR.svg"
            bgRepeat="repeat-x"
            sx={{ backgroundPositionY: "center" }}
            onClick={onTimelineClick}
          />
        </Box>
      </Flex>
    </>
  );
};

export default TestTimeline;
