type CameraEvent = {
  uniqueId: string;
  start: string;
  end: string;
  intervalEvent: boolean;
  type: "AWAKE" | "MOTION" | "CONNECT" | "DISCONNECT";
  additionalData: string;
  finished: boolean;
};

function getRandomTimeRange(range = 20) {
  let now = new Date();
  let randomMinutes = Math.floor(Math.random() * range) + 1;
  let start = new Date(now.getTime() - randomMinutes * 60 * 1000);
  let end = new Date(
    start.getTime() +
      Math.floor(Math.random() * (randomMinutes - 1) + 1) * 60 * 1000
  );

  return {
    start: start.toISOString(),
    end: end.toISOString(),
  };
}

const events: CameraEvent[] = [
  {
    ...getRandomTimeRange(5),
    additionalData: "{}",
    finished: true,
    intervalEvent: true,
    type: "AWAKE",
    uniqueId: "1",
  },
  {
    ...getRandomTimeRange(10),
    additionalData: "{}",
    finished: true,
    intervalEvent: true,
    type: "MOTION",
    uniqueId: "2",
  },
  {
    ...getRandomTimeRange(15),
    additionalData: "{}",
    finished: true,
    intervalEvent: true,
    type: "AWAKE",
    uniqueId: "3",
  },
  {
    ...getRandomTimeRange(20),
    additionalData: "{}",
    finished: true,
    intervalEvent: true,
    type: "AWAKE",
    uniqueId: "4",
  },
  {
    ...getRandomTimeRange(25),
    additionalData: "{}",
    finished: true,
    intervalEvent: true,
    type: "MOTION",
    uniqueId: "5",
  },
];

export { events as testEvents };
