export default class Hex {
  static arrayToHex = (array: Uint8Array) => {
    return [...array].map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  static hexToArray = (hex: string) => {
    return Uint8Array.from(
      hex.match(/.{1,2}/g)!.map((byte) => parseInt(byte, 16))
    );
  };

  static numberToHex = (num: number) => {
    const result = num.toString(16).padStart(8, "0");
    console.log(`HEX for ${num}: ${result}`);
    return result;
  };

  static updateHex = (
    hex: string,
    videoDuration: string,
    audioDuration: string
  ) => {
    let str = hex;
    const indexOfFirst_TFHD = str.indexOf("74666864");
    let firstPart = str.slice(indexOfFirst_TFHD + 8);
    const indexOfVideoDuration = firstPart.indexOf("00000200");
    firstPart =
      firstPart.slice(0, indexOfVideoDuration) +
      videoDuration +
      firstPart.slice(indexOfVideoDuration + 8);
    str = str.slice(0, indexOfFirst_TFHD + 8) + firstPart;

    const indexOfSecond_TFHD = str.indexOf("74666864", indexOfFirst_TFHD + 8);
    let secondPart = str.slice(indexOfSecond_TFHD + 8);
    const indexOfAudioDuration = secondPart.indexOf("00000400");
    secondPart =
      secondPart.slice(0, indexOfAudioDuration) +
      audioDuration +
      secondPart.slice(indexOfAudioDuration + 8);
    str = str.slice(0, indexOfSecond_TFHD + 8) + secondPart;

    return str;
  };
}

export const getVideoSampleDuration = (target: number) => {
  const adjustedTarget = (Math.round((target * 12800) / 175) * 175) / 12800;
  const result = (adjustedTarget * 12800) / 175;
  const roundedResult = Math.round(result);
  console.log(
    `Adjusted VIDEO target for ${target} is ${adjustedTarget}, result is ${result} => ${roundedResult}`
  );
  return result;
};

export const getAudioSampleDuration = (target: number) => {
  const adjustedTarget = (Math.round((target * 44100) / 303) * 303) / 44100;
  const result = (adjustedTarget * 44100) / 303;
  const roundedResult = Math.round(result);
  console.log(
    `Adjusted AUDIO target for ${target} is ${adjustedTarget}, result is ${result} => ${roundedResult}`
  );
  return roundedResult;
};
