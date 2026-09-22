// @vitest-environment jsdom
import { useState } from "react";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { defaultExecution } from "../lib/execution";
const mocks = vi.hoisted(() => ({ capabilities: vi.fn() }));
vi.mock("../lib/bridge", () => ({ native: false, bridge: mocks }));
import { useApp } from "../stores/app";
import { ExecutionControls } from "./ExecutionControls";
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <ExecutionControls
      open={open}
      onToggle={() => setOpen(!open)}
      onClose={() => setOpen(false)}
    />
  );
}
beforeEach(() => {
  vi.stubGlobal("matchMedia", () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  mocks.capabilities
    .mockReset()
    .mockResolvedValue({
      provider: "codex",
      models: [
        {
          id: "model",
          label: "Model",
          efforts: ["low", "high"],
          defaultEffort: "low",
        },
      ],
      presets: {
        balanced: { model: "model", effort: "low" },
        performance: { model: "model", effort: "high" },
      },
    });
  useApp.setState({
    ready: false,
    activeId: "s",
    sessions: [
      {
        id: "s",
        projectId: "p",
        title: "Fixture",
        createdAt: "2026",
        messages: [{ id: "m", role: "user", text: "Earlier prompt" }],
        runs: [],
        demoApplied: false,
        demoDeclined: false,
        execution: { ...defaultExecution, model: "model", effort: "low" },
      },
    ],
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
it("reopening never refetches or resets settings; basic/advanced and history choices persist", async () => {
  const view = render(<Harness />);
  await waitFor(() => expect(mocks.capabilities).toHaveBeenCalledOnce());
  fireEvent.click(view.getByRole("button", { name: "AI settings" }));
  fireEvent.click(
    view.getByRole("button", { name: /^Performance$/ }),
  );
  fireEvent.click(view.getByRole("switch"));
  expect(
    (view.getByRole("combobox", { name: "Effort" }) as HTMLSelectElement).value,
  ).toBe("high");
  fireEvent.click(view.getByRole("checkbox"));
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(view.getByRole("button", { name: "AI settings" }));
  expect(mocks.capabilities).toHaveBeenCalledOnce();
  expect(
    (view.getByRole("combobox", { name: "Effort" }) as HTMLSelectElement).value,
  ).toBe("high");
  expect((view.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  expect(useApp.getState().sessions[0].messages).toHaveLength(1);
  expect(useApp.getState().activeRunId).toBeNull();
});
