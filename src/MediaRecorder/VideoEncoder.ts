// import * as probe from "mux.js/lib/mp4/probe.js";
// import { generator } from "../generator";
import { loadPreview } from "../utils";

export default async function createVideoEncoder() {
  const stream = await loadPreview();
  const encoderConfig: VideoEncoderConfig = {
    codec: "avc1.64001E",
    height: 480,
    width: 640,
    framerate: 20,
  };
  const videoTrack = stream.getVideoTracks()[0];
  const processor = new MediaStreamTrackProcessor({
    track: videoTrack,
  });

  const encodedFrames: EncodedVideoChunk[] = [];

  const muxChunks = () => {
    // const initSegments = generator.initSegment(stream.getTracks());
    // console.log("initSegments: ", initSegments);
  };

  const processChunk: EncodedVideoChunkOutputCallback = (chunk, metadata) => {
    encodedFrames.push(chunk);
  };

  const reader = processor.readable.getReader();
  const encoder = new VideoEncoder({
    error: (e) => console.log(e),
    output: processChunk,
  });
  encoder.configure(encoderConfig);

  const processFrames = async () => {
    const { done, value } = await reader.read();
    if (done) {
      console.log("Done");
      await encoder.flush();
      return;
    }
    if (value) {
      encoder.encode(value);
      value.close();
    }
    processFrames();
  };

  //   const videoEncoder = new VideoEncoder({
  //     output: onProcess,
  //     error: onError,
  //   });

  //   const onVideoFrame = (frame: VideoFrame) => {
  //     videoEncoder.encode(frame);
  //   };

  //   videoEncoder.configure({
  //     height,
  //     width,
  //     hardwareAcceleration: "prefer-hardware",
  //     codec: "avc1.64001E",
  //   });

  //   (videoEncoder as any).addEventListener("dequeue", (e: any) => {
  //     console.log("Deque ", e);
  //   });

  return () => {
    console.log("Started");
    processFrames();
    setTimeout(muxChunks, 2500);
  };
}
