export function formatTime(prepMins: number | null, cookMins: number | null): string {
  const total = (prepMins ?? 0) + (cookMins ?? 0);
  if (total === 0) return '—';
  if (total < 60) return `${total}m`;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatCost(cost: number | null): string {
  if (cost == null) return '—';
  return `$${cost.toFixed(2)}/serving`;
}

export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// Parse a recipe quantity into a number: plain ("2", "1.5"), simple fraction ("1/2"),
// or mixed ("1 1/2"). Returns null for non-numeric ("to taste", "").
function parseQuantity(q: string): number | null {
  const mixed = q.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = q.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const n = parseFloat(q);
  return Number.isFinite(n) && /^[\d.]/.test(q) ? n : null;
}

// Scale a recipe ingredient's quantity string by an integer factor (for repeated/batched recipes).
// Leaves non-numeric quantities ("to taste", "") untouched; trims trailing zeros on the result.
export function scaleQuantityString(quantity: string | null | undefined, factor: number): string {
  const q = (quantity ?? '').trim();
  if (factor === 1 || q === '') return q;
  const n = parseQuantity(q);
  if (n == null) return q;
  const scaled = n * factor;
  return Number.isInteger(scaled) ? String(scaled) : String(parseFloat(scaled.toFixed(2)));
}

export function getWeekStart(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${dd}`;
}

// Returns the time-of-day bucket for swipe event logging
export function getTimeOfDay(): 'morning' | 'afternoon' | 'evening' | 'night' {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 18) return 'afternoon';
  if (h >= 18 && h < 22) return 'evening';
  return 'night';
}
