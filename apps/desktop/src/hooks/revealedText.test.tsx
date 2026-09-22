// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { textBoundaries, useRevealedText } from "./revealedText";
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    setTimeout(() => fn(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("reveals graphemes without splitting Japanese combining marks or emoji", () => {
  const text = "Aか\u3099👩🏽‍💻🇯🇵";
  expect(
    textBoundaries(text).map((end, i, list) =>
      text.slice(list[i - 1] ?? 0, end),
    ),
  ).toEqual(["A", "か\u3099", "👩🏽‍💻", "🇯🇵"]);
});
it("continues appended chunks without restarting and stops its frame loop", () => {
  const { result, rerender } = renderHook(
    ({ text }) =>
      useRevealedText(text, "run", {
        instant: false,
        slow: false,
        streaming: true,
      }),
    { initialProps: { text: "Hello" } },
  );
  expect(result.current.displayed).toBe("");
  act(() => vi.advanceTimersByTime(160));
  expect(result.current.displayed).toBe("Hello");
  rerender({ text: "Hello world!" });
  expect(result.current.displayed).toBe("Hello");
  act(() => vi.advanceTimersByTime(1000));
  expect(result.current.displayed).toBe("Hello world!");
  expect(vi.getTimerCount()).toBe(0);
});
it("show all persists across chunks but resets for a different dialogue", () => {
  const { result, rerender } = renderHook(
    ({ text, id }) => useRevealedText(text, id, { instant: false, slow: true }),
    { initialProps: { text: "First dialogue", id: "one" } },
  );
  act(() => result.current.revealAll());
  rerender({ text: "First dialogue continued", id: "one" });
  expect(result.current.displayed).toBe("First dialogue continued");
  rerender({ text: "Second dialogue", id: "two" });
  expect(result.current.displayed).toBe("");
  act(() => vi.advanceTimersByTime(100));
  expect(result.current.displayed).toBe("S");
});
it("instant/reduced-motion transitions expose full text and cancel animation", () => {
  const { result, rerender, unmount } = renderHook(
    ({ instant }) =>
      useRevealedText("Long text", "run", { instant, slow: true }),
    { initialProps: { instant: false } },
  );
  rerender({ instant: true });
  expect(result.current.displayed).toBe("Long text");
  expect(vi.getTimerCount()).toBe(0);
  unmount();
  expect(vi.getTimerCount()).toBe(0);
});
