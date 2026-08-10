import { useEffect, useRef, type ReactNode, type TouchEvent } from 'react';

interface Props {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Half-height bottom sheet for mobile. Deliberately has no dimming
 * backdrop so the visualizer stays fully visible while settings are
 * adjusted; a transparent scrim still closes it on outside tap.
 */
export function SettingsDrawer({ open, onClose, children }: Props) {
  const drawerRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragDelta = useRef(0);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Swipe-down on the header follows the finger, then closes past a
  // threshold or snaps back.
  const onTouchStart = (e: TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragDelta.current = 0;
    const el = drawerRef.current;
    if (el) el.style.transition = 'none';
  };

  const onTouchMove = (e: TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current);
    dragDelta.current = dy;
    const el = drawerRef.current;
    if (el) el.style.transform = `translateY(${dy}px)`;
  };

  const onTouchEnd = () => {
    const el = drawerRef.current;
    if (el) {
      el.style.transition = '';
      el.style.transform = '';
    }
    if (dragDelta.current > 70) onClose();
    dragStartY.current = null;
    dragDelta.current = 0;
  };

  return (
    <div className={`drawer-layer ${open ? 'open' : ''}`} aria-hidden={!open} inert={!open}>
      <div className="drawer-scrim" onClick={onClose} />
      <div className="drawer" ref={drawerRef} role="dialog" aria-label="Settings">
        <div
          className="drawer-header"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          <span className="drawer-handle" aria-hidden="true" />
          <button className="drawer-close" onClick={onClose} aria-label="Close settings">
            <CloseIcon />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </div>
  );
}
