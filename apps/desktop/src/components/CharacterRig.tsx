import { useEffect, useRef, useState } from "react";
import "pixi.js/unsafe-eval";
import { Application, MeshPlane, Rectangle, Texture } from "pixi.js";
import type { Expression } from "@coi/protocol";

const cells: Record<Expression, [number, number]> = {
  neutral: [0, 0],
  greeting: [1, 0],
  thinking: [2, 0],
  working: [3, 0],
  question: [0, 1],
  success: [1, 1],
  concerned: [2, 1],
};
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** One continuous surface preserves the illustrated anatomy and every joint.
 * The generated parts sheet is not a registered rig and must not be assembled.
 */
export function CharacterRig({
  expression,
  reducedMotion,
  fallback,
}: {
  expression: Expression;
  reducedMotion: boolean;
  fallback: React.ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef({ expression, reducedMotion });
  state.current = { expression, reducedMotion };
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    let disposed = false;
    let visible = true;
    let app: Application | undefined;
    let source: Texture | undefined;
    let observer: IntersectionObserver | undefined;
    let cleanup: (() => void) | undefined;
    async function mount() {
      const application = new Application();
      await application.init({
        width: 320,
        height: 340,
        backgroundAlpha: 0,
        antialias: true,
        resolution: Math.min(devicePixelRatio, 2),
        autoDensity: true,
        preference: "webgl",
      });
      if (disposed) {
        application.destroy(true);
        return;
      }
      app = application;
      element!.appendChild(application.canvas);
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        const timeout = window.setTimeout(
          () => reject(new Error("character image timeout")),
          15000,
        );
        image.onload = () => {
          window.clearTimeout(timeout);
          resolve(image);
        };
        image.onerror = () => {
          window.clearTimeout(timeout);
          reject(new Error("character image unavailable"));
        };
        image.src = "/coi/expressions.png";
      });
      if (disposed) return;
      source = Texture.from(image);
      const width = image.naturalWidth / 4,
        height = image.naturalHeight / 2;
      const textures = Object.fromEntries(
        Object.entries(cells).map(([name, [x, y]]) => [
          name,
          new Texture({
            source: source!.source,
            // Inset prevents sampling a neighbouring expression along the seam.
            frame: new Rectangle(
              x * width + 1,
              y * height + 1,
              width - 2,
              height - 2,
            ),
          }),
        ]),
      ) as Record<Expression, Texture>;
      const mesh = new MeshPlane({
        texture: textures[state.current.expression],
        verticesX: 25,
        verticesY: 29,
      });
      const w = width - 2,
        h = height - 2;
      mesh.scale.set(304 / w); // Uniform scale: never stretch the head or body.
      mesh.position.set(8, 12);
      application.stage.addChild(mesh);
      const buffer = mesh.geometry.getBuffer("aPosition");
      const rest = new Float32Array(buffer.data);
      let time = 0,
        gaze = 0,
        target = 0;
      let previous = state.current.expression;
      const pointer = (event: PointerEvent) => {
        const rect = element!.getBoundingClientRect();
        target = Math.max(
          -1,
          Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1),
        );
      };
      const leave = () => {
        target = 0;
      };
      element!.addEventListener("pointermove", pointer);
      element!.addEventListener("pointerleave", leave);
      application.ticker.add(() => {
        const reduced = state.current.reducedMotion;
        const dt = Math.min(application.ticker.deltaMS / 1000, 0.05);
        if (!reduced) time += dt;
        gaze = reduced ? 0 : gaze + (target - gaze) * (1 - Math.exp(-dt * 5));
        if (previous !== state.current.expression) {
          previous = state.current.expression;
          mesh.texture = textures[previous];
        }
        const t = reduced ? 0 : time;
        const angle = reduced ? 0 : Math.sin(t * 0.62) * 0.009 + gaze * 0.009;
        const breath = reduced ? 0 : Math.sin(t * 1.3) * 0.9;
        for (let i = 0; i < rest.length; i += 2) {
          const x = rest[i],
            y = rest[i + 1];
          const nx = x / w,
            ny = y / h;
          // Blend the head motion through the shoulders, rather than separating
          // the neck, face, bangs or hair into unrelated moving rectangles.
          const head = 1 - smoothstep(0.3, 0.6, ny);
          const edge = smoothstep(0.15, 0.4, Math.abs(nx - 0.5));
          const lower =
            smoothstep(0.42, 0.68, ny) * (1 - smoothstep(0.88, 1, ny));
          const dx = x - w * 0.5,
            dy = y - h * 0.44;
          const arm = reduced
            ? 0
            : Math.sin(t * 0.77 + (nx < 0.5 ? 0 : 0.9)) * 1.2;
          buffer.data[i] =
            x +
            (-dy * Math.sin(angle) + dx * (Math.cos(angle) - 1)) * head +
            arm * edge * lower;
          buffer.data[i + 1] =
            y +
            (dx * Math.sin(angle) + dy * (Math.cos(angle) - 1)) * head -
            breath * Math.sin(ny * Math.PI);
        }
        buffer.update();
      });
      const visibility = () => {
        if (visible && !document.hidden) application.start();
        else application.stop();
      };
      observer = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        visibility();
      });
      observer.observe(element!);
      document.addEventListener("visibilitychange", visibility);
      cleanup = () => {
        document.removeEventListener("visibilitychange", visibility);
        element!.removeEventListener("pointermove", pointer);
        element!.removeEventListener("pointerleave", leave);
        Object.values(textures).forEach((texture) => texture.destroy());
      };
    }
    void mount().catch(() => {
      observer?.disconnect();
      cleanup?.();
      app?.destroy(true, { children: true });
      app = undefined;
      source?.destroy(true);
      source = undefined;
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      cleanup?.();
      app?.destroy(true, { children: true });
      source?.destroy(true);
    };
  }, []);
  return failed ? (
    fallback
  ) : (
    <div
      className="character-rig"
      ref={host}
      role="img"
      aria-label={`COI · ${expression}`}
    />
  );
}
