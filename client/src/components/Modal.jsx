import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

// A glass side sheet: the board stays visible behind it, so context is never lost.
export default function Modal({ title, subtitle, onClose, children, footer, wide, headerExtra }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const previous = document.activeElement;
    if (!panelRef.current.contains(document.activeElement)) panelRef.current.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <section ref={panelRef} tabIndex={-1} className={`sheet glass${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="sheet-head">
          <div className="sheet-title">
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {headerExtra}
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} strokeWidth={1.75} /></button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer && <footer className="sheet-foot">{footer}</footer>}
      </section>
    </div>
  );
}
