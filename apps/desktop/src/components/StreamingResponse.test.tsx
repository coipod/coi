// @vitest-environment jsdom
import { act, cleanup, render, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { emptyRun } from "@coi/protocol";
import { StreamingResponse } from "./StreamingResponse";
import { useApp } from "../stores/app";
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) =>
    setTimeout(() => fn(performance.now()), 16),
  );
  vi.stubGlobal("cancelAnimationFrame", clearTimeout);
  useApp.setState({
    ready: false,
    settings: {
      ...useApp.getState().settings,
      textSpeed: "normal",
      reducedMotion: false,
    },
  });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("streams received Markdown and completes a trailing chunk without replay", () => {
  const run = { ...emptyRun("new", "session"), status: "running" as const };
  const view = render(<StreamingResponse run={run} />);
  view.rerender(
    <StreamingResponse run={{ ...run, text: "Hello **world**" }} />,
  );
  expect(
    view.container.querySelector('[data-revealing="true"]'),
  ).not.toBeNull();
  act(() => vi.advanceTimersByTime(1000));
  expect(view.container.querySelector("strong")?.textContent).toBe("world");
  view.rerender(
    <StreamingResponse
      run={{
        ...run,
        text: "Hello **world**\n\n```ts\nconst n = 1;\n```",
        status: "completed",
      }}
    />,
  );
  expect(view.container.textContent).toContain("Hello world");
  act(() => vi.advanceTimersByTime(1000));
  expect(view.container.querySelector("code")?.textContent).toContain(
    "const n = 1;",
  );
  expect(
    view.container.querySelector('[data-revealing="false"]'),
  ).not.toBeNull();
});
it.each(["completed", "cancelled", "failed"] as const)(
  "restores %s history immediately",
  (status) => {
    const view = render(
      <StreamingResponse
        run={{ ...emptyRun("past", "session"), status, text: "Saved response" }}
      />,
    );
    expect(view.container.textContent).toBe("Saved response");
    expect(vi.getTimerCount()).toBe(0);
  },
);
it("cancel ends the display queue without withholding received text", () => {
  const run = {
    ...emptyRun("live", "session"),
    status: "running" as const,
    text: "Received content",
  };
  const view = render(<StreamingResponse run={run} />);
  view.rerender(<StreamingResponse run={{ ...run, status: "cancelled" }} />);
  expect(view.container.textContent).toBe("Received content");
  expect(vi.getTimerCount()).toBe(0);
});

it("preserves a reader's scroll position while a response is revealed", () => {
  const run = { ...emptyRun("scroll", "session"), status: "running" as const };
  const view = render(
    <div className="conversation">
      <StreamingResponse run={run} />
    </div>,
  );
  const pane = view.container.firstElementChild as HTMLElement;
  Object.defineProperty(pane, "scrollHeight", {
    value: 2000,
    configurable: true,
  });
  Object.defineProperty(pane, "clientHeight", { value: 500 });
  pane.scrollTop = 100;
  fireEvent.scroll(pane);
  view.rerender(
    <div className="conversation">
      <StreamingResponse run={{ ...run, text: "Streaming response" }} />
    </div>,
  );
  act(() => vi.advanceTimersByTime(1000));
  expect(pane.scrollTop).toBe(100);
  pane.scrollTop = 1500;
  fireEvent.scroll(pane);
  Object.defineProperty(pane, "scrollHeight", { value: 2500 });
  view.rerender(
    <div className="conversation">
      <StreamingResponse
        run={{ ...run, text: "Streaming response continued" }}
      />
    </div>,
  );
  act(() => vi.advanceTimersByTime(1000));
  expect(pane.scrollTop).toBe(2500);
});
