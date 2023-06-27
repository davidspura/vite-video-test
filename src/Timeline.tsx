import { Box, chakra } from "@chakra-ui/react";
import { useRef, useEffect } from "react";
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
    if (!canStart || !canvasRef.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    let x = 1;
    const y = 100;
    // should be 8px but line is 2px wide and gets rendered in the center, so it shaves off 1px on each side
    const lineSpacing = 10;
    const lineLength = 5;
    const numLines = MAX_TIMELINE_LENGTH_IN_SEC / SECONDS_BETWEEN_LINES;
    const totalWidth = lineSpacing * numLines;
    canvasRef.current!.width = totalWidth;

    for (let i = 0; i < numLines; i++) {
      const makeBiggerLine = i % 6 === 0;
      ctx.beginPath();
      ctx.moveTo(x, makeBiggerLine ? 95 : y);
      ctx.lineTo(x, y + (makeBiggerLine ? 10 : lineLength));
      ctx.lineWidth = 2;
      ctx.stroke();
      x += lineSpacing;
    }

    const onClick = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      // const lineIndex = Math.floor(mouseX / lineSpacing);
      const lineWidthOffset = 2;
      console.log(mouseX - lineWidthOffset);
    };

    canvas.addEventListener("click", onClick);
    return () => {
      canvas.removeEventListener("click", onClick);
    };
  }, [canStart]);

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
    if (!videoRef.current || !indicator.current) return;
    const time = videoRef.current.currentTime;
    const currentTime = time * 0.8;
    indicator.current.style.left = `${currentTime}px`;
  };

  if (!canStart) return null;
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
      >
        <source src="/playlist.m3u8" type="application/x-mpegURL" />
      </Video>
      <Box maxW="100vw" overflow="scroll" mt="4rem" py="2rem">
        {/* <canvas ref={canvasRef} height="200" /> */}
        <Box
          ref={timeline}
          h="48px"
          bg="blackAlpha.700"
          w="0px"
          // w="48px"
          bgImage="/IntervalR.svg"
          bgRepeat="repeat-x"
          pos="relative"
          sx={{ backgroundPositionY: "center" }}
        >
          <Box
            ref={indicator}
            w="4px"
            h="60px"
            bg="blue"
            pos="absolute"
            left="0"
            top="50%"
            transform="translate(-50%, -50%)"
          />
        </Box>
      </Box>
    </>
  );
};

export default TestTimeline;
