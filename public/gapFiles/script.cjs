const { exec } = require("child_process");

const imgCommand =
  "ffmpeg -f lavfi -i color=c=black:s=16x9 -frames:v 1 black.jpg -y";

exec(imgCommand, (error, stdout, stderr) => {
  if (error) {
    console.error(`exec error: ${error}`);
    return;
  }
  console.log(`stdout: ${stdout}`);
  console.error(`stderr: ${stderr}`);
});

let duration = 0.033; // start duration in seconds
const step = 0.033; // step duration in seconds
const end = 7; // end duration in seconds

function createMp4Base() {
  if (duration > end) {
    console.log("Finished creating videos.");
    return;
  }

  const filename = `output_${duration.toFixed(3)}s.mp4`;
  const command = `ffmpeg -loop 1 -i black.jpg -f lavfi -i anullsrc -t ${duration.toFixed(
    3
  )} -r 30 -pix_fmt yuv420p ${filename} -y`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`Created ${filename}`);
    console.error(`stderr: ${stderr}`);

    // Increase duration for the next video and call this function again
    duration += step;
    createMp4Base();
  });
}

// createMp4Base();
console.log("Started");

function createM4s() {
  if (duration > end) {
    console.log("Finished creating videos.");
    return;
  }

  const filename = `output_${duration.toFixed(3)}s.mp4`;
  const command = `ffmpeg -i ${filename} -c copy -hls_list_size 0 -hls_segment_type fmp4 -hls_segment_filename gap_${duration.toFixed(
    3
  )}_%01d.m4s -hls_fmp4_init_filename gap.mp4 playlist.m3u8 -y`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`exec error: ${error}`);
      return;
    }
    console.log(`Created ${filename}`);
    console.error(`stderr: ${stderr}`);

    // Increase duration for the next video and call this function again
    duration += step;
    createM4s();
  });
}

createM4s();
