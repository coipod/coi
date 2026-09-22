import { memo, useState, useRef, useEffect, useLayoutEffect } from "react";
import { isTerminal, type RunState } from "@coi/protocol";
import { useApp } from "../stores/app";
import { useReducedMotion } from "../hooks/motion";
import { useRevealedText } from "../hooks/revealedText";
import { demoText, t, useLocale } from "../lib/i18n";
import { SafeMarkdown } from "./SafeMarkdown";

export const StreamingResponse = memo(function StreamingResponse({
  run,
}: {
  run: RunState;
}) {
  const locale = useLocale((s) => s.locale);
  const speed = useApp((s) => s.settings.textSpeed);
  const reduced = useReducedMotion();
  // A restored/completed response must never replay on mounting the history.
  const [history] = useState(() => isTerminal(run.status));
  const text = run.events.some((event) => event.origin === "demo")
    ? demoText(run.text)
    : run.text;
  const { displayed, revealing, revealAll } = useRevealedText(
    text,
    `${run.runId}:${locale}`,
    {
      instant:
        history ||
        reduced ||
        speed === "instant" ||
        run.status === "cancelled" ||
        run.status === "failed" ||
        run.pending.length > 0,
      slow: speed === "slow",
      streaming: true,
    },
  );
  const host = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    const pane = host.current?.closest(".conversation");
    if (!pane) return;
    const track = () => {
      following.current =
        pane.scrollHeight - pane.scrollTop - pane.clientHeight < 100;
    };
    track();
    pane.addEventListener("scroll", track, { passive: true });
    return () => pane.removeEventListener("scroll", track);
  }, []);
  useLayoutEffect(() => {
    if (history || !following.current) return;
    const pane = host.current?.closest(".conversation");
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [displayed, history]);
  return (
    <div ref={host} className="message-prose" data-revealing={revealing}>
      <SafeMarkdown>{displayed}</SafeMarkdown>
      {revealing && (
        <button className="text-button" onClick={revealAll}>
          {t("바로 표시")}
        </button>
      )}
    </div>
  );
});
