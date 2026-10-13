import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { ICONS, Svg } from './RequestCards';

export interface StatusOption { value: string; label: string; count: number; k?: string }

/**
 * Status filter as one dropdown: the button shows the chosen status and its count;
 * the list shows every status with a coloured dot and its count. Works with mouse, touch and keyboard.
 */
export default function StatusDropdown({ options, value, onChange, label = 'Status', placeholder = 'Select status' }: {
  options: StatusOption[]; value: string; onChange: (value: string) => void; label?: string; placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  // Nothing chosen yet → the box shows the placeholder ("Select status"); afterwards only the chosen status.
  const selected = options.find((o) => o.value === value) ?? null;

  // Close when tapping outside.
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('touchstart', close); };
  }, [open]);

  const openList = () => { setActive(Math.max(0, options.findIndex((o) => o.value === value))); setOpen(true); };
  const choose = (v: string) => { onChange(v); setOpen(false); };

  const onKey = (e: KeyboardEvent) => {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openList(); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(options.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); choose(options[active].value); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={`status-dd ${open ? 'open' : ''}`} ref={box}>
      <button type="button" className="status-dd-btn" onClick={() => (open ? setOpen(false) : openList())} onKeyDown={onKey}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
        aria-label={selected ? `${label}: ${selected.label}, ${selected.count}` : `${label}: ${placeholder}`}>
        {selected ? (
          <span className={`status-dd-value ${selected.k ? `k-${selected.k}` : ''}`}>
            {selected.k && <i className="status-dot" aria-hidden="true" />}
            <strong>{selected.label}</strong>
            <span className="status-dd-count">{selected.count}</span>
          </span>
        ) : (
          <span className="status-dd-value status-dd-placeholder">{placeholder}</span>
        )}
        <span className="status-dd-chevron" aria-hidden="true"><Svg d="M6 9l6 6 6-6" size={18} width={2.4} /></span>
      </button>
      {open && (
        <ul className="status-dd-list" role="listbox" id={listId} aria-label={label}>
          {options.map((o, i) => (
            <li key={o.value} role="option" aria-selected={o.value === value}
              className={`status-dd-option ${o.k ? `k-${o.k}` : ''} ${i === active ? 'active' : ''} ${o.count === 0 ? 'is-empty' : ''}`}
              onMouseEnter={() => setActive(i)} onClick={() => choose(o.value)}>
              <i className="status-dot" aria-hidden="true" />
              <span className="status-dd-name">{o.label}</span>
              <span className="status-dd-count">{o.count}</span>
              <span className="status-dd-check" aria-hidden="true">{o.value === value && <Svg d={ICONS.check} size={16} width={2.6} />}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
