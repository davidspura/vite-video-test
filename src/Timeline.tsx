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
      <Box overflow="hidden" userSelect="none" w="100%" h="100%">
        <Video
          ref={video}
          id="playlist_video"
          className="video-js vjs-default-skin"
          controls
          preload="auto"
          muted
          data-setup="{}"
          onTimeUpdate={onTimeUpdate}
        />
        <Flex
          pos="absolute"
          bottom="14px"
          left="96px"
          right="144px"
          h="56px"
          alignItems="center"
          overflowX="clip"
        >
          <Flex w="100%" pos="relative" justify="center">
            <Box
              ref={indicator}
              w="4px"
              h="56px"
              bg="blue"
              pos="absolute"
              left="50%"
              top="50%"
              transform="translate(-50%, -50%)"
              zIndex={2}
            />
            <MetaData />
            <Box pos="relative" h="22px" zIndex={1}>
              <Flex
                w="0px"
                left="0px"
                h="100%"
                ref={timeline}
                alignItems="center"
                pos="absolute"
                bgImage="/IntervalR.svg"
                bgRepeat="repeat-x"
                sx={{ backgroundPositionY: "center" }}
                onMouseDown={startDrag}
              >
                <Flex
                  zIndex={-1}
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
    <Flex transform="translateY(calc(100% + 4px))" alignItems="center">
      {timestamps.map((_, i) => {
        const time = new Date(new Date(startDate).getTime() + 5 * i * 60000);
        return (
          <Box key={i} minW="240px">
            <Box
              display="inline-flex"
              transform="translateX(-50%)"
              color="white"
            >
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
    <Flex
      userSelect="none"
      alignItems="center"
      columnGap="1rem"
      pos="absolute"
      top="-24px"
      left="50%"
      transform="translate(-50%, -100%)"
    >
      <Text ref={dateContainer} color="white">
        {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}
      </Text>
      {events.map((event) => {
        return (
          <Box color="white" key={event.uniqueId}>
            {event.type}
          </Box>
        );
      })}
    </Flex>
  );
}
