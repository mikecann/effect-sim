

export const polyfillRAF = () => {
  if (!globalThis.requestAnimationFrame) {
    let lastTime = 0;
    globalThis.requestAnimationFrame = (callback) => {
      const currTime = Date.now();
      const timeToCall = Math.max(0, 16 - (currTime - lastTime));
      const id = setTimeout(() => callback(currTime + timeToCall), timeToCall);
      lastTime = currTime + timeToCall;
      return id as unknown as number;
    };
  }
};