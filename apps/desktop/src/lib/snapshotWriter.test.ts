import { afterEach, describe, expect, it, vi } from "vitest";
import { createSnapshotWriter } from "./snapshotWriter";
afterEach(() => vi.useRealTimers());
describe("snapshot writes", () => {
  it("defers input-handler work and collapses a burst into the latest snapshot", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_value: number) => {});
    const writer = createSnapshotWriter(write, vi.fn());
    for (let i = 0; i < 100; i++) writer.schedule(i);
    expect(write).not.toHaveBeenCalled();
    await vi.runAllTimersAsync();
    expect(write.mock.calls).toEqual([[99]]);
  });
  it("flush waits for the latest state without overlapping slow writes", async () => {
    const releases: (() => void)[] = [];
    const write = vi.fn(
      (_value: number) => new Promise<void>((r) => releases.push(r)),
    );
    const writer = createSnapshotWriter(write, vi.fn());
    writer.schedule(1);
    const flushed = writer.flush();
    writer.schedule(2);
    writer.schedule(3);
    expect(write.mock.calls).toEqual([[1]]);
    releases.shift()!();
    await vi.waitFor(() => expect(write.mock.calls).toEqual([[1], [3]]));
    releases.shift()!();
    await flushed;
    expect(write).toHaveBeenCalledTimes(2);
  });
  it("reports storage errors to the execution gate", async () => {
    const failed = vi.fn();
    const writer = createSnapshotWriter(async () => {
      throw Error("disk full");
    }, failed);
    writer.schedule("request");
    await writer.flush();
    expect(failed).toHaveBeenCalledOnce();
  });
});
