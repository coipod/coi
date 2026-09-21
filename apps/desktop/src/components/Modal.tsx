import { t, systemText } from "../lib/i18n";
import { useEffect, useRef, useState, useId, type ReactNode } from "react";
import { useReducedMotion } from "../hooks/motion";
import { X } from "lucide-react";
import { useApp } from "../stores/app";
export function Modal({
  title,
  onClose,
  children,
  wide = false,
  focusAfterClose,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode | ((close: () => void) => ReactNode);
  wide?: boolean;
  focusAfterClose?: () => HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [closing, setClosing] = useState(false);
  const closingRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reduced = useReducedMotion();
  const latestClose = useRef(onClose);
  latestClose.current = onClose;
  const latestFocus = useRef(focusAfterClose);
  latestFocus.current = focusAfterClose;
  const close = () => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    timer.current = setTimeout(() => latestClose.current(), reduced ? 0 : 120);
  };
  const toast = useApp((s) => s.toast);
  const notify = useApp((s) => s.notify);
  useEffect(() => {
    const d = ref.current;
    const trigger =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    d?.showModal();
    return () => {
      clearTimeout(timer.current);
      d?.close();
      const destination = latestFocus.current?.() ?? trigger;
      if (destination?.isConnected) destination.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={`modal ${wide ? "wide" : ""} ${closing ? "is-closing" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <header>
        <h2 id={titleId}>{title}</h2>
        <button className="icon-button" onClick={close} aria-label={t("닫기")}>
          <X size={19} />
        </button>
        {toast && (
          <div className="modal-status" role="status">
            <span>{systemText(toast)}</span>
            <button
              className="icon-button"
              aria-label={t("알림 닫기")}
              onClick={() => notify(null)}
            >
              <X size={15} />
            </button>
          </div>
        )}
      </header>
      {typeof children === "function" ? children(close) : children}
    </dialog>
  );
}
