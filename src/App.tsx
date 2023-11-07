import {
  Box,
  Button,
  chakra,
  Flex,
  Portal,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import createMediaRecorder from "./MediaRecorder/RecorderPreview";

import videojs from "video.js";
import "video.js/dist/video-js.css";

import Recorder from "./Recorder/Recorder";
import Timeline from "./Timeline";

const Video = chakra("video");
const Promise = createMediaRecorder();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const isInitiated = useRef(false);
  const recorder = useRef<Recorder | null>(null);

  useEffect(() => {
    if (!isInitiated.current) {
      Promise.then(async (r) => {
        recorder.current = r;
        r.start();
      }).finally(() => {
        isInitiated.current = true;
        setIsReady(true);
      });
    }
  }, []);

  const startPlayer = () => {
    const player = videojs("playlist_video", {
      liveui: true,
    });

    if (!player.paused()) return;

    player.src({
      src: "/playlist.m3u8",
      type: "application/x-mpegURL",
    });
    player.play();
  };

  return (
    <Portal>
      <Box
        w="100vw"
        h="100vh"
        pos="fixed"
        top="0px"
        left="0px"
        bg="black"
        zIndex={2}
      >
        {!isReady && <Spinner />}
        <Buttons
          startPlayer={startPlayer}
          stopRecorder={recorder.current?.stop}
        />
        <Box
          pos="relative"
          w="100%"
          h="100%"
          sx={{
            video: {
              maxW: "100vw",
              maxH: "100vh",
              w: "100%",
              h: "100%",
              objectFit: "contain",
              bg: "black",
            },
            ".playlist_video-dimensions": {
              width: "100% !important",
              height: "100% !important",
            },
          }}
        >
          <Timeline canStart={isReady} />
        </Box>
      </Box>
    </Portal>
  );
}

const Buttons = ({
  startPlayer,
  stopRecorder,
}: {
  startPlayer: () => void;
  stopRecorder: (() => void) | undefined;
}) => (
  <Flex
    align="center"
    mb="1rem"
    columnGap="1rem"
    pos="absolute"
    top="12"
    left="12"
    zIndex={3}
  >
    <Button onClick={startPlayer}>Start Player</Button>
    {/* <Button onClick={stopRecorder}>Stop Recorder</Button> */}
  </Flex>
);
