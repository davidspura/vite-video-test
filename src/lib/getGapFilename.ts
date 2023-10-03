export function getGapFilename(duration: string) {
  const durationNum = parseFloat(duration);
  const closestDuration = Math.round(durationNum / 0.02133333) * 0.02133333;

  if (closestDuration > 6.997) {
    console.log("GAP OUT OF RANGE");
    return `gap_6.997_0.m4s`;
  }

  const filename = `gap_${closestDuration.toFixed(3)}_0.m4s`;
  console.log("Found gap filename: ", filename);
  return filename;
}
