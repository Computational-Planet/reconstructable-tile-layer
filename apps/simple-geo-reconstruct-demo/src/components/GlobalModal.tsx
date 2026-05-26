import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

type GlobalModalProps = {
  children: ReactNode;
  labelledBy: string;
  open: boolean;
  onClose: () => void;
};

export function GlobalModal({
  children,
  labelledBy,
  open,
  onClose,
}: GlobalModalProps) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-labelledby={labelledBy}
      aria-modal="true"
      className="global-modal-backdrop"
      role="dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
