'use client';

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Professional custom dropdown that replaces the native <select> so the OPEN
 * option list can actually be styled (roomy padding, hover, checkmark) — the
 * native list is drawn by the browser and can't be. Kept mostly SOLID (only a
 * light polish) so it reads crisply over data-dense pages; the floating list
 * is a portal so it's never clipped by tables/modals/overflow.
 *
 * Drop-in for the common `<select value onChange>` pattern:
 *   <Select
 *     value={shopFilter}
 *     onChange={setShopFilter}
 *     options={[{ value: '', label: 'All Shops' }, ...branches.map(b => ({ value: b.id, label: b.name }))]}
 *     className="min-w-[180px]"
 *   />
 *
 * Features:
 * - `onChange` receives the selected value string (matches `e.target.value`).
 * - Portal-rendered listbox, positioned under (or above, if no room) the
 *   trigger; repositions on scroll/resize.
 * - Keyboard: Enter/Space/Down/Up open; Up/Down move; Home/End jump;
 *   type-ahead (start typing a label); Enter selects; Esc closes; Tab closes.
 * - Click-outside to close. ARIA listbox/option roles + aria-activedescendant.
 * - Roomy options (px-4 py-2.5), soft hover, checkmark on the selected item.
 */

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  className = '',
  disabled = false,
  ariaLabel,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [mounted, setMounted] = useState(false);
  const [drop, setDrop] = useState<'down' | 'up'>('down');
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typeaheadRef = useRef<{ str: string; at: number }>({ str: '', at: 0 });
  const reactId = useId();
  const listboxId = id ? `${id}-listbox` : `sel-${reactId}`;

  useEffect(() => setMounted(true), []);

  const selected = options.find((o) => o.value === value) ?? null;

  const position = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const spaceAbove = r.top;
    const listMax = 288; // matches max-h-72
    const openUp = spaceBelow < Math.min(listMax, 240) && spaceAbove > spaceBelow;
    setDrop(openUp ? 'up' : 'down');
    // Clamp the menu's left edge so it never runs off the right of the screen
    // on mobile. The menu is at least as wide as the trigger, capped to
    // min(20rem, 100vw - 24px) — mirror that here to compute its real width,
    // then keep left within [8px, viewport - width - 8px].
    const margin = 8;
    const cappedMax = Math.min(320, window.innerWidth - 24); // 20rem = 320px
    const menuWidth = Math.min(Math.max(r.width, cappedMax), cappedMax);
    const maxLeft = window.innerWidth - menuWidth - margin;
    const left = Math.max(margin, Math.min(r.left, maxLeft));
    setPos({ left, top: openUp ? r.top : r.bottom, width: r.width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    const onMove = () => position();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open, position]);

  // Close on outside pointer / Escape.
  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);

  // On open, highlight the current selection (or first enabled option).
  useEffect(() => {
    if (!open) return;
    const cur = options.findIndex((o) => o.value === value);
    if (cur >= 0) setActiveIndex(cur);
    else setActiveIndex(options.findIndex((o) => !o.disabled));
  }, [open, options, value]);

  // Keep the active option in view.
  useEffect(() => {
    if (!open || activeIndex < 0) return;
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${activeIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  const moveActive = useCallback(
    (dir: 1 | -1) => {
      setActiveIndex((cur) => {
        const n = options.length;
        let i = cur;
        for (let step = 0; step < n; step++) {
          i = (i + dir + n) % n;
          if (!options[i]?.disabled) return i;
        }
        return cur;
      });
    },
    [options],
  );

  function commit(idx: number) {
    const opt = options[idx];
    if (!opt || opt.disabled) return;
    onChange(opt.value);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function typeAhead(char: string) {
    const now = Date.now();
    const ta = typeaheadRef.current;
    ta.str = now - ta.at > 700 ? char : ta.str + char;
    ta.at = now;
    const q = ta.str.toLowerCase();
    const start = activeIndex < 0 ? 0 : activeIndex;
    // Search from the item after the current, wrapping around.
    for (let k = 0; k < options.length; k++) {
      const i = (start + k + (ta.str.length === 1 ? 1 : 0)) % options.length;
      const o = options[i];
      if (!o.disabled && o.label.toLowerCase().startsWith(q)) {
        setActiveIndex(i);
        return;
      }
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (disabled) return;
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        setOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); moveActive(1); break;
      case 'ArrowUp': e.preventDefault(); moveActive(-1); break;
      case 'Home': e.preventDefault(); setActiveIndex(options.findIndex((o) => !o.disabled)); break;
      case 'End': e.preventDefault(); { const li = [...options].map((o, i) => ({ o, i })).reverse().find((x) => !x.o.disabled); if (li) setActiveIndex(li.i); } break;
      case 'Enter': case ' ': e.preventDefault(); commit(activeIndex); break;
      case 'Escape': e.preventDefault(); setOpen(false); triggerRef.current?.focus(); break;
      case 'Tab': setOpen(false); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeAhead(e.key);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-controls={open ? listboxId : undefined}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKeyDown}
        className={`glass-select flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3.5 py-2.5 text-left text-sm text-text-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      >
        <span className={`truncate ${selected ? '' : 'text-text-muted'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={16}
          className={`shrink-0 text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {mounted && open && pos &&
        createPortal(
          <ul
            ref={listRef}
            role="listbox"
            id={listboxId}
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-opt-${activeIndex}` : undefined}
            className="dropdown-pop glass fixed z-[80] max-h-72 w-max overflow-y-auto rounded-xl p-1.5 shadow-2xl shadow-black/40"
            style={{
              left: pos.left,
              // At least as wide as the trigger, but allowed to grow to fit the
              // option labels (so short triggers don't truncate 'All' etc.),
              // capped so a long label can't overflow the screen.
              minWidth: pos.width,
              maxWidth: 'min(20rem, calc(100vw - 24px))',
              ...(drop === 'down'
                ? { top: pos.top + 6 }
                : { top: pos.top - 6, transform: 'translateY(-100%)' }),
            }}
          >
            {options.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-text-muted">No options</li>
            )}
            {options.map((opt, idx) => {
              const isSelected = opt.value === value;
              const isActive = idx === activeIndex;
              return (
                <li key={opt.value || `opt-${idx}`} role="none">
                  <button
                    type="button"
                    role="option"
                    id={`${listboxId}-opt-${idx}`}
                    data-idx={idx}
                    aria-selected={isSelected}
                    disabled={opt.disabled}
                    onClick={() => commit(idx)}
                    onMouseEnter={() => !opt.disabled && setActiveIndex(idx)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg px-4 py-2.5 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      isActive ? 'bg-white/10' : ''
                    } ${isSelected ? 'font-medium text-text-primary' : 'text-text-secondary'}`}
                  >
                    <span className="truncate">{opt.label}</span>
                    {isSelected && <Check size={15} className="shrink-0 text-accent-green" />}
                  </button>
                </li>
              );
            })}
          </ul>,
          document.body,
        )}
    </>
  );
}
