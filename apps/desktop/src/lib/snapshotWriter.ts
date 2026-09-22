/** Serialize only the newest snapshot, outside the input event, with one write in flight. */
export function createSnapshotWriter<T>(
  write: (snapshot: T) => Promise<void>,
  onError: () => void,
) {
  let pending: { value: T } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running: Promise<void> | undefined;
  async function drain() {
    try {
      while (pending) {
        const snapshot = pending.value;
        pending = undefined;
        await write(snapshot);
      }
    } catch {
      pending = undefined;
      onError();
    }
  }
  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (!running && pending) {
      running = drain().finally(() => {
        running = undefined;
      });
    }
    return running
      ? running.then(() => (pending ? flush() : undefined))
      : Promise.resolve();
  }
  return {
    schedule(value: T) {
      pending = { value };
      if (timer === undefined) timer = setTimeout(() => void flush(), 0);
    },
    flush,
  };
}
