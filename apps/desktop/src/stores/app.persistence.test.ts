import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ save: vi.fn(async (_data: string) => {}) }));
vi.mock("../lib/bridge", () => ({ native: false, bridge: mocks }));
import { useApp } from "./app";
afterEach(async () => {
  await vi.runAllTimersAsync();
  useApp.setState({ ready: false });
  vi.useRealTimers();
});
it("does not write history for transient controls, but retains the latest durable setting", async () => {
  vi.useFakeTimers();
  useApp.setState({ ready: true });
  await vi.runAllTimersAsync();
  mocks.save.mockClear();
  const state = useApp.getState();
  state.openSettings(true);
  state.openSettings(false);
  state.setSidebar(false);
  state.notify("Fixture notification");
  await vi.runAllTimersAsync();
  expect(mocks.save).not.toHaveBeenCalled();
  state.setPanelWidth(400);
  state.setPanelWidth(410);
  state.setPanelWidth(420);
  expect(mocks.save).not.toHaveBeenCalled();
  await vi.runAllTimersAsync();
  expect(mocks.save).toHaveBeenCalledOnce();
  expect(JSON.parse(mocks.save.mock.calls[0][0])).toMatchObject({
    version: 2,
    panelWidth: 420,
  });
});
