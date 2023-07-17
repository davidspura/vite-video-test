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
