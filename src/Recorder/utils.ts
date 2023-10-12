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
