import { Box, Button, chakra, Flex, Spinner, Text } from "@chakra-ui/react";
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
    setTimeout(() => {
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
      player.play();
    }, 30000);
  };

  return (
    <Box p="1rem">
      <Flex align="center" mb="1rem" columnGap="1rem">
        <Button
          onClick={() => {
            recorder.current?.start();
            startPlayer();
          }}
        >
          Start
        </Button>
        <Button onClick={recorder.current?.stop}>Stop</Button>
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
