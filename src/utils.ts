export const getStream = async () =>
  await navigator.mediaDevices.getUserMedia({
    video: true,
    audio: true,
  });

export const loadPreview = async () => {
  const stream = await getStream();
  const video = document.querySelector("#preview") as HTMLVideoElement;
  video.srcObject = stream;
  return stream;
};

export const SLICE_IN_MS = 2000;
export const bToMb = (b: number) => (b / (1024 * 1024)).toFixed(2);
