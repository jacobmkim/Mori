// Presentation logic for the "Mori+" entry row in ProfileSheet — kept as a pure
// function so it's unit-testable without rendering the component.
//
// Returns null when the row should be hidden entirely (kill switch off — the
// whole Mori+ surface stays dark pre-launch). Otherwise returns the row's label,
// icon, and mode: 'manage' once the user is premium, 'upgrade' when not.

export type MoriPlusEntry = {
  label: string;
  icon: string; // Ionicons name
  mode: 'upgrade' | 'manage';
};

export function moriPlusEntry(enabled: boolean, isPremium: boolean): MoriPlusEntry | null {
  if (!enabled) return null;
  return isPremium
    ? { label: 'Mori+ · Active', icon: 'sparkles', mode: 'manage' }
    : { label: 'Upgrade to Mori+', icon: 'sparkles-outline', mode: 'upgrade' };
}
