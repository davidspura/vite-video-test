import { useEffect, useRef, useState } from "react";
import { Box, Flex, Text, chakra } from "@chakra-ui/react";
import useTimeline from "./useTimeline";

const Video = chakra("video");

export default function TestTimeline({ canStart }: { canStart: boolean }) {
  const {
    onTimeUpdate,
    startDrag,
    video,
    indicator,
    timeline,
    metadataContainer,
  } = useTimeline();

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
          <MetaData />
          <Box ref={indicator} w="4px" h="60px" bg="blue" pos="relative">
            <Flex
              ref={timeline}
              w="0px"
              h="48px"
              alignItems="center"
              left="0px"
              pos="absolute"
              top="50%"
              transform="translate(2px, -50%)"
              bgImage="/IntervalR.svg"
              bgRepeat="repeat-x"
              overflow="hidden"
              sx={{ backgroundPositionY: "center" }}
              onMouseDown={startDrag}
            >
              <Flex
                alignItems="center"
                userSelect="none"
                pos="relative"
                ref={metadataContainer}
              >
                <TimeStamps />
              </Flex>
            </Flex>
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

  return (
    <Flex transform="translateY(54px)" alignItems="center">
      {timestamps.map((_, i) => {
        const time = new Date(new Date(startDate).getTime() + 5 * i * 60000);
        return (
          <Box key={i} minW="240px" zIndex={2}>
            <Box display="inline-flex" transform="translateX(-50%)">
              {time.toLocaleTimeString()}
            </Box>
          </Box>
        );
      })}
    </Flex>
  );
}

function MetaData() {
  const dateContainer = useRef<HTMLDivElement>(null);
  const [events, setEvents] = useState<CameraEvent[]>([]);

  useEffect(() => {
    function updateMetaTime(e: Event) {
      if (!dateContainer.current) return;
      const { detail } = e as CustomEvent<{ time: number }>;
      const date = new Date(detail.time);
      dateContainer.current.innerText = `${date.getHours()} : ${date.getMinutes()} : ${date.getSeconds()}`;
    }
    function updateMetaEvents(e: Event) {
      const { detail } = e as CustomEvent<{ events: CameraEvent[] }>;
      console.log("Got event update: ", detail);
      setEvents(detail.events);
    }

    document.addEventListener("meta-time-update", updateMetaTime);
    document.addEventListener("meta-events-update", updateMetaEvents);
    return () => {
      document.removeEventListener("meta-time-update", updateMetaTime);
      document.removeEventListener("meta-events-update", updateMetaEvents);
    };
  }, []);

  return (
    <Flex userSelect="none" alignItems="center" columnGap="1rem">
      <Text ref={dateContainer}>
        {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
      </Text>
      {events.map((event) => {
        return <Box key={event.uniqueId}>{event.type}</Box>;
      })}
    </Flex>
  );
}
