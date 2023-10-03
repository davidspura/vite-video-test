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
