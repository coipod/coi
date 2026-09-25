import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
  type ReactNode,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { t } from "../lib/i18n";
import { useReducedMotion } from "../hooks/motion";

export function AnchoredPopover({
  open,
  anchor,
  id,
  title,
  onClose,
  children,
}: {
  open: boolean;
  anchor: RefObject<HTMLButtonElement | null>;
  id: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const host = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  const [retained, setRetained] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const reduced = useReducedMotion();
  useEffect(() => {
    if (open) {
      setRetained(true);
      return;
    }
    const timer = setTimeout(() => setRetained(false), reduced ? 0 : 120);
    return () => clearTimeout(timer);
  }, [open, reduced]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(380, innerWidth - 24);
      const above = rect.top >= 180;
      setPosition({
        width,
        left: Math.max(12, Math.min(rect.left, innerWidth - width - 12)),
        ...(above
          ? {
              bottom: innerHeight - rect.top + 8,
              top: "auto",
              maxHeight: rect.top - 20,
            }
          : {
              top: rect.bottom + 8,
              bottom: "auto",
              maxHeight: Math.max(80, innerHeight - rect.bottom - 20),
            }),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    const observer = new ResizeObserver(place);
    if (anchor.current) observer.observe(anchor.current);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      observer.disconnect();
    };
  }, [open, anchor]);
  useEffect(() => {
    if (!open) return;
    host.current
      ?.querySelector<HTMLElement>("select, input, button")
      ?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      if (
        host.current?.contains(event.target as Node) ||
        anchor.current?.contains(event.target as Node)
      )
        return;
      close.current();
      anchor.current?.focus({ preventScroll: true });
    };
    const key = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close.current();
      anchor.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", key, true);
    };
  }, [open, anchor]);
  if (!open && !retained) return null;
  return createPortal(
    <div
      ref={host}
      id={id}
      role={open ? "dialog" : undefined}
      aria-label={title}
      aria-hidden={!open}
      inert={!open}
      className={`ai-popover ${!open ? "is-closing" : ""}`}
      style={position}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("닫기")}
          onClick={() => {
            onClose();
            anchor.current?.focus({ preventScroll: true });
          }}
        >
          <X size={16} />
        </button>
      </header>
      {children}
    </div>,
    document.body,
  );
}
