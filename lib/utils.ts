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

export function getWeekStart(date = new Date()): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split('T')[0];
}
