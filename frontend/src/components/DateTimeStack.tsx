// Compact two-line date/time block. Rendered per item/row so each shows its
// own timestamp (e.g. a sale item's original draft add-time) without cramping
// a narrow column: the date sits on top, the time below in a smaller muted tone.
function fmtDatePart(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtTimePart(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function DateTimeStack({ iso, className = '' }: { iso: string; className?: string }) {
  return (
    <span className={`inline-flex flex-col leading-tight ${className}`}>
      <span className="text-text-secondary">{fmtDatePart(iso)}</span>
      <span className="text-[11px] text-text-muted">{fmtTimePart(iso)}</span>
    </span>
  );
}
