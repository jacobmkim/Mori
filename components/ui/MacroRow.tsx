import { View, Text } from 'react-native';
import { colors } from '@/constants/theme';
import type { Macros } from '@/types';

interface MacroRowProps {
  macros: Macros;
  compact?: boolean; // compact = single row, full = four-column layout
}

export function MacroRow({ macros, compact = false }: MacroRowProps) {
  if (compact) {
    // Single-line summary used in grocery tally etc.
    return (
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
        <MacroCell label="Cal" value={`${macros.calories}`} />
        <MacroCell label="Pro" value={`${macros.protein}g`} />
        <MacroCell label="Carb" value={`${macros.carbohydrates}g`} />
        <MacroCell label="Fat" value={`${macros.fat}g`} />
      </View>
    );
  }

  return (
    <View>
      <View style={{
        flexDirection: 'row',
        backgroundColor: colors.background,
        borderRadius: 12,
        padding: 12,
        gap: 0,
      }}>
        <MacroColumn label="Calories" value={`${macros.calories}`} />
        <ColumnDivider />
        <MacroColumn label="Protein" value={`${macros.protein}g`} />
        <ColumnDivider />
        <MacroColumn label="Carbs" value={`${macros.carbohydrates}g`} />
        <ColumnDivider />
        <MacroColumn label="Fat" value={`${macros.fat}g`} />
      </View>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 4, textAlign: 'center' }}>
        {macros.isEstimated ? 'Estimated values · may vary' : 'Values may vary · per serving'}
      </Text>
    </View>
  );
}

// One headline macro pill for the swipe card — shows only the macro most
// relevant to the user's primary dietary goal. Returns null if no goal is set
// or if macro data isn't available.
export function HeadlineMacroPill({
  macros,
  dietaryGoals,
}: {
  macros: Macros | null | undefined;
  dietaryGoals: string[];
}) {
  if (!macros) return null;

  // Normalise — stored as snake_case ('high_protein') but check with spaces
  const goals = dietaryGoals.map((g) => g.toLowerCase().replace(/_/g, ' '));

  // Goal IDs are stored as snake_case: high_protein, low_carb, keto, paleo,
  // vegetarian, vegan, balanced, gluten_free, dairy_free, nut_free
  let label: string | null = null;

  if (goals.some((g) => g === 'high protein' || g === 'paleo')) {
    label = `${macros.protein}g protein`;
  } else if (goals.some((g) => g === 'keto')) {
    const netCarbs = macros.netCarbs ?? Math.max(0, macros.carbohydrates - macros.fibre);
    label = `${netCarbs}g net carbs`;
  } else if (goals.some((g) => g === 'low carb')) {
    label = `${macros.carbohydrates}g carbs`;
  } else if (goals.some((g) => g === 'low fat')) {
    label = `${macros.fat}g fat`;
  } else if (goals.some((g) => g === 'balanced' || g === 'vegan' || g === 'vegetarian')) {
    label = `${macros.calories} cal`;
  }

  // gluten_free, dairy_free, nut_free — ingredient filters, no meaningful macro to highlight
  if (!label) return null;

  return (
    <View style={{
      alignSelf: 'flex-start',
      backgroundColor: colors.primary,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      marginBottom: 6,
    }}>
      <Text style={{ color: 'white', fontSize: 12, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function MacroColumn({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 2 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

function MacroCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'baseline' }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: colors.text }}>{value}</Text>
      <Text style={{ fontSize: 11, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}

function ColumnDivider() {
  return (
    <View style={{ width: 1, backgroundColor: colors.border, marginHorizontal: 4, borderRadius: 1 }} />
  );
}
