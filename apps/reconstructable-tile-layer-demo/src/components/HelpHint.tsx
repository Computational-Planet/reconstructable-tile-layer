import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 说明按需浮出，不占表单高度；挂到 body 避免被滚动侧栏裁掉。 */
export function HelpHint({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!open || !button.current || !panel.current) return;
    const anchor = button.current.getBoundingClientRect();
    const box = panel.current.getBoundingClientRect();
    const sidebar = button.current.closest(".control-panel, .layer-panel")?.getBoundingClientRect();
    const left = Math.max(
      12,
      Math.min(anchor.left, (sidebar?.right ?? window.innerWidth) - box.width - 12),
    );
    const below = anchor.bottom + 6;
    setPosition({
      left,
      top:
        below + box.height <= window.innerHeight - 12
          ? below
          : Math.max(12, anchor.top - box.height - 6),
    });
  }, [open, children]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (
        !button.current?.contains(event.target as Node) &&
        !panel.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // 先关闭当前说明，避免同一次 Escape 又关闭承载它的图层面板。
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    const closeOnScroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    document.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        className="help-hint-toggle"
        aria-label={`Help: ${label}`}
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id={id}
            role="note"
            aria-label={label}
            className="help-hint-panel"
            style={position}
          >
            {children}
          </div>,
          document.body,
        )}
    </>
  );
}
