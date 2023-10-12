import { loadPreview } from "../utils";
import Recorder from "../Recorder/Recorder";
import SW from "../SW";

export default async function createMediaRecorder() {
  const sw = new SW();
  const stream = await loadPreview();
  const recorder = new Recorder(stream);

  await recorder.init();
  sw.db = recorder.db;
  sw.playlist = recorder.playlist;
  await sw.start();

  return recorder;
}
