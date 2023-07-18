import { Box, Flex, chakra } from "@chakra-ui/react";
import useTimeline from "./useTimeline";

const Video = chakra("video");

const TestTimeline = ({ canStart }: { canStart: boolean }) => {
  const {
    onTimeUpdate,
    startDrag,
    video,
    timeDisplay,
    indicator,
    timeline,
    timestamps,
    timelineStartDate,
  } = useTimeline();

  if (!canStart) return null;
  return (
    <>
      <Box overflow="hidden">
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
