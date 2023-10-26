import {
  Box,
  Button,
  chakra,
  Checkbox,
  Flex,
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

  const [playerDisabled, setPlayerDisabled] = useState(false);
  const [recorderDisabled, setRecorderDisabled] = useState(false);

  useEffect(() => {
    if (!isInitiated.current) {
      Promise.then(async (r) => {
        recorder.current = r;
      }).finally(() => {
        isInitiated.current = true;
        setIsReady(true);
      });
    }
  }, []);

  const startPlayer = () => {
    // player.reloadSourceOnError();

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
    <Box p="1rem" bg="purple">
      <Flex align="center" mb="1rem" columnGap="1rem">
        <Button
          onClick={() => {
            if (!recorderDisabled) recorder.current?.start();
            if (!playerDisabled) startPlayer();
          }}
        >
          Start Recorder
        </Button>
        <Button onClick={recorder.current?.stop}>Stop</Button>
      </Flex>
      <Flex>
        <Checkbox
          mr="2rem"
          onChange={() => setPlayerDisabled(!playerDisabled)}
          defaultChecked={playerDisabled}
        >
          Disable Player
        </Checkbox>
        <Checkbox
          onChange={() => setRecorderDisabled(!recorderDisabled)}
          defaultChecked={recorderDisabled}
        >
          Disable Recorder
        </Checkbox>
      </Flex>
      <Text>Preview</Text>
      {!isReady && <Spinner />}
      <Video id="preview" objectFit="contain" autoPlay muted />
      <Timeline canStart={isReady} />
    </Box>
  );
}
