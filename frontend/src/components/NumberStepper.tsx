'use client';

import { ChevronUp, ChevronDown } from 'lucide-react';

/**
 * A whole-number input (QUANTITY / STOCK fields) with a compact up/down
 * spinner pinned to the RIGHT edge. The spinner is hidden by default and only
 * reveals on hover (desktop) or when the field is focused/tapped (mobile),
 * so the control reads as a clean number field until the user interacts —
 * then the ▲ / ▼ arrows fade in for easy adjustment (native number spinners
 * are tiny/unusable, especially on touch).
 *
 * Typing still works exactly like a normal input; the arrows step by `step`
 * and clamp to [min, max]. The spinner's horizontal space is always reserved
 * (via input padding), so revealing it never shifts the number — no layout
 * jump.
 *
 * Value is a STRING (matching the existing form-state pattern in this app),
 * so an empty field stays empty until the user types or taps.
 *
 * The public props API is unchanged from the previous ▼/▲ side-button version,
 * so every existing call site keeps working without edits.
 */
interface NumberStepperProps {
  value: string;
  onChange: (value: string) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  /** Extra classes for the middle <input> (e.g. text alignment overrides). */
  inputClassName?: string;
  /** Extra classes for the outer wrapper (usually width/flex sizing). */
  className?: string;
}

export function NumberStepper({
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  disabled = false,
  placeholder,
  ariaLabel,
  inputClassName = '',
  className = '',
}: NumberStepperProps) {
  const clamp = (n: number) => {
    let v = n;
    if (typeof min === 'number' && v < min) v = min;
    if (typeof max === 'number' && v > max) v = max;
    return v;
  };

  const bump = (dir: 1 | -1) => {
    // Empty input steps from min so the first tap gives a sensible starting
    // value rather than NaN.
    const current = value === '' || value === null || value === undefined ? min : Number(value);
    const base = Number.isFinite(current) ? current : min;
    const next = clamp(base + dir * step);
    // Emit an integer string for whole-number quantity fields.
    onChange(String(next));
  };

  const numeric = value === '' ? null : Number(value);
  const atMin = numeric !== null && typeof min === 'number' && numeric <= min;
  const atMax = numeric !== null && typeof max === 'number' && numeric >= max;

  // A single chevron button. Half-height, so up sits above down. Hidden until
  // the group is hovered or focused; disabled at the respective bound. Kept out
  // of the tab order (tabIndex -1) so the field itself is the tab stop.
  const chevronBase =
    'flex h-1/2 w-full items-center justify-center text-text-secondary transition-colors hover:bg-white/10 hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <div
      className={`group relative flex items-stretch overflow-hidden rounded-lg border border-input-border bg-input-bg transition-colors focus-within:ring-2 focus-within:ring-input-focus ${disabled ? 'opacity-60' : ''} ${className}`}
    >
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        // Left-aligned number. pr-7 permanently reserves the spinner's width on
        // the right so the value never sits under the arrows and never shifts
        // when they fade in. Native spinners are removed.
        className={`min-w-0 flex-1 bg-transparent py-2 pl-3 pr-7 text-left text-sm text-text-primary focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${inputClassName}`}
      />
      {/* Right-edge up/down spinner. Fades in on hover (desktop) / focus (mobile). */}
      <div
        aria-hidden={false}
        className="pointer-events-none absolute inset-y-0 right-0 flex w-6 flex-col border-l border-input-border opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
      >
        <button
          type="button"
          onClick={() => bump(1)}
          disabled={disabled || atMax}
          aria-label="Increase"
          tabIndex={-1}
          className={`${chevronBase} border-b border-input-border`}
        >
          <ChevronUp size={13} />
        </button>
        <button
          type="button"
          onClick={() => bump(-1)}
          disabled={disabled || atMin}
          aria-label="Decrease"
          tabIndex={-1}
          className={chevronBase}
        >
          <ChevronDown size={13} />
        </button>
      </div>
    </div>
  );
}
