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

import Recorder from "./final/Recorder";
import Timeline from "./Timeline";

const Video = chakra("video");
const Promise = createMediaRecorder();

function App() {
  const [isReady, setIsReady] = useState(false);
  const isInitiated = useRef(false);
  const recorder = useRef<Recorder | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

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
    // const player =
    //   videojs.getPlayer("playlist_video") || videojs("playlist_video");
    // player.options({
    //   liveui: true,
    //   html5: {
    //     vhs: {
    //       overrideNative: true,
    //       // maxPlaylistRetries: 200,
    //       // allowSeeksWithinUnsafeLiveWindow: true,
    //       // handlePartialData: true,
    //       liveRangeSafeTimeDelta: 10,
    //     },
    //     nativeAudioTracks: false,
    //     nativeVideoTracks: false,
    //   },
    // });

    // videojs.log.level("debug");
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
    <Box p="1rem">
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
      {/* <Video id="playlist_video" controls muted /> */}

      {/* <Video
        id="static_playlist_video"
        className="video-js vjs-default-skin"
        controls
        muted
      >
        <source
          src="http://192.168.1.54:50507/index.m3u8"
          type="application/x-mpegURL"
        />
      </Video> */}

      <Timeline canStart={isReady} />
    </Box>
  );
}

export default App;

// {isReady && (
//   <>
//     <Video
//       ref={videoRef}
//       id="playlist_video"
//       className="video-js vjs-default-skin"
//       controls
//       preload="auto"
//       muted
//       data-setup="{}"
//       onTimeUpdate={() => {
//         console.log(videoRef.current?.currentTime);
//       }}
//     >
//       <source src="/playlist.m3u8" type="application/x-mpegURL" />
//     </Video>
//     {/* <Player /> */}
//     {timeline.render()}
//   </>
// )}
