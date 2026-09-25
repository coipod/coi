import { useEffect, useMemo, useRef, useState } from "react";

const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
export function textBoundaries(text: string): number[] {
  return Array.from(
    segmenter.segment(text),
    (part) => part.index + part.segment.length,
  );
}

/** Display-only progress. The complete received text remains in the run/store. */
export function useRevealedText(
  text: string,
  identity: string,
  options: { instant: boolean; slow: boolean; streaming?: boolean },
) {
  const boundaries = useMemo(() => textBoundaries(text), [text]);
  const current = useRef({ identity, text, count: 0 });
  const [progress, setProgress] = useState({ identity, count: 0 });
  const skipped = useRef<string | undefined>(undefined);
  const instant = options.instant || skipped.current === identity;
  useEffect(() => {
    const old = current.current;
    const count =
      old.identity === identity && text.startsWith(old.text) ? old.count : 0;
    current.current = {
      identity,
      text,
      count: instant ? boundaries.length : count,
    };
    setProgress({ identity, count: current.current.count });
    if (instant || count >= boundaries.length) return;
    let frame = 0;
    let previous = performance.now();
    let credit = 0;
    const tick = (now: number) => {
      const elapsed = Math.min(now - previous, 100);
      previous = now;
      const remaining = boundaries.length - current.current.count;
      // Large provider chunks catch up in at most about half a second.
      const rate = options.streaming
        ? Math.max(options.slow ? 35 : 65, remaining / 0.45)
        : options.slow
          ? 16
          : 34;
      credit += (elapsed * rate) / 1000;
      const advance = Math.floor(credit);
      if (advance) {
        credit -= advance;
        current.current.count = Math.min(
          boundaries.length,
          current.current.count + advance,
        );
        setProgress({ identity, count: current.current.count });
      }
      if (current.current.count < boundaries.length)
        frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [identity, text, boundaries, instant, options.slow, options.streaming]);
  const count = progress.identity === identity ? progress.count : 0;
  const displayed = instant ? text : text.slice(0, boundaries[count - 1] ?? 0);
  return {
    displayed,
    revealing: displayed !== text,
    revealAll() {
      skipped.current = identity;
      current.current = { identity, text, count: boundaries.length };
      setProgress({ identity, count: boundaries.length });
    },
  };
}
