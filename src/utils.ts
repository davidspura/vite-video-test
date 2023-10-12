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

export function throttle(cb: Function, timeout: number) {
  let waiting = false;

  return (...args: any) => {
    if (waiting) return;
    waiting = true;
    cb(...args);
    setTimeout(() => {
      waiting = false;
    }, timeout);
  };
}

export const hashCode = (s: string) => {
  return s.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0);
    return a & a;
  }, 0);
};

export const downloadDbFiles = async (db: any) => {
  const files = await db.getReadAll()();

  const chunkSize = 10;
  for (let i = 0; i < files.length; i += chunkSize) {
    const chunk = files.slice(i, i + chunkSize);
    download(chunk as unknown as any);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  function download(files: { data: Uint8Array; filename: string }[]) {
    for (const file of files) {
      const url = URL.createObjectURL(
        new Blob([file.data], { type: "application/octet-stream" })
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = file.filename;
      a.click();
      a.remove();
    }
  }
};

export const downloadMediaRecorderPayload = (event: BlobEvent) => {
  const url = URL.createObjectURL(
    new Blob([event.data], { type: "video/webm" })
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "video.webm";
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
