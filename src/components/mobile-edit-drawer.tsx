import { ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function MobileEditDrawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open || typeof window === "undefined") {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 1280px)");
    if (mediaQuery.matches) {
      onClose();
      return;
    }

    const onMediaChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        onClose();
      }
    };

    mediaQuery.addEventListener("change", onMediaChange);
    return () => {
      mediaQuery.removeEventListener("change", onMediaChange);
    };
  }, [open, onClose]);

  if (!open) {
    return null;
  }

  const content = (
    <div className="mobile-edit-drawer xl:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        aria-label="Close editor"
        className="mobile-edit-drawer-backdrop"
        type="button"
        onClick={onClose}
      />
      <div className="mobile-edit-drawer-sheet panel">
        <div className="mobile-edit-drawer-header">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-[var(--ink-main)]">{title}</h3>
            {subtitle ? <p className="mt-1 text-xs text-[var(--ink-soft)]">{subtitle}</p> : null}
          </div>
          <button className="button-secondary shrink-0" type="button" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="mobile-edit-drawer-body">{children}</div>
        {footer ? <div className="mobile-edit-drawer-footer">{footer}</div> : null}
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return content;
  }

  return createPortal(content, document.body);
}
