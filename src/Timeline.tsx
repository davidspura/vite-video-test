import { Box, Flex, chakra } from "@chakra-ui/react";
import useTimeline from "./useTimeline";
import { useEffect, useState } from "react";
import Player from "video.js/dist/types/player";

const Video = chakra("video");

export default function TestTimeline({
  canStart,
  player,
}: {
  canStart: boolean;
  player: Player | null;
}) {
  const {
    onTimeUpdate,
    startDrag,
    video,
    timeDisplay,
    indicator,
    timeline,
    metadataContainerRef,
  } = useTimeline(player);

  if (!canStart) return null;

  return (
    <>
      <Box
        overflow="hidden"
        userSelect="none"
        sx={{
          ".playlist_video-dimensions": {
            width: "640px",
            height: "480px",
          },
        }}
      >
        <Video
          ref={video}
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
        <Flex
          maxW="100vw"
          mt="4rem"
          pos="relative"
          mb="8rem"
          justify="center"
          alignItems="center"
          direction="column"
        >
          <Box userSelect="none" ref={timeDisplay}>
            Time
          </Box>
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
              onMouseDown={startDrag}
            >
              <Flex
                alignItems="center"
                transform="translateY(54px)"
                userSelect="none"
                pos="relative"
                ref={metadataContainerRef}
              >
                <TimeStamps />
              </Flex>
            </Box>
          </Box>
        </Flex>
      </Box>
    </>
  );
}

function TimeStamps() {
  const [timestamps, setTimestamps] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);

  useEffect(() => {
    function onUpdate(e: Event) {
      const { detail } = e as CustomEvent<{
        startDate: string;
        timestamps: number[];
      }>;
      const { startDate, timestamps } = detail;
      setStartDate(startDate);
      setTimestamps(timestamps);
    }

    document.addEventListener("timestamps-update", onUpdate);
    return () => {
      document.removeEventListener("timestamps-update", onUpdate);
    };
  }, []);

  if (!startDate) return null;

  return timestamps.map((_, i) => {
    const time = new Date(new Date(startDate).getTime() + 5 * i * 60000);
    return (
      <Box key={i} minW="240px" zIndex={2}>
        <Box display="inline-flex" transform="translateX(-50%)">
          {time.toLocaleTimeString()}
        </Box>
      </Box>
    );
  });
}
