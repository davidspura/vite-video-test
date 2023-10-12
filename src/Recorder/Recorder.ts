import DB from "./DB";
import { DELETE_THRESHOLD, SEGMENT_LENGTH } from "./const";
import DbController from "./modules/DbController";
import GapTimeRanges from "./modules/GapTimeRanges";
import Playlist from "./modules/Playlist";
import Transcoder from "./modules/Transcoder";

export default class Recorder {
  private mediaRecorder: MediaRecorder;
  constructor(private stream: MediaStream) {
    this.mediaRecorder = new MediaRecorder(this.stream, {
      mimeType: "video/webm; codecs=h264",
      // mimeType: "video/mp4",
    });
    this.mediaRecorder.addEventListener("dataavailable", this.onDataAvailable);
  }
  private timeout: number | null = null;
  private hasCreatedInitFile = false;
  private isTranscoding = false;

  private sourceDate: Date = new Date();
  private trancoderQue: Blob[] = [];

  db = new DB();
  private dbController = new DbController(this.db);
  playlist = new Playlist(this.dbController);
  private transcoder = new Transcoder(this.playlist);

  status: "idle" | "recording" = "idle";

  init = async () => {
    await this.db.init();
    await this.transcoder.init();
    await this.dbController.deleteOlderThan(DELETE_THRESHOLD);
    await this.playlist.loadGapFiles();
  };

  start = async () => {
    await this.startRecordingSourceVideo();
  };

  stop = () => {
    console.log("Stop called");
    if (this.timeout) clearTimeout(this.timeout);
    this.status = "idle";
    this.mediaRecorder?.stop();
    GapTimeRanges.reset();
  };

  private createSourceVideo = () => {
    if (this.status === "idle") {
      console.warn("Recorder is in idle state, but createSourceVideo fired");
      return;
    }

    this.mediaRecorder?.start();

    console.log("Called mediaRecorder.start()");
    this.timeout = setTimeout(() => {
      this.mediaRecorder?.stop();
      console.log("Called mediaRecorder.stop()");
      this.createSourceVideo();
    }, SEGMENT_LENGTH);
  };

  private startRecordingSourceVideo = async () => {
    if (this.status === "recording") return;
    console.log("Starting creating segments");
    this.hasCreatedInitFile = false;
    this.status = "recording";
    const sourceDate = new Date();
    this.sourceDate = sourceDate;
    await this.dbController.fillSegmentGaps(sourceDate.toISOString());
    await this.playlist.prepareNextUsableIndexes();
    this.createSourceVideo();
  };

  private onDataAvailable = async (event: BlobEvent) => {
    console.log("OnDataAvailable fired");
    this.dbController.deleteOlderThan(DELETE_THRESHOLD, () => {
      this.playlist.discontinuitySequence += 1;
    });

    if (this.isTranscoding) {
      console.log("Transcoding in progress, adding to que...");
      this.trancoderQue.push(event.data);
      return;
    }

    try {
      this.isTranscoding = true;
      await this.transcode(event.data);
      if (!this.hasCreatedInitFile) this.hasCreatedInitFile = true;

      while (this.trancoderQue.length > 0) {
        console.log("Found items in que: ", this.trancoderQue);
        await this.transcode(this.trancoderQue.shift()!);
      }
      this.isTranscoding = false;
    } catch (err) {
      console.log("Error while transcoding", err);
      this.isTranscoding = false;
    }
  };

  private transcode = async (blob: Blob) => {
    console.time("transcoding-time");
    const { initData, segmentsData } = await this.transcoder.transcode({
      blob,
      includeInitData: !this.hasCreatedInitFile,
    });

    console.timeEnd("transcoding-time");

    let initFilename: string | undefined;
    if (initData) {
      const index = this.playlist.getLatestInitIndex();
      initFilename = `i${index}.mp4`;
      const initPayload: HlsDbItem = {
        filename: initFilename,
        data: initData,
        createdAt: this.sourceDate.toISOString(),
        rotation: "ROTATION_0",
        duration: null,
        discontinuity: false,
        index,
      };
      await this.db.getWrite()(initPayload);
      this.playlist.addToNextInitIndex(1);
    }

    const segmentStartIndex = this.playlist.getLatestSegmentIndex();
    const write = this.db.getWrite();

    let i = 0;
    for (const segment of segmentsData) {
      const { data, duration } = segment;
      const index = segmentStartIndex + i;
      const segmentPayload: HlsDbItem = {
        filename: `s${index}.m4s`,
        data,
        duration,
        createdAt: this.sourceDate.toISOString(),
        rotation: "ROTATION_0",
        discontinuity: i === 0,
        index,
        initFilename,
      };
      await write(segmentPayload);
      console.log("DONE saving segment ", index);

      this.sourceDate.setMilliseconds(
        this.sourceDate.getMilliseconds() + Number(duration) * 1000
      );
      i++;
    }

    this.playlist.addToNextSegmentIndex(segmentsData.length);
    this.playlist.lastSentDeltaPlaylist = null;
  };
}
